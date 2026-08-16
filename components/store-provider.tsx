"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { loadUserStore, saveUserStore } from "@/app/store-actions";
import {
  SYNC_KEY,
  clearRemovedPending,
  consumePendingMerge,
  dropMissingProducts,
  nextRemovedPending,
  readRemovedPending,
  resolveCartOnLoad,
  tombstonesToBurn,
  writeRemovedPending,
} from "@/lib/cart-sync";
import { cartReducer, toggleWishlist, type CartAction } from "@/lib/cart-store";
import { GOALS, pushEcommerce, reachGoal } from "@/lib/metrika";
import {
  promoDiscount,
  readStoredPromo,
  writeStoredPromo,
  type PromoRule,
} from "@/lib/promo";
import ScrollToTop from "@/components/scroll-to-top";
import type { CartItem, Product } from "@/lib/types";

const CART_KEY = "sc_cart";
const WISH_KEY = "sc_wishlist";
const CONFIGURED = !!process.env.NEXT_PUBLIC_PB_URL;

type StoreContextValue = {
  cart: CartItem[];
  cartCount: number;
  cartTotal: number;
  addToCart: (product: Product, qty?: number) => void;
  setQty: (id: string, qty: number) => void;
  removeFromCart: (id: string) => void;
  clearCart: () => void;
  wishlist: string[];
  isWished: (id: string) => boolean;
  toggleWish: (id: string) => void;
  ready: boolean;
  // Применённый промокод — ТОЛЬКО для показа скидки в корзине и на оформлении.
  // Описание скидки приходит от сервера (POST /api/promo), а окончательную
  // сумму всё равно считает /api/checkout: подправленный в localStorage объект
  // изменит только картинку, но не цену заказа.
  promo: PromoRule | null;
  // Скидка в рублях от текущей суммы товаров (0, если кода нет или сумма
  // меньше порога).
  discount: number;
  applyPromo: (rule: PromoRule) => void;
  clearPromo: () => void;
};

const StoreContext = createContext<StoreContextValue | null>(null);

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

// ID теперь строковые (PocketBase). Отбрасываем старые числовые id из
// localStorage, оставшиеся после переезда с Supabase, — они больше не находятся.
function onlyStringIds(items: CartItem[]): CartItem[] {
  return items.filter((i) => typeof i.id === "string");
}

// Сама логика корзины — чистый редьюсер в lib/cart-store (покрыт тестами,
// включая регрессию «несколько добавлений в одном тике»); правило «слить или
// довериться серверу» — в lib/cart-sync. Провайдер только склеивает их с React
// и сервером.

// Сколько раз повторяем неудавшуюся запись на сервер, прежде чем сдаться
// (localStorage всё равно хранит актуальную корзину).
const PERSIST_RETRIES = 3;

// Аналитика корзины. Живёт здесь, а не в кнопках: добавить товар можно из
// карточки каталога, со страницы товара и кнопкой «Заказать ещё раз» — единая
// точка отправки гарантирует, что ни один путь не выпадет из статистики.
// Ошибки счётчика внутри reachGoal/pushEcommerce уже проглочены, так что на
// корзину аналитика повлиять не может.
function trackCartAction(action: CartAction, prev: CartItem[]): void {
  if (action.type === "add") {
    const { product } = action;
    const qty = action.qty ?? 1;
    pushEcommerce("add", [
      {
        id: product.id,
        name: product.name,
        price: product.price,
        quantity: qty,
        category: product.category?.name,
      },
    ]);
    reachGoal(GOALS.addToCart, { product: product.name, qty });
    return;
  }
  if (action.type === "remove") {
    // Состав берём из корзины ДО действия — в новой товара уже нет.
    const item = prev.find((i) => i.id === action.id);
    if (!item) return;
    pushEcommerce("remove", [
      { id: item.id, name: item.name, price: item.price, quantity: item.qty },
    ]);
    reachGoal(GOALS.removeFromCart, { product: item.name });
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [promo, setPromo] = useState<PromoRule | null>(null);
  const [ready, setReady] = useState(false);
  // Синхронизация с сервером завершилась (или выяснилось, что синхронизировать
  // не с чем). До этого момента трогать корзину нельзя: запись «на опережение»
  // выглядела бы для резолвера как свежее локальное действие (localIsNewer) и
  // отменила бы слияние с серверной корзиной.
  const [synced, setSynced] = useState(false);

  // Рефы для записи из обработчиков действий (без устаревших замыканий).
  const userIdRef = useRef<string | null>(null);
  // Очередь записей: сериализуем, чтобы быстрые действия не обгоняли друг друга.
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
  // СИНХРОННОЕ зеркало корзины/избранного. Действия читают и пишут именно рефы:
  // несколько вызовов в одном тике (например, «Заказать ещё раз» добавляет весь
  // состав заказа циклом) видят результат друг друга, а не устаревшее состояние
  // из замыкания — иначе React сбатчил бы setState и выжил бы только последний
  // добавленный товар.
  const cartRef = useRef<CartItem[]>([]);
  const wishRef = useRef<string[]>([]);
  // Синхронизацию с сервером запускаем один раз за загрузку страницы.
  const syncStartedRef = useRef(false);

  // Последний снимок, который ещё НЕ подтверждён сервером. Двойная роль:
  //  - flush() всегда пишет именно его (быстрые действия коалесцируются,
  //    сервер получает финальное состояние, а не каждый промежуточный шаг);
  //  - если к моменту ответа loadUserStore() он непустой — пользователь успел
  //    изменить корзину до завершения синхронизации, и локальное состояние
  //    НОВЕЕ серверного снимка (см. эффект синхронизации ниже).
  const desiredRef = useRef<{ cart: CartItem[]; wishlist: string[] } | null>(
    null
  );

  // Записать desiredRef на сервер через очередь. Неудачную запись (сетевая
  // ошибка или ok:false от server action) повторяем с растущей паузой —
  // раньше сбой просто глотался: очищенная корзина не доезжала до PocketBase,
  // и при следующей загрузке «сервер — источник истины» воскрешал удалённое.
  const flush = useCallback((attempt = 0) => {
    writeQueueRef.current = writeQueueRef.current.then(async () => {
      const want = desiredRef.current;
      if (!want || !userIdRef.current) return;
      const res = await saveUserStore(want).catch(() => ({ ok: false }));
      if (res.ok) {
        // Сжигаем надгробия, чьё удаление ДОЕХАЛО в подтверждённом снимке.
        // Правило — чистая функция tombstonesToBurn (покрыта тестами):
        // подтверждение устаревшей записи, где товар ещё лежал, надгробие
        // НЕ трогает — свежая запись с удалением может ещё не пройти.
        const latest = desiredRef.current ?? want;
        const tombs = readRemovedPending();
        const burn = new Set(tombstonesToBurn(tombs, want.cart, latest.cart));
        if (burn.size > 0) {
          writeRemovedPending(tombs.filter((id) => !burn.has(id)));
        }
        // Подтверждён именно этот снимок; более новый (если появился за время
        // запроса) допишет уже его собственный flush из persist().
        if (desiredRef.current === want) desiredRef.current = null;
      } else if (attempt < PERSIST_RETRIES) {
        setTimeout(() => flush(attempt + 1), 2000 * (attempt + 1));
      } else {
        // Запись так и не прошла — на сервере осталась устаревшая корзина.
        // Снимаем метку «уже слито»: следующая загрузка не поверит серверу
        // слепо (trust-server затёр бы локальные изменения), а сольёт его с
        // локальной копией — добавленные товары не потеряются.
        try {
          localStorage.removeItem(SYNC_KEY);
        } catch {}
      }
    });
  }, []);

  // Мгновенная запись корзины/избранного в базу (для вошедшего пользователя).
  // Вызывается из КАЖДОГО действия с корзиной — очистка и удаление доезжают до
  // сервера сразу, и «воскресшие» корзины остаются в прошлом.
  // Пишет server action по httpOnly-cookie: токен PocketBase в браузере не нужен.
  const persist = useCallback(
    (nextCart: CartItem[], nextWishlist: string[]) => {
      if (!CONFIGURED) return;
      desiredRef.current = { cart: nextCart, wishlist: nextWishlist };
      // До завершения loadUserStore() userId ещё неизвестен — снимок остаётся
      // в desiredRef, его допишет эффект синхронизации.
      if (userIdRef.current) flush();
    },
    [flush]
  );

  // Промокод: ссылки на функции стабильны (useCallback) — страница оформления
  // перепроверяет код в useEffect, и «новая функция на каждый рендер» гоняла бы
  // проверку по кругу.
  const applyPromo = useCallback((rule: PromoRule) => {
    setPromo(rule);
    writeStoredPromo(rule);
  }, []);
  const clearPromo = useCallback(() => {
    setPromo(null);
    writeStoredPromo(null);
  }, []);

  // Единые сеттеры: обновляют реф синхронно, состояние — как обычно.
  const setCartSync = useCallback((next: CartItem[]) => {
    cartRef.current = next;
    setCart(next);
  }, []);
  const setWishSync = useCallback((next: string[]) => {
    wishRef.current = next;
    setWishlist(next);
  }, []);

  // 1) Мгновенная загрузка из localStorage.
  useEffect(() => {
    setCartSync(onlyStringIds(read<CartItem[]>(CART_KEY, [])));
    setWishSync(
      read<unknown[]>(WISH_KEY, []).filter(
        (x): x is string => typeof x === "string"
      )
    );
    // Промокод храним только локально: он привязан к аккаунту, а не к
    // устройству, и сервер всё равно перепроверяет его при оформлении.
    setPromo(readStoredPromo());
    setReady(true);
  }, [setCartSync, setWishSync]);

  // 2) Кто вошёл + серверная корзина — одним запросом к server action (сессия
  //    берётся из httpOnly-cookie, токен в браузере не нужен).
  //    При первом входе на устройстве локальное сливается с серверным и сразу
  //    записывается. Дальше сервер — источник истины: корзину подменяем
  //    серверной, чтобы очищенное на другом устройстве или до перезагрузки не
  //    «воскресало» из localStorage.
  useEffect(() => {
    if (!CONFIGURED || !ready || syncStartedRef.current) return;
    syncStartedRef.current = true;
    let active = true;
    const sync = async () => {
      const data = await loadUserStore().catch(() => null);
      if (!active) return;
      if (!data || !data.signedIn || !data.userId) {
        // Гость (или сервер недоступен): серверную корзину не трогаем, а метку
        // слияния снимаем — чтобы следующий вход снова слил локальное с серверным.
        userIdRef.current = null;
        if (data && !data.signedIn) {
          try {
            localStorage.removeItem(SYNC_KEY);
          } catch {}
          // Гостевые надгробия чистим: они не должны при будущем входе стирать
          // товары, лежащие в корзине аккаунта независимо от гостя.
          clearRemovedPending();
        }
        return;
      }

      userIdRef.current = data.userId;

      // Правило принятия решения — чистая функция в lib/cart-sync (покрыта
      // тестами): keep-local (локальные действия свежее серверного снимка),
      // trust-server (метка совпадает — сервер источник истины) или merge
      // (только что вошли / метки нет). Надгробия удалённых товаров вычитаются
      // из серверной копии, чтобы неподтверждённое удаление не воскресало.
      const justLoggedIn = consumePendingMerge();
      const removedPending = readRemovedPending();
      // При входе в аккаунт гостевые надгробия сгорают (резолвер их и так
      // игнорирует — см. комментарий там).
      if (justLoggedIn) clearRemovedPending();

      const resolved = resolveCartOnLoad({
        localCart: cartRef.current,
        localWishlist: wishRef.current,
        serverCart: data.cart,
        serverWishlist: data.wishlist,
        serverExists: data.exists,
        syncedUser: read<string | null>(SYNC_KEY, null),
        userId: data.userId,
        justLoggedIn,
        localIsNewer: desiredRef.current !== null,
        removedPending,
      });

      if (resolved.action === "keep-local") {
        // Показываем локальное как есть (оно уже на экране) и дописываем на
        // сервер неподтверждённый снимок из desiredRef.
        try {
          localStorage.setItem(SYNC_KEY, JSON.stringify(data.userId));
        } catch {}
        flush();
        return;
      }

      setCartSync(resolved.cart);
      setWishSync(resolved.wishlist);
      if (resolved.action === "merge" || removedPending.length > 0) {
        // Слитый (или очищенный от надгробий) результат сразу закрепляем на
        // сервере и помечаем устройство. Надгробия сгорят при подтверждении
        // этой записи (см. flush); если она не пройдёт — сработают снова.
        try {
          localStorage.setItem(SYNC_KEY, JSON.stringify(data.userId));
        } catch {}
        persist(resolved.cart, resolved.wishlist);
      }
    };
    sync().finally(() => {
      if (active) setSynced(true);
    });
    return () => {
      active = false;
    };
  }, [ready, persist, flush, setCartSync, setWishSync]);

  // 2б) Товары, удалённые из каталога, убираем из корзины и избранного.
  //     Серверную копию (user_store) чистит сама админка при удалении товара —
  //     см. lib/user-store-cleanup.ts, — но у покупателя есть ещё копия в
  //     localStorage, до которой сервер не дотянется. Поэтому сверяемся с
  //     каталогом здесь: один запрос за загрузку страницы (повторяется, только
  //     если состав корзины изменился).
  //
  //     Ответ «не удалось проверить» (503, сеть, битый JSON) НЕ считается
  //     ответом «товаров нет»: корзину в этом случае не трогаем вовсе, а метку
  //     сбрасываем, чтобы проверка повторилась.
  const checkedRef = useRef("");
  useEffect(() => {
    if (!CONFIGURED || !ready || !synced) return;
    const ids = Array.from(new Set([...cart.map((i) => i.id), ...wishlist]));
    if (ids.length === 0) {
      checkedRef.current = "";
      return;
    }
    const signature = [...ids].sort().join(",");
    if (checkedRef.current === signature) return;
    checkedRef.current = signature;

    let active = true;
    (async () => {
      const res = await fetch(
        `/api/products?exists=${encodeURIComponent(ids.join(","))}`
      ).catch(() => null);
      const data = res?.ok ? await res.json().catch(() => null) : null;
      if (!active) return;
      if (!Array.isArray(data?.ids)) {
        checkedRef.current = "";
        return;
      }
      // Считаем от РЕФОВ, а не от cart/wishlist из замыкания: пока шёл запрос,
      // покупатель мог что-то добавить. Правило (и защита от того, чтобы
      // добавленное за это время не сочли удалённым) — в lib/cart-sync.
      const next = dropMissingProducts({
        cart: cartRef.current,
        wishlist: wishRef.current,
        checkedIds: ids,
        existingIds: data.ids as string[],
      });
      if (!next.changed) return;
      writeRemovedPending(
        nextRemovedPending(readRemovedPending(), cartRef.current, next.cart)
      );
      setCartSync(next.cart);
      setWishSync(next.wishlist);
      persist(next.cart, next.wishlist);
    })();
    return () => {
      active = false;
    };
  }, [ready, synced, cart, wishlist, persist, setCartSync, setWishSync]);

  // 3) Локальное сохранение (всегда — и для гостя, и как кэш).
  useEffect(() => {
    if (ready) localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }, [cart, ready]);
  useEffect(() => {
    if (ready) localStorage.setItem(WISH_KEY, JSON.stringify(wishlist));
  }, [wishlist, ready]);

  // 4) Другие вкладки. Событие storage приходит, когда localStorage меняет
  // ДРУГАЯ вкладка (в пишущей оно не срабатывает) — подхватываем её
  // корзину/избранное в своё состояние И В РЕФЫ. Без этого вкладка Б держала
  // бы в памяти устаревшую копию: её следующее действие записало бы на сервер
  // снимок с товаром, только что удалённым во вкладке А, и заодно стёрло бы
  // его надгробие (для Б товар «лежит в корзине»). Петля не возникает:
  // приёмник сохраняет тот же сериализованный JSON, а storage срабатывает
  // только при реальном изменении значения. persist здесь не зовём — свою
  // запись вкладка-автор уже отправила. Остаточное окно — миллисекунды до
  // доставки события (см. «Осознанные ограничения» в lib/cart-sync).
  useEffect(() => {
    if (!ready) return;
    const onStorage = (e: StorageEvent) => {
      if (e.newValue === null) return; // ключ удалили — не наш случай
      try {
        if (e.key === CART_KEY) {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) setCartSync(onlyStringIds(parsed));
        } else if (e.key === WISH_KEY) {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) {
            setWishSync(
              parsed.filter((x): x is string => typeof x === "string")
            );
          }
        }
      } catch {
        // битый JSON от чужого кода — игнорируем
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [ready, setCartSync, setWishSync]);

  const value = useMemo<StoreContextValue>(() => {
    const cartCount = cart.reduce((s, i) => s + i.qty, 0);
    const cartTotal = cart.reduce((s, i) => s + i.qty * i.price, 0);
    const discount = promo ? promoDiscount(promo, cartTotal) : 0;

    // Каждое действие: редьюсер считает новое состояние ОТ РЕФА (не от
    // замыкания — см. комментарий у cartRef), показываем его и СРАЗУ пишем на
    // сервер (write-through, без дебаунса).
    const dispatch = (action: CartAction) => {
      const prev = cartRef.current;
      const next = cartReducer(prev, action);
      // Надгробия удалённых товаров (переживают перезагрузку): если запись на
      // сервер не дойдёт, при следующей загрузке удалённое вычтется из
      // устаревшей серверной копии, а не воскреснет. См. lib/cart-sync.
      writeRemovedPending(nextRemovedPending(readRemovedPending(), prev, next));
      setCartSync(next);
      persist(next, wishRef.current);
      trackCartAction(action, prev);
    };

    return {
      cart,
      cartCount,
      cartTotal,
      addToCart: (product, qty = 1) => dispatch({ type: "add", product, qty }),
      setQty: (id, qty) => dispatch({ type: "set-qty", id, qty }),
      removeFromCart: (id) => dispatch({ type: "remove", id }),
      clearCart: () => dispatch({ type: "clear" }),
      wishlist,
      isWished: (id) => wishlist.includes(id),
      toggleWish: (id) => {
        // Считаем только добавление: «убрал из избранного» — не то действие,
        // ради которого смотрят отчёт по цели. Признак берём ДО setWishSync:
        // он обновляет wishRef синхронно, и после вызова сравнивать уже не с чем.
        const added = !wishRef.current.includes(id);
        const next = toggleWishlist(wishRef.current, id);
        setWishSync(next);
        persist(cartRef.current, next);
        if (added) reachGoal(GOALS.addToFavorites, { product_id: id });
      },
      ready,
      promo,
      discount,
      applyPromo,
      clearPromo,
    };
  }, [
    cart,
    wishlist,
    promo,
    ready,
    persist,
    setCartSync,
    setWishSync,
    applyPromo,
    clearPromo,
  ]);

  return (
    <StoreContext.Provider value={value}>
      {children}
      {/* Глобальная кнопка «наверх» — провайдер обёрнут вокруг всех страниц.
          Монтируем здесь, а не в layout.tsx, чтобы не пересекаться с правками
          layout в параллельных ветках. */}
      <ScrollToTop />
    </StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
