import { redirect } from "next/navigation";

// Старые закладки и ссылки не показывают форму: отдельной регистрации больше
// нет, аккаунт создаётся автоматически при первом заказе.
export default function RegisterPage() {
  redirect("/login?first-order=1");
}
