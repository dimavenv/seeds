"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getPb } from "@/lib/pb/client";
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

// Слить локальную и серверную корзины: объединяем по id, количество — большее.
function mergeCarts(a: CartItem[], b: CartItem[]): CartItem[] {
  const map = new Map<string, CartItem>();
  for (const it of a) map.set(it.id, { ...it });
  for (const it of b) {
    const ex = map.get(it.id);
    if (ex) ex.qty = Math.max(ex.qty, it.qty);
    else map.set(it.id, { ...it });
  }
  return Array.from(map.values());
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [synced, setSynced] = useState(false);
  // id записи user_store текущего пользователя (создаётся при первом сохранении)
  const [storeRecordId, setStoreRecordId] = useState<string | null>(null);

  // Клиент PocketBase только если он настроен (иначе чистый локальный режим).
  const pb = useMemo(() => (CONFIGURED ? getPb() : null), []);

  // 1) Мгновенная загрузка из localStorage.
  useEffect(() => {
    setCart(onlyStringIds(read<CartItem[]>(CART_KEY, [])));
    setWishlist(read<unknown[]>(WISH_KEY, []).filter(
      (x): x is string => typeof x === "string"
    ));
    setReady(true);
  }, []);

  // 2) Кто вошёл (и реакция на вход/выход).
  useEffect(() => {
    if (!pb) return;
    setUserId(pb.authStore.record?.id ?? null);
    const unsubscribe = pb.authStore.onChange(() => {
      const id = pb.authStore.record?.id ?? null;
      setUserId(id);
      if (!id) {
        setSynced(false); // вышел — позволить пересинк при след. входе
        setStoreRecordId(null);
      }
    });
    return unsubscribe;
  }, [pb]);

  // 3) При входе — слить локальное с серверным (один раз на сессию).
  useEffect(() => {
    if (!pb || !ready || !userId || synced) return;
    let active = true;
    (async () => {
      let record: { id: string; cart?: unknown; wishlist?: unknown } | null = null;
      try {
        record = await pb
          .collection("user_store")
          .getFirstListItem(pb.filter("user = {:u}", { u: userId }));
      } catch {
        record = null; // записи ещё нет
      }
      if (!active) return;
      const serverCart = onlyStringIds(
        Array.isArray(record?.cart) ? (record!.cart as CartItem[]) : []
      );
      const serverWish = (Array.isArray(record?.wishlist) ? record!.wishlist : []
      ).filter((x): x is string => typeof x === "string");
      setStoreRecordId(record?.id ?? null);
      setCart((local) => mergeCarts(local, serverCart));
      setWishlist((local) => Array.from(new Set([...local, ...serverWish])));
      setSynced(true);
    })();
    return () => {
      active = false;
    };
  }, [pb, ready, userId, synced]);

  // 4) Локальное сохранение (всегда — и для гостя, и как кэш).
  useEffect(() => {
    if (ready) localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }, [cart, ready]);
  useEffect(() => {
    if (ready) localStorage.setItem(WISH_KEY, JSON.stringify(wishlist));
  }, [wishlist, ready]);

  // 5) Сквозная запись на сервер (для вошедшего), с дебаунсом.
  useEffect(() => {
    if (!pb || !ready || !userId || !synced) return;
    const t = setTimeout(async () => {
      const payload = { user: userId, cart, wishlist };
      try {
        if (storeRecordId) {
          await pb.collection("user_store").update(storeRecordId, payload);
        } else {
          const rec = await pb.collection("user_store").create(payload);
          setStoreRecordId(rec.id);
        }
      } catch {
        // гонка create (уникальный user) или сеть — попробуем найти запись
        try {
          const rec = await pb
            .collection("user_store")
            .getFirstListItem(pb.filter("user = {:u}", { u: userId }));
          setStoreRecordId(rec.id);
          await pb.collection("user_store").update(rec.id, payload);
        } catch {
          // не судьба — синхронизируем в следующий раз
        }
      }
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, wishlist, userId, synced, ready, storeRecordId]);

  const value = useMemo<StoreContextValue>(() => {
    const cartCount = cart.reduce((s, i) => s + i.qty, 0);
    const cartTotal = cart.reduce((s, i) => s + i.qty * i.price, 0);

    return {
      cart,
      cartCount,
      cartTotal,
      addToCart: (product, qty = 1) =>
        setCart((prev) => {
          const found = prev.find((i) => i.id === product.id);
          if (found) {
            return prev.map((i) =>
              i.id === product.id ? { ...i, qty: i.qty + qty } : i
            );
          }
          return [
            ...prev,
            {
              id: product.id,
              slug: product.slug,
              name: product.name,
              price: product.price,
              image_url: product.image_url,
              qty,
            },
          ];
        }),
      setQty: (id, qty) =>
        setCart((prev) =>
          prev
            .map((i) => (i.id === id ? { ...i, qty: Math.max(1, qty) } : i))
            .filter((i) => i.qty > 0)
        ),
      removeFromCart: (id) =>
        setCart((prev) => prev.filter((i) => i.id !== id)),
      clearCart: () => setCart([]),
      wishlist,
      isWished: (id) => wishlist.includes(id),
      toggleWish: (id) =>
        setWishlist((prev) =>
          prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        ),
      ready,
    };
  }, [cart, wishlist, ready]);

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
