"use client";

import { useState, useTransition } from "react";
import { repairCustomerAccounts } from "@/app/admin/accounts/actions";

export default function RepairAccounts() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ message: string; error?: boolean } | null>(null);
  return <div className="card mb-4 p-4">
    <p className="mb-3 text-sm text-brand-600">Если оплаченный заказ остался без аккаунта или письма с доступом, восстановите его здесь. Пароли существующих покупателей не меняются.</p>
    <button className="btn-outline" disabled={pending} onClick={() => startTransition(async () => {
      try { setResult(await repairCustomerAccounts()); }
      catch { setResult({ message: "Не удалось связаться с сервером. Попробуйте ещё раз.", error: true }); }
    })}>{pending ? "Восстанавливаем…" : "Восстановить доступ по оплаченным заказам"}</button>
    {result && <p role="status" className={`mt-3 text-sm ${result.error ? "text-red-700" : "text-brand-700"}`}>{result.message}</p>}
  </div>;
}
