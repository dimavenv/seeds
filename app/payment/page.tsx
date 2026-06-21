import { redirect } from "next/navigation";

// Оплата объединена со страницей доставки.
export default function PaymentPage() {
  redirect("/delivery");
}
