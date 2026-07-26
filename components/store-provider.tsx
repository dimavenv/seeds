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
import { MAX_QTY_PER_ITEM } from "@/lib/checkout";
import ScrollToTop from "@/components/scroll-to-top";
import type { CartItem, Product } from "@/lib/types";

const CART_KEY = "sc_cart";
const WISH_KEY = "sc_wishlist";
// Для какого пользователя локальная корзина уже слита с серверной. Пока флаг
// совпадает с текущим userId, сервер — источник истины при загрузке страницы.
const SYNC_KEY = "sc_synced_user";
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

// Ограничение количества: целое, не больше известного остатка (если остаток
// неизвестен — не ограничиваем им) и не больше абсолютного потолка сервера
// (MAX_QTY_PER_ITEM — тот же лимит проверяет /api/checkout, чтобы корзина не
// разрослась до абсурда правкой localStorage). Финальную проверку наличия
// делает сервер при оформлении.
function capQty(qty: number, stock: number | null | undefined): number {
  const byMax = Math.min(MAX_QTY_PER_ITEM, Math.floor(qty));
  return typeof stock === "number" && stock >= 0 ? Math.min(byMax, stock) : byMax;
}

// Слить локальную и серверную корзины: объединяем по id, количество — большее
// (в пределах известного остатка).
function mergeCarts(a: CartItem[], b: CartItem[]): CartItem[] {
  const map = new Map<string, CartItem>();
  for (const it of a) map.set(it.id, { ...it });
  for (const it of b) {
    const ex = map.get(it.id);
    if (ex) {
      ex.qty = Math.max(ex.qty, it.qty);
      ex.stock = it.stock ?? ex.stock;
    } else map.set(it.id, { ...it });
  }
  return Array.from(map.values()).map((i) => ({
    ...i,
    qty: Math.max(1, capQty(i.qty, i.stock)),
  }));
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  // Рефы для записи из обработчиков действий (без устаревших замыканий).
  const userIdRef = useRef<string | null>(null);
  // Очередь записей: сериализуем, чтобы быстрые действия не обгоняли друг друга.
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
  // Свежие корзина/избранное для эффекта синхронизации (без их наличия в deps —
  // иначе эффект перезапускался бы на каждое изменение корзины).
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

  // 1) Мгновенная загрузка из localStorage.
  useEffect(() => {
    setCart(onlyStringIds(read<CartItem[]>(CART_KEY, [])));
    setWishlist(read<unknown[]>(WISH_KEY, []).filter(
      (x): x is string => typeof x === "string"
    ));
    setReady(true);
  }, []);

  // Держим свежие значения для эффекта синхронизации ниже. Объявлено ДО него —
  // эффекты в одном коммите выполняются в порядке объявления, поэтому к моменту
  // синхронизации в рефах уже лежит корзина, поднятая из localStorage.
  useEffect(() => {
    cartRef.current = cart;
  }, [cart]);
  useEffect(() => {
    wishRef.current = wishlist;
  }, [wishlist]);

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

      // Верим серверу только если запись действительно есть: иначе (запись
      // удалена/не прочиталась) пустой серверной корзиной затёрли бы локальную.
      const alreadyMerged =
        read<string | null>(SYNC_KEY, null) === data.userId && data.exists;
      if (alreadyMerged) {
        // Не первый заход этого пользователя на этом устройстве — верим серверу.
        setCart(data.cart);
        setWishlist(data.wishlist);
      } else {
        // Первый вход на устройстве: объединяем корзины и сразу сохраняем.
        const merged = mergeCarts(cartRef.current, data.cart);
        const mergedWish = Array.from(
          new Set([...wishRef.current, ...data.wishlist])
        );
        setCart(merged);
        setWishlist(mergedWish);
        try {
          localStorage.setItem(SYNC_KEY, JSON.stringify(data.userId));
        } catch {}
        persist(merged, mergedWish);
      }
    })();
    return () => {
      active = false;
    };
  }, [ready, persist]);

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

    // Каждое действие: считаем новое состояние, показываем его и СРАЗУ пишем
    // на сервер (write-through, без дебаунса).
    const apply = (next: CartItem[]) => {
      setCart(next);
      persist(next, wishlist);
    };

    return {
      cart,
      cartCount,
      cartTotal,
      addToCart: (product, qty = 1) => {
        const found = cart.find((i) => i.id === product.id);
        const next = found
          ? cart.map((i) =>
              i.id === product.id
                ? {
                    ...i,
                    stock: product.stock,
                    qty: Math.max(1, capQty(i.qty + qty, product.stock)),
                  }
                : i
            )
          : [
              ...cart,
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
      setQty: (id, qty) =>
        apply(
          cart
            .map((i) =>
              i.id === id
                ? { ...i, qty: Math.max(1, capQty(qty, i.stock)) }
                : i
            )
            .filter((i) => i.qty > 0)
        ),
      removeFromCart: (id) => apply(cart.filter((i) => i.id !== id)),
      clearCart: () => apply([]),
      wishlist,
      isWished: (id) => wishlist.includes(id),
      toggleWish: (id) => {
        const next = wishlist.includes(id)
          ? wishlist.filter((x) => x !== id)
          : [...wishlist, id];
        setWishlist(next);
        persist(cart, next);
      },
      ready,
    };
  }, [cart, wishlist, ready, persist]);

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
