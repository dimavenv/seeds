import { getSession } from "@/lib/auth";
import { pbAdmin } from "@/lib/pb/server";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

// Журнал действий администратора: кто, что и когда менял.
//
// Читаем суперпользователем, а не сессией: правила коллекции разрешают чтение
// администратору, но записи ссылаются на аккаунты, и раскрывать почту через
// expand для обычной сессии незачем — почта автора сохранена прямо в записи.
// Проверку прав всё равно делаем здесь сами: layout — это оформление, а не
// граница доступа.

// Человеческие названия действий. Неизвестный код показываем как есть — так
// новая запись из свежего кода не потеряется в интерфейсе.
const ACTION_LABELS: Record<string, string> = {
  "product.create": "Товар создан",
  "product.update": "Товар изменён",
  "product.delete": "Товар удалён",
  "order.status": "Статус заказа",
  "order.tracking": "Трек-номер",
  "order.refund": "Возврат",
  "order.delete": "Заказ удалён",
  "review.status": "Модерация отзыва",
  "review.delete": "Отзыв удалён",
  "support.reply": "Ответ на заявку",
  "support.delete": "Заявка удалена",
  "promo.create": "Промокод создан",
  "promo.update": "Промокод изменён",
  "promo.enabled": "Промокод вкл/выкл",
  "promo.delete": "Промокод удалён",
  "user.block": "Аккаунт заблокирован",
  "user.unblock": "Аккаунт разблокирован",
  "user.delete": "Аккаунт удалён",
  "settings.vacation": "Режим отпуска",
};

// Опасные действия подсвечиваем — их в первую очередь и проверяют.
const DESTRUCTIVE = new Set([
  "product.delete",
  "order.delete",
  "order.refund",
  "review.delete",
  "support.delete",
  "promo.delete",
  "user.delete",
  "user.block",
]);

type LogRow = {
  id: string;
  action: string;
  actor_email: string;
  target: string;
  summary: string;
  ip: string;
  created: string;
};

export default async function AdminLog() {
  const session = await getSession();
  if (!session.isAdmin) {
    return (
      <div className="card p-6 text-center text-brand-500">Нет доступа.</div>
    );
  }

  let rows: LogRow[] = [];
  let unavailable = false;
  try {
    const pb = await pbAdmin();
    const page = await pb
      .collection("admin_log")
      .getList(1, 200, { sort: "-created" });
    rows = page.items as unknown as LogRow[];
  } catch {
    // Коллекции ещё нет (схему не импортировали) — это не ошибка страницы.
    unavailable = true;
  }

  return (
    <div>
      <h2 className="mb-2 text-lg font-bold text-brand-800">
        Журнал действий <span className="text-brand-400">({rows.length})</span>
      </h2>
      <p className="mb-4 text-sm text-brand-500">
        Последние 200 записей. Журнал только пополняется: изменить или удалить
        запись нельзя ни отсюда, ни через API.
      </p>

      {unavailable ? (
        <div className="card p-6 text-center text-brand-500">
          Журнал ещё не создан в базе. Выполните на сервере{" "}
          <code className="rounded bg-brand-100 px-1">npm run db:schema</code>.
        </div>
      ) : rows.length === 0 ? (
        <div className="card p-6 text-center text-brand-500">
          Записей пока нет.
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-brand-100 text-left text-brand-500">
                <th className="p-3 font-semibold">Когда</th>
                <th className="p-3 font-semibold">Кто</th>
                <th className="p-3 font-semibold">Действие</th>
                <th className="p-3 font-semibold">Объект</th>
                <th className="p-3 font-semibold">Подробности</th>
                <th className="p-3 font-semibold">IP</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-brand-50 align-top">
                  <td className="whitespace-nowrap p-3 text-brand-500">
                    {formatDate(r.created)}
                  </td>
                  <td className="p-3">{r.actor_email || "—"}</td>
                  <td className="p-3">
                    <span
                      className={
                        DESTRUCTIVE.has(r.action)
                          ? "badge bg-red-100 text-red-700 dark:bg-red-400/15 dark:text-red-300"
                          : "badge bg-brand-100 text-brand-700"
                      }
                    >
                      {ACTION_LABELS[r.action] ?? r.action}
                    </span>
                  </td>
                  <td className="p-3">{r.target || "—"}</td>
                  <td className="p-3 text-brand-600">{r.summary || "—"}</td>
                  <td className="whitespace-nowrap p-3 text-brand-400">
                    {r.ip || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
