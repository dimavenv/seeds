import { redirect } from "next/navigation";

// Страница объединена с «Доставка и оплата».
export default function HowToOrderPage() {
  redirect("/delivery");
}
