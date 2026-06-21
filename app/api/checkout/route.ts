import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/data";
import { DELIVERY_COST, normalizeDeliveryMethod } from "@/lib/delivery";
import { encryptField } from "@/lib/crypto";
import type { Product } from "@/lib/types";

type IncomingItem = { id: number; qty: number };

// Привязка заказа к аккаунту — «по возможности»: если getUser долго не отвечает,
// не блокируем оформление (заказ просто будет без user_id).
async function bestEffortUserId(): Promise<string | null> {
  try {
    const authed = createClient();
    const result = await Promise.race([
      authed.auth.getUser(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
    ]);
    if (!result) return null;
    return result.data?.user?.id ?? null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  let body: {
    customer_name?: string;
    phone?: string;
    email?: string;
    address?: string;
    comment?: string;
    delivery_method?: string;
    items?: IncomingItem[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const { customer_name, phone, address, email, comment } = body;
  const delivery_method = normalizeDeliveryMethod(body.delivery_method);
  const items = (body.items ?? [])
    .filter(
      (i) =>
        Number.isFinite(i.id) &&
        Number.isFinite(i.qty) &&
        i.qty > 0 &&
        i.qty <= 1000
    )
    .slice(0, 100);

  if (!customer_name?.trim() || !phone?.trim() || !address?.trim()) {
    return NextResponse.json(
      { error: "Заполните имя, телефон и адрес доставки" },
      { status: 400 }
    );
  }
  if (items.length === 0) {
    return NextResponse.json({ error: "Корзина пуста" }, { status: 400 });
  }

  // Демо-режим без Supabase: считаем по присланным данным недоступно (цены не
  // проверить), поэтому отдаём псевдо-номер по количеству позиций.
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({
      id: Math.floor(Date.now() / 1000) % 1000000,
      total: 0,
      demo: true,
    });
  }

  const isTimeout = (e: unknown) => {
    const t = `${(e as Error)?.name ?? ""} ${(e as Error)?.message ?? ""}`.toLowerCase();
    return t.includes("abort") || t.includes("timeout") || t.includes("fetch failed");
  };

  try {
    const supabase = createServiceClient();

    // Параллельно: авторитетные цены (сервисным ключом, в обход RLS) и
    // best-effort привязка к аккаунту.
    const [{ data: products, error: productsError }, userId] = await Promise.all([
      supabase
        .from("products")
        .select("id, name, price")
        .in("id", items.map((i) => i.id)),
      bestEffortUserId(),
    ]);

    if (productsError) {
      return NextResponse.json(
        { error: "База долго отвечает, попробуйте ещё раз" },
        { status: 503 }
      );
    }

    const priceList = (products ?? []) as Pick<Product, "id" | "name" | "price">[];
    const lines = items
      .map((i) => {
        const p = priceList.find((x) => x.id === i.id);
        if (!p) return null;
        return { product_id: p.id, name: p.name, price: p.price, qty: i.qty };
      })
      .filter(Boolean) as {
      product_id: number;
      name: string;
      price: number;
      qty: number;
    }[];

    if (lines.length === 0) {
      return NextResponse.json({ error: "Товары не найдены" }, { status: 400 });
    }

    const total = lines.reduce((s, l) => s + l.price * l.qty, 0) + DELIVERY_COST;

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        customer_name: customer_name.trim(),
        phone: encryptField(phone.trim()),
        email: encryptField(email?.trim() || null),
        address: encryptField(address.trim()),
        comment: comment?.trim() || null,
        delivery_method,
        delivery_cost: DELIVERY_COST,
        total,
        status: "new",
        user_id: userId,
      })
      .select("id")
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        { error: "Не удалось создать заказ" },
        { status: 500 }
      );
    }

    const { error: itemsError } = await supabase
      .from("order_items")
      .insert(lines.map((l) => ({ ...l, order_id: order.id })));

    if (itemsError) {
      return NextResponse.json(
        { error: "Не удалось сохранить состав заказа" },
        { status: 500 }
      );
    }

    return NextResponse.json({ id: order.id, total });
  } catch (e) {
    return NextResponse.json(
      {
        error: isTimeout(e)
          ? "База долго отвечает, попробуйте ещё раз"
          : "Не удалось создать заказ",
      },
      { status: 503 }
    );
  }
}
