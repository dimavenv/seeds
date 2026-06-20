"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import type { CartItem, Product } from "@/lib/types";

const CART_KEY = "sc_cart";
const WISH_KEY = "sc_wishlist";
const CONFIGURED = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

type StoreContextValue = {
  cart: CartItem[];
  cartCount: number;
  cartTotal: number;
  addToCart: (product: Product, qty?: number) => void;
  setQty: (id: number, qty: number) => void;
  removeFromCart: (id: number) => void;
  clearCart: () => void;
  wishlist: number[];
  isWished: (id: number) => boolean;
  toggleWish: (id: number) => void;
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

// Слить локальную и серверную корзины: объединяем по id, количество — большее.
function mergeCarts(a: CartItem[], b: CartItem[]): CartItem[] {
  const map = new Map<number, CartItem>();
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
  const [wishlist, setWishlist] = useState<number[]>([]);
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [synced, setSynced] = useState(false);

  // Клиент Supabase только если он настроен (иначе чистый локальный режим).
  const supabase = useMemo(() => (CONFIGURED ? createClient() : null), []);

  // 1) Мгновенная загрузка из localStorage.
  useEffect(() => {
    setCart(read<CartItem[]>(CART_KEY, []));
    setWishlist(read<number[]>(WISH_KEY, []));
    setReady(true);
  }, []);

  // 2) Кто вошёл (и реакция на вход/выход).
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (active) setUserId(data.user?.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null);
      if (!session?.user) setSynced(false); // вышел — позволить пересинк при след. входе
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  // 3) При входе — слить локальное с серверным (один раз на сессию).
  useEffect(() => {
    if (!supabase || !ready || !userId || synced) return;
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("user_store")
        .select("cart, wishlist")
        .eq("user_id", userId)
        .maybeSingle();
      if (!active) return;
      const serverCart = (data?.cart ?? []) as CartItem[];
      const serverWish = (data?.wishlist ?? []) as number[];
      setCart((local) => mergeCarts(local, serverCart));
      setWishlist((local) => Array.from(new Set([...local, ...serverWish])));
      setSynced(true);
    })();
    return () => {
      active = false;
    };
  }, [supabase, ready, userId, synced]);

  // 4) Локальное сохранение (всегда — и для гостя, и как кэш).
  useEffect(() => {
    if (ready) localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }, [cart, ready]);
  useEffect(() => {
    if (ready) localStorage.setItem(WISH_KEY, JSON.stringify(wishlist));
  }, [wishlist, ready]);

  // 5) Сквозная запись на сервер (для вошедшего), с дебаунсом.
  useEffect(() => {
    if (!supabase || !ready || !userId || !synced) return;
    const t = setTimeout(() => {
      supabase
        .from("user_store")
        .upsert(
          {
            user_id: userId,
            cart,
            wishlist,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        )
        .then(() => {});
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, wishlist, userId, synced, ready]);

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
    <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
