import { permanentRedirect } from "next/navigation";

// Страница объединена с «Доставка и оплата».
//
// permanentRedirect, а не redirect: тот отдаёт 307 «временно», и поисковик
// продолжает считать старый адрес самостоятельной страницей и ходить по нему.
// 308 говорит, что адрес сменился насовсем, — старый выпадает из индекса, а
// накопленные им сигналы переходят на /delivery.
export default function HowToOrderPage() {
  permanentRedirect("/delivery");
}
