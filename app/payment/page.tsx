import { permanentRedirect } from "next/navigation";

// Оплата объединена со страницей доставки. Почему permanentRedirect (308), а
// не redirect (307) — см. app/how-to-order/page.tsx.
export default function PaymentPage() {
  permanentRedirect("/delivery");
}
