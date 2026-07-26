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
  capQty,
  consumePendingMerge,
  resolveCartOnLoad,
} from "@/lib/cart-sync";
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

// capQty и слияние корзин живут в lib/cart-sync (там же — правило «слить или
// довериться серверу»), чтобы это поведение покрывалось тестами.

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

  // Мгновенная запись корзины/избранного в базу (для вошедшего пользователя).
  // Вызывается из КАЖДОГО действия с корзиной — очистка и удаление доезжают до
  // сервера сразу, и «воскресшие» корзины остаются в прошлом.
  // Пишет server action по httpOnly-cookie: токен PocketBase в браузере не нужен.
  const persist = useCallback((nextCart: CartItem[], nextWishlist: string[]) => {
    if (!CONFIGURED || !userIdRef.current) return;
    writeQueueRef.current = writeQueueRef.current.then(async () => {
      try {
        await saveUserStore({ cart: nextCart, wishlist: nextWishlist });
      } catch {
        // сеть/сервер недоступны — запишется при следующем действии
      }
    });
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
  }, [ready, persist, setCartSync, setWishSync]);

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

    // Каждое действие: считаем новое состояние ОТ РЕФА (не от замыкания —
    // см. комментарий у cartRef), показываем его и СРАЗУ пишем на сервер
    // (write-through, без дебаунса).
    const apply = (next: CartItem[]) => {
      setCartSync(next);
      persist(next, wishRef.current);
    };

    return {
      cart,
      cartCount,
      cartTotal,
      addToCart: (product, qty = 1) => {
        const cur = cartRef.current;
        const found = cur.find((i) => i.id === product.id);
        const next = found
          ? cur.map((i) =>
              i.id === product.id
                ? {
                    ...i,
                    stock: product.stock,
                    qty: Math.max(1, capQty(i.qty + qty, product.stock)),
                  }
                : i
            )
          : [
              ...cur,
              {
                id: product.id,
                slug: product.slug,
                name: product.name,
                price: product.price,
                image_url: product.image_url,
                stock: product.stock,
                qty: Math.max(1, capQty(qty, product.stock)),
              },
            ];
        apply(next);
      },
      // Количество зажато снизу единицей (capQty) — до нуля позиция не
      // опускается, для удаления есть removeFromCart.
      setQty: (id, qty) =>
        apply(
          cartRef.current.map((i) =>
            i.id === id ? { ...i, qty: Math.max(1, capQty(qty, i.stock)) } : i
          )
        ),
      removeFromCart: (id) =>
        apply(cartRef.current.filter((i) => i.id !== id)),
      clearCart: () => apply([]),
      wishlist,
      isWished: (id) => wishlist.includes(id),
      toggleWish: (id) => {
        const cur = wishRef.current;
        const next = cur.includes(id)
          ? cur.filter((x) => x !== id)
          : [...cur, id];
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
