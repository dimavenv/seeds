import type { OrderRecord } from "@/lib/order-flow";

// Параметр paid в URL — лишь подсказка, а не доказательство оплаты. Очистка
// корзины разрешена только когда сервер нашёл тот же счёт и уже видит в БД
// подтверждённый платёж по тому же номеру заказа.
export function isVerifiedPaidReturn(
  order: OrderRecord | null,
  orderNumber: string,
  invoiceId: number | null
): boolean {
  if (!order || invoiceId === null || order.invoiceId !== invoiceId) return false;
  if (order.paymentStatus !== "paid" && order.paymentStatus !== "refunded") return false;
  return /^\d+$/.test(orderNumber) && order.number === Number(orderNumber);
}
