import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import type { SupportRequest } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminSupport() {
  const supabase = createClient();
  const { data } = await supabase
    .from("support_requests")
    .select("id, name, email, subject, message, status, user_id, created_at")
    .order("created_at", { ascending: false });

  const requests = (data ?? []) as SupportRequest[];

  return (
    <div>
      <h2 className="mb-4 text-lg font-bold text-brand-800">
        Заявки в поддержку ({requests.length})
      </h2>

      {requests.length === 0 ? (
        <div className="card p-6 text-center text-brand-500">
          Заявок пока нет.
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map((r) => (
            <div key={r.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-bold text-brand-800">
                    {r.subject}
                  </div>
                  <div className="text-sm text-brand-500">
                    {formatDate(r.created_at)}
                  </div>
                </div>
                <a
                  href={`mailto:${r.email}?subject=Re: ${encodeURIComponent(r.subject)}`}
                  className="btn-outline !py-1.5"
                >
                  Ответить
                </a>
              </div>

              <div className="mt-3 text-sm text-brand-700">
                <div>
                  <span className="text-brand-500">От:</span> {r.name} ·{" "}
                  <a
                    href={`mailto:${r.email}`}
                    className="text-brand-700 underline hover:text-brand-800"
                  >
                    {r.email}
                  </a>
                </div>
                <p className="mt-2 whitespace-pre-wrap">{r.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
