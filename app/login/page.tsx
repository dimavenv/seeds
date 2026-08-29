"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { serverLogin } from "@/lib/pb/client";
import SmartCaptcha, {
  captchaEnabled,
  type SmartCaptchaHandle,
} from "@/components/smart-captcha";
import AuthTabs from "@/components/auth-tabs";
import OAuthButtons from "@/components/oauth-buttons";
import { GOALS, reachGoalThen } from "@/lib/metrika";

type Health = { ok: boolean; configured: boolean; ms?: number; error?: string };

// Названия сервисов для сообщений об ошибке входа. Дублируют KNOWN из
// lib/oauth.ts, потому что тот модуль серверный ("server-only") — тащить его в
// браузер ради двух строк незачем.
const PROVIDER_TITLES: Record<string, string> = {
  yandex: "Яндекс ID",
  vkid: "VK ID",
};

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const captchaRef = useRef<SmartCaptchaHandle>(null);
  const [registered, setRegistered] = useState(false);

  // Пришли после регистрации (когда авто-вход не прошёл из-за капчи) или с
  // неудачного входа через Яндекс ID.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setRegistered(params.has("registered"));
    const oauth = params.get("oauth");
    if (!oauth) return;
    // Сервис называем по имени: «не получилось войти» без уточнения, куда
    // именно, только путает.
    const who = PROVIDER_TITLES[params.get("p") ?? ""] ?? "внешний сервис";
    if (oauth === "denied") {
      setError(`Вход через ${who} отменён. Можно войти по паролю.`);
    } else if (oauth === "noemail") {
      setError(
        `${who} не передал вашу почту — без неё аккаунт не создать: на почту приходят чек и письма о заказе. Зарегистрируйтесь по почте или добавьте её в профиль сервиса.`
      );
    } else if (oauth === "unavailable" || oauth === "misconfigured") {
      // misconfigured — приложению не выданы нужные доступы. Покупателю об
      // этом знать нечего, точная причина уходит в pm2 logs seeds.
      setError(`Вход через ${who} сейчас недоступен. Войдите по паролю.`);
    } else {
      setError(
        `Не получилось войти через ${who} — попробуйте ещё раз или войдите по паролю.`
      );
    }
  }, []);

  // Проверка доступности базы при загрузке страницы.
  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() =>
        setHealth({ ok: false, configured: true, error: "нет ответа" })
      );
  }, []);

  async function login(captchaToken: string) {
    // Защита от вечного спиннера.
    const safety = setTimeout(() => {
      setError(
        "База данных не отвечает. Проверьте, запущен ли PocketBase на сервере (/api/health)."
      );
      setLoading(false);
    }, 10000);

    // Вход на сервере: пароль и капча проверяются там, сессия — в httpOnly-cookie.
    const result = await serverLogin({ email, password, captchaToken });
    clearTimeout(safety);
    if (!result.ok) {
      setError(result.error);
      setLoading(false);
      captchaRef.current?.reset();
      return;
    }
    // Жёсткий переход — надёжнее обновляет сессию. Цель успеваем отправить до
    // него (см. reachGoalThen).
    reachGoalThen(GOALS.login, undefined, () =>
      window.location.assign("/account")
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    if (captchaEnabled) captchaRef.current?.execute();
    else void login("");
  }

  function captchaError(message: string) {
    setError(message);
    setLoading(false);
  }

  const dbDown = health && !health.ok;

  return (
    <div className="container-page py-16">
      <div className="card mx-auto max-w-md p-6 sm:p-8">
        <AuthTabs active="login" />
        <h1 className="text-2xl font-bold text-brand-800">С возвращением!</h1>
        <p className="mt-1 text-sm text-brand-500">
          Войдите, чтобы видеть свои заказы, избранное и данные для оформления.
        </p>

        {registered && (
          <div className="mt-4 rounded-xl bg-brand-100 px-4 py-3 text-sm text-brand-700">
            Регистрация завершена — войдите с вашими email и паролем.
          </div>
        )}

        {dbDown && (
          <div className="mt-4 rounded-xl bg-accent-500/10 px-4 py-3 text-sm text-accent-700">
            <strong>База данных недоступна.</strong>
            <div className="mt-1">
              {!health?.configured
                ? "Не задан NEXT_PUBLIC_PB_URL в .env.production."
                : "Запрос к PocketBase не прошёл. Проверьте, что сервис запущен (systemctl status pocketbase) и адрес в .env.production верный."}
            </div>
          </div>
        )}

        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-brand-700">Email</span>
            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
          </label>
          <label className="block">
            <span className="mb-1 flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold text-brand-700">Пароль</span>
              <Link
                href="/password-reset"
                className="text-xs font-semibold text-brand-500 hover:text-brand-700"
              >
                Забыли пароль?
              </Link>
            </span>
            <input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input" />
          </label>
          <SmartCaptcha
            ref={captchaRef}
            onToken={(token) => void login(token)}
            onError={captchaError}
          />

          {error && (
            <p role="alert" className="alert-error">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full"
          >
            {loading ? "Входим…" : "Войти"}
          </button>
        </form>

        <OAuthButtons action="login" />
      </div>
    </div>
  );
}
