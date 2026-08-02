"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deletePromo, setPromoEnabled } from "@/app/admin/actions";
import { formatDateRu } from "@/lib/format";
import { promoLabel, promoStatus, type PromoStatus } from "@/lib/promo";
import PromoForm from "@/components/admin/promo-form";
import type { PromoRecord } from "@/lib/promo-server";

const STATUS_TEXT: Record<PromoStatus, string> = {
  active: "Действует",
  disabled: "Выключен",
  scheduled: "Ещё не начался",
  expired: "Истёк",
};

const STATUS_CLASS: Record<PromoStatus, string> = {
  active: "bg-brand-500/15 text-brand-600",
  disabled: "bg-brand-100 text-brand-500",
  scheduled: "bg-accent-500/15 text-accent-600",
  expired: "bg-brand-100 text-brand-500",
};

export default function PromosTable({
  promos,
  usage,
}: {
  promos: PromoRecord[];
  // Код → сколько заказов с ним прошло.
  usage: Record<string, number>;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-brand-800">Промокоды</h2>
            <p className="mt-1 text-sm text-brand-500">
              Скидка снимается только с товаров — доставка не дешевеет.
            </p>
          </div>
          {!creating && (
            <button
              type="button"
              onClick={() => {
                setCreating(true);
                setEditing(null);
              }}
              className="btn-accent !py-2"
            >
              + Новый промокод
            </button>
          )}
        </div>

        {creating && (
          <div className="mt-4 border-t border-brand-100 pt-4">
            <PromoForm onDone={() => setCreating(false)} />
          </div>
        )}
      </div>

      {promos.length === 0 && !creating && (
        <div className="card p-5 text-sm text-brand-500">
          Промокодов пока нет. Нажмите «Новый промокод» — код заработает сразу
          после сохранения.
        </div>
      )}

      {promos.map((promo) => (
        <PromoRow
          key={promo.id || promo.code}
          promo={promo}
          used={usage[promo.code] ?? 0}
          editing={editing === promo.id}
          onEdit={() => {
            setEditing(promo.id);
            setCreating(false);
          }}
          onClose={() => setEditing(null)}
        />
      ))}
    </div>
  );
}

function PromoRow({
  promo,
  used,
  editing,
  onEdit,
  onClose,
}: {
  promo: PromoRecord;
  used: number;
  editing: boolean;
  onEdit: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const status = promoStatus(promo);
  // Код из переменных окружения (пока в базе нет ни одного) правке не
  // подлежит: его id пустой, и записи в базе за ним не стоит.
  const fromEnv = !promo.id;

  const conditions = [
    promo.minSubtotal > 0 && `от ${promo.minSubtotal} ₽`,
    promo.firstOrderOnly && "только первый заказ",
    promo.oncePerUser && "один раз на аккаунт",
    promo.authOnly && !promo.oncePerUser && !promo.firstOrderOnly && "с аккаунтом",
    !promo.authOnly && "можно гостям",
    promo.maxUses > 0 && `лимит ${promo.maxUses}`,
  ].filter(Boolean) as string[];

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded bg-brand-100 px-2 py-1 font-bold text-brand-800">
              {promo.code}
            </code>
            <span className={`badge ${STATUS_CLASS[status]}`}>
              {STATUS_TEXT[status]}
            </span>
            <span className="font-semibold text-brand-700">
              {promoLabel(promo)}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-brand-500">
            <span>
              {promo.startsAt || promo.expiresAt ? (
                <>
                  {promo.startsAt ? `c ${formatDateRu(promo.startsAt)}` : "без начала"}
                  {" · "}
                  {promo.expiresAt
                    ? `по ${formatDateRu(promo.expiresAt)}`
                    : "бессрочно"}
                </>
              ) : (
                "бессрочно"
              )}
            </span>
            <span>
              Использован: <b className="text-brand-700">{used}</b>
              {promo.maxUses > 0 && ` из ${promo.maxUses}`}
            </span>
          </div>

          {conditions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {conditions.map((c) => (
                <span
                  key={c}
                  className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs text-brand-600"
                >
                  {c}
                </span>
              ))}
            </div>
          )}

          {promo.note && (
            <p className="mt-2 text-sm text-brand-400">{promo.note}</p>
          )}
        </div>

        {fromEnv ? (
          <p className="max-w-xs text-xs text-brand-400">
            Код задан переменными окружения на сервере. Создайте промокод здесь —
            и управление перейдёт в админку.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await setPromoEnabled(promo.id, !promo.enabled);
                  router.refresh();
                })
              }
              className="btn-outline !py-1.5 !text-sm"
            >
              {promo.enabled ? "Выключить" : "Включить"}
            </button>
            <button
              type="button"
              onClick={editing ? onClose : onEdit}
              className="btn-outline !py-1.5 !text-sm"
            >
              {editing ? "Свернуть" : "Изменить"}
            </button>
            {confirming ? (
              <>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      await deletePromo(promo.id);
                      router.refresh();
                    })
                  }
                  className="btn !py-1.5 !text-sm bg-accent-500 text-white hover:bg-accent-600"
                >
                  {pending ? "Удаление…" : "Точно удалить"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="btn-outline !py-1.5 !text-sm"
                >
                  Отмена
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="btn-outline !py-1.5 !text-sm"
              >
                Удалить
              </button>
            )}
          </div>
        )}
      </div>

      {editing && (
        <div className="mt-4 border-t border-brand-100 pt-4">
          <PromoForm promo={promo} onDone={onClose} />
        </div>
      )}
    </div>
  );
}
