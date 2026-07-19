import type PocketBase from "pocketbase";
import { mapOrder, mapOrderItem } from "@/lib/pb/shared";
import type { Order, OrderItem } from "@/lib/types";

// Заказы с составом. PocketBase не делает join — состав тянем отдельным
// запросом и группируем по заказу (правила доступа применяются к обоим).
export async function fetchOrdersWithItems(
  pb: PocketBase,
  opts: { ordersFilter?: string; itemsFilter?: string; limit?: number } = {}
): Promise<Order[]> {
  const query = { sort: "-placed_at", filter: opts.ordersFilter ?? "" };
  const records = opts.limit
    ? (await pb.collection("orders").getList(1, opts.limit, query)).items
    : await pb.collection("orders").getFullList(query);

  if (records.length === 0) return [];

  const itemRecords = await pb.collection("order_items").getFullList({
    filter: opts.itemsFilter ?? "",
  });
  const byOrder = new Map<string, OrderItem[]>();
  for (const r of itemRecords) {
    const item = mapOrderItem(r);
    const list = byOrder.get(item.order_id) ?? [];
    list.push(item);
    byOrder.set(item.order_id, list);
  }

  return records.map((r) => mapOrder(r, byOrder.get(r.id) ?? []));
}
