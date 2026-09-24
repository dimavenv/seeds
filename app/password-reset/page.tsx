"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import SmartCaptcha, {
  captchaEnabled,
  type SmartCaptchaHandle,
} from "@/components/smart-captcha";

const INVALID_RESET_LINK =
  "Ссылка недействительна или срок её действия истёк. Запросите восстановление пароля ещё раз.";

export default function PasswordResetPage() {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [purpose, setPurpose] = useState<"reset" | "setup">("reset");
  const [checking, setChecking] = useState(true);
  const [validLink, setValidLink] = useState(false);
  const [requested, setRequested] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const captchaRef = useRef<SmartCaptchaHandle>(null);

  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("token") ?? "";
    setToken(raw);
    if (!raw) {
      setChecking(false);
      return;
    }
    fetch(`/api/password-reset/confirm?token=${encodeURIComponent(raw)}`, {
      cache: "no-store",
      referrerPolicy: "no-referrer",
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? INVALID_RESET_LINK);
        setPurpose(data.purpose === "setup" ? "setup" : "reset");
        setValidLink(true);
      })
      .catch((reason) => {
        setError(reason instanceof Error ? reason.message : INVALID_RESET_LINK);
      })
      .finally(() => setChecking(false));
  }, []);

  async function requestLink(captchaToken: string) {
    try {
      const response = await fetch("/api/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), captchaToken }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Не удалось отправить письмо");
      setRequested(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Сеть недоступна. Попробуйте ещё раз.");
      captchaRef.current?.reset();
    } finally {
      setLoading(false);
    }
  }

  function submitEmail(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    if (captchaEnabled) captchaRef.current?.execute();
    else void requestLink("");
  }

  async function submitPassword(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (password !== passwordConfirm) {
      setError("Пароли не совпадают");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        referrerPolicy: "no-referrer",
        body: JSON.stringify({ token, password, passwordConfirm }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Не удалось сменить пароль");
      // Одноразовый токен больше не нужен даже в истории текущей вкладки.
      window.history.replaceState(null, "", "/password-reset");
      setToken("");
      setDone(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Сеть недоступна. Попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return <ResetCard title="Проверяем ссылку…"><p className="text-brand-500">Подождите несколько секунд.</p></ResetCard>;
  }

  if (done) {
    return (
      <ResetCard title="Пароль установлен">
        <p className="text-brand-600">Теперь можно войти в личный кабинет с новым паролем.</p>
        <Link href="/login" className="btn-primary mt-6 w-full">Войти</Link>
      </ResetCard>
    );
  }

  if (token && !validLink) {
    return (
      <ResetCard title="Ссылка не работает">
        <p role="alert" className="alert-error">{error || INVALID_RESET_LINK}</p>
        <Link href="/password-reset" className="btn-primary mt-6 w-full">Запросить новую ссылку</Link>
      </ResetCard>
    );
  }

  if (token && validLink) {
    return (
      <ResetCard title={purpose === "setup" ? "Создайте пароль" : "Новый пароль"}>
        <p className="text-sm text-brand-500">
          {purpose === "setup"
            ? "Ваш аккаунт уже создан после первого заказа. Придумайте пароль для входа."
            : "Придумайте новый пароль для личного кабинета."}
        </p>
        <form onSubmit={submitPassword} className="mt-6 space-y-4">
          <PasswordField label="Новый пароль" value={password} onChange={setPassword} show={show} />
          <PasswordField label="Повторите пароль" value={passwordConfirm} onChange={setPasswordConfirm} show={show} />
          <label className="flex cursor-pointer items-center gap-2 text-sm text-brand-600">
            <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="h-4 w-4 accent-brand-600" />
            Показать пароль
          </label>
          {error && <p role="alert" className="alert-error">{error}</p>}
          <button type="submit" disabled={loading || password.length < 8 || passwordConfirm.length < 8} className="btn-primary w-full">
            {loading ? "Сохраняем…" : "Сохранить пароль"}
          </button>
        </form>
      </ResetCard>
    );
  }

  if (requested) {
    return (
      <ResetCard title="Проверьте почту">
        <p className="text-brand-600">
          Если аккаунт с адресом <b className="break-all">{email.trim()}</b> существует, мы отправили одноразовую ссылку для смены пароля.
        </p>
        <p className="mt-3 text-sm text-brand-500">Проверьте также папку «Спам». Ссылка действует 30 минут.</p>
        <button type="button" onClick={() => { setRequested(false); setError(null); captchaRef.current?.reset(); }} className="btn-outline mt-6 w-full">
          Указать другую почту
        </button>
      </ResetCard>
    );
  }

  return (
    <ResetCard title="Забыли пароль?">
      <p className="text-sm text-brand-500">Укажите email — мы пришлём одноразовую ссылку для установки нового пароля.</p>
      <form onSubmit={submitEmail} className="mt-6 space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-brand-700">Email</span>
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" autoComplete="email" />
        </label>
        <SmartCaptcha ref={captchaRef} onToken={(captchaToken) => void requestLink(captchaToken)} onError={(message) => { setError(message); setLoading(false); }} />
        {error && <p role="alert" className="alert-error">{error}</p>}
        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? "Отправляем…" : "Получить ссылку"}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-brand-500">Вспомнили пароль? <Link href="/login" className="font-semibold text-brand-600 hover:text-brand-800">Войти</Link></p>
    </ResetCard>
  );
}

function ResetCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="container-page py-16">
      <div className="card mx-auto max-w-md p-6 sm:p-8">
        <h1 className="mb-3 text-2xl font-bold text-brand-800">{title}</h1>
        {children}
      </div>
    </div>
  );
}

function PasswordField({ label, value, onChange, show }: { label: string; value: string; onChange: (value: string) => void; show: boolean }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-brand-700">{label} <span className="font-normal text-brand-400">(минимум 8 символов)</span></span>
      <input required minLength={8} maxLength={72} type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} className="input" autoComplete="new-password" />
    </label>
  );
}
