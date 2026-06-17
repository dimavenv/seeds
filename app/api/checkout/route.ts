import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getProductsByIds } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/data";

type IncomingItem = { id: number; qty: number };

export async function POST(request: Request) {
  let body: {
    customer_name?: string;
    phone?: string;
    email?: string;
    address?: string;
    comment?: string;
    items?: IncomingItem[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const { customer_name, phone, address, email, comment } = body;
  const items = (body.items ?? []).filter(
    (i) => Number.isFinite(i.id) && Number.isFinite(i.qty) && i.qty > 0
  );

  if (!customer_name?.trim() || !phone?.trim() || !address?.trim()) {
    return NextResponse.json(
      { error: "Заполните имя, телефон и адрес доставки" },
      { status: 400 }
    );
  }
  if (items.length === 0) {
    return NextResponse.json({ error: "Корзина пуста" }, { status: 400 });
  }

  // Авторитетные цены берём с сервера, не доверяя клиенту.
  const products = await getProductsByIds(items.map((i) => i.id));
  const lines = items
    .map((i) => {
      const p = products.find((x) => x.id === i.id);
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

  const total = lines.reduce((s, l) => s + l.price * l.qty, 0);

  // Демо-режим без Supabase: возвращаем псевдо-номер заказа.
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({
      id: Math.floor(Date.now() / 1000) % 1000000,
      total,
      demo: true,
    });
  }

  const supabase = createServiceClient();
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      customer_name: customer_name.trim(),
      phone: phone.trim(),
      email: email?.trim() || null,
      address: address.trim(),
      comment: comment?.trim() || null,
      total,
      status: "new",
    })
    .select("id")
    .single();

  if (orderError || !order) {
    return NextResponse.json(
      { error: "Не удалось создать заказ" },
      { status: 500 }
    );
  }

  const { error: itemsError } = await supabase.from("order_items").insert(
    lines.map((l) => ({ ...l, order_id: order.id }))
  );

  if (itemsError) {
    return NextResponse.json(
      { error: "Не удалось сохранить состав заказа" },
      { status: 500 }
    );
  }

  return NextResponse.json({ id: order.id, total });
}
