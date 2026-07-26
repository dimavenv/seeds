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
  consumePendingMerge,
  resolveCartOnLoad,
} from "@/lib/cart-sync";
import { cartReducer, toggleWishlist, type CartAction } from "@/lib/cart-store";
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

export function StoreProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

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
    (async () => {
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
        }
        return;
      }

      userIdRef.current = data.userId;

      // Пользователь успел изменить корзину, ПОКА грузился серверный снимок
      // (в desiredRef лежит неподтверждённая локальная запись): локальное
      // состояние новее серверного — не перетираем его (иначе удалённое в эти
      // секунды «воскресало» бы), а наоборот дописываем на сервер.
      if (desiredRef.current) {
        try {
          localStorage.setItem(SYNC_KEY, JSON.stringify(data.userId));
        } catch {}
        flush();
        return;
      }

      // Правило слияния — в lib/cart-sync (покрыто тестами):
      //  - только что вошли на этом устройстве → ВСЕГДА слить (гостевые товары
      //    не теряем, даже если у аккаунта уже есть непустая корзина);
      //  - иначе, если запись есть и метка совпадает → сервер источник истины
      //    (удалённое на другом устройстве не «воскресает»).
      const resolved = resolveCartOnLoad({
        localCart: cartRef.current,
        localWishlist: wishRef.current,
        serverCart: data.cart,
        serverWishlist: data.wishlist,
        serverExists: data.exists,
        syncedUser: read<string | null>(SYNC_KEY, null),
        userId: data.userId,
        justLoggedIn: consumePendingMerge(),
      });

      setCartSync(resolved.cart);
      setWishSync(resolved.wishlist);
      if (resolved.action === "merge") {
        // Слитый результат сразу закрепляем на сервере и помечаем устройство.
        try {
          localStorage.setItem(SYNC_KEY, JSON.stringify(data.userId));
        } catch {}
        persist(resolved.cart, resolved.wishlist);
      }
    })();
    return () => {
      active = false;
    };
  }, [ready, persist, flush, setCartSync, setWishSync]);

  // 3) Локальное сохранение (всегда — и для гостя, и как кэш).
  useEffect(() => {
    if (ready) localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }, [cart, ready]);
  useEffect(() => {
    if (ready) localStorage.setItem(WISH_KEY, JSON.stringify(wishlist));
  }, [wishlist, ready]);

  const value = useMemo<StoreContextValue>(() => {
    const cartCount = cart.reduce((s, i) => s + i.qty, 0);
    const cartTotal = cart.reduce((s, i) => s + i.qty * i.price, 0);

    // Каждое действие: редьюсер считает новое состояние ОТ РЕФА (не от
    // замыкания — см. комментарий у cartRef), показываем его и СРАЗУ пишем на
    // сервер (write-through, без дебаунса).
    const dispatch = (action: CartAction) => {
      const next = cartReducer(cartRef.current, action);
      setCartSync(next);
      persist(next, wishRef.current);
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
        const next = toggleWishlist(wishRef.current, id);
        setWishSync(next);
        persist(cartRef.current, next);
      },
      ready,
    };
  }, [cart, wishlist, ready, persist, setCartSync, setWishSync]);

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
