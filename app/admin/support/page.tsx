import { createServerPb } from "@/lib/pb/server";
import { mapSupportRequest } from "@/lib/pb/shared";
import { formatDate } from "@/lib/format";
import { decryptField } from "@/lib/crypto";
import type { SupportRequest } from "@/lib/types";
import DeleteButton from "@/components/admin/delete-button";
import SupportReply from "@/components/admin/support-reply";
import { deleteSupportRequest } from "@/app/admin/actions";

export const dynamic = "force-dynamic";

export default async function AdminSupport() {
  const pb = createServerPb();
  let requests: SupportRequest[] = [];
  try {
    const list = await pb
      .collection("support_requests")
      .getFullList({ sort: "-created" });
    requests = list.map(mapSupportRequest);
  } catch {
    requests = [];
  }

  const answered = (r: SupportRequest) => Boolean(r.reply || r.replied_at);
  // Неотвеченные — сверху (внутри групп сортировка по дате уже есть).
  const sorted = [...requests].sort(
    (a, b) => Number(answered(a)) - Number(answered(b))
  );
  const openCount = requests.filter((r) => !answered(r)).length;

  return (
    <div>
      <h2 className="mb-4 text-lg font-bold text-brand-800">
        Заявки в поддержку <span className="text-brand-400">({requests.length})</span>
        {openCount > 0 && (
          <span className="ml-2 badge bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">
            {openCount} без ответа
          </span>
        )}
      </h2>

      {requests.length === 0 ? (
        <div className="card p-6 text-center text-brand-500">
          Заявок пока нет.
        </div>
      ) : (
        <div className="space-y-4">
          {sorted.map((r) => {
            const email = decryptField(r.email) ?? "";
            const message = decryptField(r.message);
            const reply = r.reply ? decryptField(r.reply) : null;
            const isAnswered = answered(r);
            return (
              <div
                key={r.id}
                className={`card p-5 ${isAnswered ? "opacity-90" : ""}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-lg font-bold text-brand-800">
                        {r.subject}
                      </span>
                      {isAnswered ? (
                        <span className="badge bg-brand-600 text-white">Отвечено</span>
                      ) : (
                        <span className="badge bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">Ждёт ответа</span>
                      )}
                    </div>
                    <div className="text-sm text-brand-500">
                      {formatDate(r.created_at)} · {r.name} ·{" "}
                      <a
                        href={`mailto:${email}`}
                        className="text-brand-700 underline hover:text-brand-800"
                      >
                        {email}
                      </a>
                    </div>
                  </div>
                  <DeleteButton
                    action={deleteSupportRequest.bind(null, r.id)}
                    confirmText={`Точно удалить заявку «${r.subject}» из базы? Действие необратимо.`}
                  >
                    Удалить
                  </DeleteButton>
                </div>

                {/* Вопрос покупателя */}
                <div className="mt-3 rounded-xl bg-brand-100/40 p-3">
                  <p className="whitespace-pre-wrap text-sm text-brand-700">{message}</p>
                </div>

                {/* Ответ: уже отправленный и/или форма нового */}
                <SupportReply
                  id={r.id}
                  email={email}
                  existing={reply ? { text: reply, at: r.replied_at ?? null } : null}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
