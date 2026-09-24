"use server";

import { getSession } from "@/lib/auth";
import { pbAdmin } from "@/lib/pb/server";
import { repairPaidAccounts } from "@/lib/auto-account";
import { retryAccountWelcomes } from "@/lib/account-welcome";
import { revalidatePath } from "next/cache";

export async function repairCustomerAccounts(): Promise<{ message: string; error?: boolean }> {
  const session = await getSession();
  if (!session.isAdmin) return { message: "Нет доступа", error: true };
  try {
    const pb = await pbAdmin();
    const accounts = await repairPaidAccounts(pb);
    const welcome = await retryAccountWelcomes(pb);
    revalidatePath("/admin/accounts");
    revalidatePath("/admin/orders");
    const failed = accounts.failed + welcome.failed;
    return {
      message: `Восстановлено заказов с доступом: ${accounts.repaired}. Повторно обработано писем: ${welcome.sent}.` +
        (failed ? ` Ошибок: ${failed}. Проверьте SMTP и схему PocketBase; затем повторите.` : " Проверка завершена (до 50 заказов за запуск)."),
      error: failed > 0,
    };
  } catch {
    return { message: "Не удалось восстановить аккаунты. Проверьте импорт схемы PocketBase и серверные логи.", error: true };
  }
}
