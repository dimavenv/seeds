import "server-only";
import crypto from "node:crypto";

// Вход через VK ID — своей реализацией, в обход встроенного в PocketBase
// провайдера `vk`.
//
// Почему так. Провайдер `vk` у PocketBase ходит на старый `oauth.vk.com/
// authorize`. Приложения, заведённые в нынешней консоли VK ID, этот путь не
// принимают: ВКонтакте отвечает `invalid_request` / «Security Error» ещё до
// экрана согласия. Актуальный протокол — VK ID OAuth 2.1 на `id.vk.ru`:
// обязательный PKCE, обмен кода на своём эндпоинте, почта приходит не из
// профиля, а claim'ом в `id_token`.
//
// Что делает этот модуль: строит адрес авторизации, меняет код на токены и
// достаёт из них почту и имя. Сессию сайта выдаёт уже вызывающий код
// (см. app/api/auth/oauth/callback) — так же, как при обычном входе.

const AUTHORIZE_URL = "https://id.vk.ru/authorize";
const TOKEN_URL = "https://id.vk.ru/oauth2/auth";
const USER_INFO_URL = "https://id.vk.ru/oauth2/user_info";
const USERS_GET_URL = "https://api.vk.com/method/users.get";
const API_VERSION = "5.199";

// Единственный доступ, который нам нужен: без почты аккаунт всё равно не
// создать (на неё уходят чек по 54-ФЗ и письма о заказе).
const SCOPE = "email";

// Имя провайдера в наших роутах. Нарочно НЕ «vk»: так исключена путаница с
// одноимённым встроенным провайдером PocketBase, который здесь не участвует.
export const VKID_PROVIDER = "vkid";

// Ключей у приложения ВК три, и обмен кода требует двух из них: идентификатора
// и СЕРВИСНОГО ключа доступа (`service_token` в теле запроса — без него
// id.vk.ru отвечает «invalid_grant: service_token is missing or invalid»).
// Защищённый ключ (client_secret) отправляем, если задан.
export function isVkIdConfigured(): boolean {
  return Boolean(
    (process.env.VK_CLIENT_ID || "").trim() &&
      (process.env.VK_SERVICE_TOKEN || "").trim()
  );
}

// ===== PKCE =====
// Верификатор — случайная строка, вызов (challenge) — её SHA-256 в base64url.
// Смысл: код авторизации бесполезен без верификатора, который остался у нас в
// httpOnly-cookie и по сети в открытом виде не ходил.
export type Pkce = { verifier: string; challenge: string };

export function generatePkce(): Pkce {
  const verifier = crypto.randomBytes(48).toString("base64url");
  const challenge = crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");
  return { verifier, challenge };
}

export function vkidAuthUrl(o: {
  redirectUrl: string;
  state: string;
  codeChallenge: string;
}): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: (process.env.VK_CLIENT_ID || "").trim(),
    redirect_uri: o.redirectUrl,
    scope: SCOPE,
    state: o.state,
    code_challenge: o.codeChallenge,
    code_challenge_method: "S256",
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

// ===== Обмен кода на токены =====

export type VkIdIdentity = {
  accessToken: string;
  // Почта из claim'а id_token. Приходит не всегда — даже когда в профиле ВК она
  // есть: тогда её отдаёт отдельная ручка user_info (см. fetchVkIdUser).
  email: string | null;
  // Доступы, которые ВКонтакте реально выдал. Нужны только для лога: если почты
  // нет и в scope нет email — сразу видно, что дело в согласии, а не в коде.
  scope: string;
};

export type VkIdExchange =
  | { ok: true; identity: VkIdIdentity }
  | { ok: false; error: string };

export async function exchangeVkIdCode(o: {
  code: string;
  codeVerifier: string;
  redirectUrl: string;
  // ВКонтакте передаёт его в адресе возврата рядом с code и state.
  deviceId: string | null;
  // Тот же state, что уходил в адрес авторизации: VK ID ждёт его и здесь.
  state: string;
}): Promise<VkIdExchange> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: (process.env.VK_CLIENT_ID || "").trim(),
    // Именно в ТЕЛЕ, а не в адресе — на этом id.vk.ru настаивает отдельно.
    service_token: (process.env.VK_SERVICE_TOKEN || "").trim(),
    redirect_uri: o.redirectUrl,
    code: o.code,
    code_verifier: o.codeVerifier,
    state: o.state,
  });
  const clientSecret = (process.env.VK_CLIENT_SECRET || "").trim();
  if (clientSecret) body.set("client_secret", clientSecret);
  if (o.deviceId) body.set("device_id", o.deviceId);

  let payload: Record<string, unknown>;
  let status = 0;
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    status = res.status;
    payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  } catch (e) {
    return { ok: false, error: `сеть недоступна: ${(e as Error).message}` };
  }

  const accessToken =
    typeof payload.access_token === "string" ? payload.access_token : "";
  // Токена нет — значит, отказ. Причину ВКонтакте кладёт в тело, причём
  // нередко с кодом 200, поэтому смотрим на тело, а не на статус.
  if (!accessToken) {
    return { ok: false, error: describeTokenError(payload, status) };
  }

  const email =
    typeof payload.id_token === "string" ? emailFromIdToken(payload.id_token) : null;

  return {
    ok: true,
    identity: {
      accessToken,
      email,
      scope: typeof payload.scope === "string" ? payload.scope : "",
    },
  };
}

// Человекочитаемая причина отказа из ответа VK ID.
//
// Пишется в лог целиком по делу: сообщение ВКонтакте, его код и — если ничего
// узнаваемого нет — перечень полей ответа. Токенов в таком ответе нет (мы сюда
// попадаем именно потому, что access_token отсутствует), так что показывать
// нечего опасного, зато следующий разбор не начинается с гадания.
export function describeTokenError(
  payload: Record<string, unknown>,
  status: number
): string {
  const str = (v: unknown) => (typeof v === "string" && v ? v : "");
  // Формат OAuth: { error, error_description }.
  const oauth = [str(payload.error), str(payload.error_description)]
    .filter(Boolean)
    .join(": ");
  // Формат VK API: { error: { error_code, error_msg } } либо плоские поля.
  const nested =
    payload.error && typeof payload.error === "object"
      ? (payload.error as Record<string, unknown>)
      : payload;
  const vk = [
    nested.error_code !== undefined ? `код ${String(nested.error_code)}` : "",
    str(nested.error_msg),
  ]
    .filter(Boolean)
    .join(": ");

  const detail = oauth || vk;
  if (detail) return `${detail} (HTTP ${status})`;

  const keys = Object.keys(payload);
  return keys.length
    ? `ответ без access_token (HTTP ${status}), поля: ${keys.join(", ")}`
    : `пустой ответ (HTTP ${status})`;
}

// Почта из id_token. Подпись НЕ проверяем — и это осознанно: токен только что
// получен по TLS напрямую от id.vk.ru в ответ на запрос, подписанный нашим
// client_secret. Подменить его по дороге некому, а тащить ради этого проверку
// ключей ВК смысла нет.
export function emailFromIdToken(jwt: string): string | null {
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8")
    ) as Record<string, unknown>;
    const email = payload.email;
    return typeof email === "string" && email.includes("@") ? email : null;
  } catch {
    return null;
  }
}

export type VkIdUser = {
  email: string | null;
  firstName: string;
  lastName: string;
};

// Данные покупателя от VK ID.
//
// Основной источник — ручка user_info самого VK ID: именно она отдаёт почту,
// даже когда её нет в claim'ах id_token. Запасной — обычный users.get у API
// ВКонтакте: он почту не отдаёт, зато знает имя и фамилию.
//
// Ни один из вызовов не критичен: не ответили — заведём аккаунт без имени,
// покупатель впишет его в кабинете. А вот без почты вход не состоится, и об
// этом он получит понятное объяснение.
export async function fetchVkIdUser(accessToken: string): Promise<VkIdUser> {
  const fromUserInfo = await fetchUserInfo(accessToken);
  if (fromUserInfo && (fromUserInfo.email || fromUserInfo.firstName)) {
    return fromUserInfo;
  }
  const name = await fetchNameFromApi(accessToken);
  return { email: fromUserInfo?.email ?? null, ...name };
}

async function fetchUserInfo(accessToken: string): Promise<VkIdUser | null> {
  try {
    const res = await fetch(USER_INFO_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        client_id: (process.env.VK_CLIENT_ID || "").trim(),
        access_token: accessToken,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    const data = (await res.json().catch(() => ({}))) as {
      user?: { email?: unknown; first_name?: unknown; last_name?: unknown };
      error?: unknown;
      error_description?: unknown;
    };
    if (!data.user) {
      console.error(
        `[oauth] vkid: user_info не отдал профиль (HTTP ${res.status})` +
          (data.error ? `: ${String(data.error)} ${String(data.error_description ?? "")}` : "")
      );
      return null;
    }
    const email = typeof data.user.email === "string" ? data.user.email : "";
    return {
      email: email.includes("@") ? email : null,
      firstName: typeof data.user.first_name === "string" ? data.user.first_name : "",
      lastName: typeof data.user.last_name === "string" ? data.user.last_name : "",
    };
  } catch (e) {
    console.error(`[oauth] vkid: user_info недоступен: ${(e as Error).message}`);
    return null;
  }
}

async function fetchNameFromApi(
  accessToken: string
): Promise<{ firstName: string; lastName: string }> {
  const empty = { firstName: "", lastName: "" };
  try {
    const url = `${USERS_GET_URL}?${new URLSearchParams({
      access_token: accessToken,
      fields: "first_name,last_name",
      v: API_VERSION,
    })}`;
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    const data = (await res.json().catch(() => ({}))) as {
      response?: { first_name?: unknown; last_name?: unknown }[];
    };
    const u = data.response?.[0];
    if (!u) return empty;
    return {
      firstName: typeof u.first_name === "string" ? u.first_name : "",
      lastName: typeof u.last_name === "string" ? u.last_name : "",
    };
  } catch {
    return empty;
  }
}
