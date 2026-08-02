"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { savePromo } from "@/app/admin/actions";
import type { PromoRecord } from "@/lib/promo-server";

// Форма промокода: создание и правка одним компонентом.
//
// Проверки здесь — подсказки, а не защита: всё, что важно (что скидка задана
// ровно одна, что даты не перепутаны, что код не дублируется), сервер
// перепроверяет в savePromo. Форма лишь не даёт нажать «Сохранить» ради
// заведомо неверного запроса.
export default function PromoForm({
  promo,
  onDone,
}: {
  promo?: PromoRecord;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Тип скидки — переключатель: процент ИЛИ рубли. Два поля рядом всегда
  // заканчиваются вопросом «а если заполнить оба».
  const [kind, setKind] = useState<"percent" | "amount">(
    promo && promo.amount > 0 && promo.percent === 0 ? "amount" : "percent"
  );
  const [oncePerUser, setOncePerUser] = useState(promo?.oncePerUser ?? true);
  const [firstOrderOnly, setFirstOrderOnly] = useState(
    promo?.firstOrderOnly ?? false
  );

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    // Незадействованное поле скидки обнуляем: иначе при переключении типа в
    // базу уехали бы оба значения сразу.
    formData.set(kind === "percent" ? "amount" : "percent", "");

    const res = await savePromo({}, formData);
    if (res.error) {
      setError(res.error);
      setSaving(false);
      return;
    }
    router.refresh();
    onDone?.();
  }

  // «Один раз на аккаунт» и «только первый заказ» требуют аккаунта — вход
  // тогда обязателен, и галочку показываем включённой и заблокированной.
  const authForced = oncePerUser || firstOrderOnly;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {promo && <input type="hidden" name="id" value={promo.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-brand-700">
            Промокод *
          </span>
          <input
            name="code"
            required
            defaultValue={promo?.code}
            placeholder="ВЕСНА25"
            autoCapitalize="characters"
            className="input uppercase"
          />
          <span className="mt-1 block text-xs text-brand-400">
            Регистр и пробелы неважны: покупатель может ввести «весна 25».
          </span>
        </label>

        <div>
          <span className="mb-1 block text-sm font-semibold text-brand-700">
            Скидка *
          </span>
          <div className="flex gap-2">
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as "percent" | "amount")}
              className="input !w-auto"
              aria-label="Тип скидки"
            >
              <option value="percent">Процент</option>
              <option value="amount">Рубли</option>
            </select>
            {kind === "percent" ? (
              <input
                key="percent"
                name="percent"
                type="number"
                min={1}
                max={90}
                required
                defaultValue={promo?.percent || ""}
                placeholder="10"
                className="input"
              />
            ) : (
              <input
                key="amount"
                name="amount"
                type="number"
                min={1}
                required
                defaultValue={promo?.amount || ""}
                placeholder="300"
                className="input"
              />
            )}
          </div>
          <span className="mt-1 block text-xs text-brand-400">
            Скидка снимается только с товаров — доставка не дешевеет.
          </span>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-brand-700">
            Действует с
          </span>
          <input
            name="starts_at"
            type="date"
            defaultValue={promo?.startsAt || ""}
            className="input"
          />
          <span className="mt-1 block text-xs text-brand-400">
            Пусто — работает сразу.
          </span>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-brand-700">
            Действует по
          </span>
          <input
            name="expires_at"
            type="date"
            defaultValue={promo?.expiresAt || ""}
            className="input"
          />
          <span className="mt-1 block text-xs text-brand-400">
            Включительно. Пусто — бессрочно.
          </span>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-brand-700">
            Минимальная сумма заказа, ₽
          </span>
          <input
            name="min_subtotal"
            type="number"
            min={0}
            defaultValue={promo?.minSubtotal || ""}
            placeholder="0"
            className="input"
          />
          <span className="mt-1 block text-xs text-brand-400">
            Считается по товарам, без доставки. 0 — без условия.
          </span>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-brand-700">
            Всего применений
          </span>
          <input
            name="max_uses"
            type="number"
            min={0}
            defaultValue={promo?.maxUses || ""}
            placeholder="0"
            className="input"
          />
          <span className="mt-1 block text-xs text-brand-400">
            Сколько заказов всего может пройти с этим кодом. 0 — без лимита.
          </span>
        </label>
      </div>

      <fieldset className="space-y-2 rounded-xl bg-brand-50 p-4">
        <legend className="px-1 text-sm font-semibold text-brand-700">
          Условия
        </legend>

        <Check
          name="once_per_user"
          checked={oncePerUser}
          onChange={setOncePerUser}
          label="Один раз на аккаунт"
          hint="Каждый покупатель может воспользоваться кодом только однажды."
        />
        <Check
          name="first_order_only"
          checked={firstOrderOnly}
          onChange={setFirstOrderOnly}
          label="Только на первый заказ"
          hint="Код сработает, если у покупателя ещё нет ни одного заказа."
        />
        <Check
          name="auth_only"
          checked={authForced ? true : undefined}
          defaultChecked={promo?.authOnly ?? true}
          disabled={authForced}
          label="Только для покупателей с аккаунтом"
          hint={
            authForced
              ? "Включено принудительно: условия выше проверяются по аккаунту."
              : "Без галочки кодом смогут воспользоваться и гости."
          }
        />
        <Check
          name="enabled"
          defaultChecked={promo?.enabled ?? true}
          label="Код включён"
          hint="Выключенный код остаётся в списке, но не работает."
        />
      </fieldset>

      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-brand-700">
          Заметка для себя
        </span>
        <input
          name="note"
          maxLength={200}
          defaultValue={promo?.note}
          placeholder="Например: рассылка ко Дню садовода"
          className="input"
        />
      </label>

      {error && (
        <p role="alert" className="alert-error">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? "Сохранение…" : promo ? "Сохранить" : "Создать промокод"}
        </button>
        {onDone && (
          <button type="button" onClick={onDone} className="btn-outline">
            Отмена
          </button>
        )}
      </div>
    </form>
  );
}

function Check({
  name,
  label,
  hint,
  checked,
  defaultChecked,
  disabled,
  onChange,
}: {
  name: string;
  label: string;
  hint: string;
  checked?: boolean;
  defaultChecked?: boolean;
  disabled?: boolean;
  onChange?: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2.5">
      <input
        type="checkbox"
        name={name}
        {...(checked === undefined
          ? { defaultChecked }
          : { checked, onChange: (e) => onChange?.(e.target.checked) })}
        disabled={disabled}
        className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600"
      />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-brand-700">{label}</span>
        <span className="block text-xs text-brand-500">{hint}</span>
      </span>
    </label>
  );
}
