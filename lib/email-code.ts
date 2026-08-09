import "server-only";
import crypto from "node:crypto";

// Коды подтверждения почты при регистрации — без хранения в БД.
// Сервер выдаёт клиенту «билет»: AES-256-GCM-контейнер с почтой, кодами и их
// сроками годности. Подделать или прочитать билет без серверного ключа нельзя
// (GCM проверяет целостность), а расшифровать его может любой воркер pm2 —
// ключ детерминированный. Клиент присылает билет + код, сервер сверяет.
//
// Кодов в билете НЕСКОЛЬКО (до MAX_CODES). Причина — задержки на стороне
// получателя: mail.ru нередко придерживает первое письмо на несколько минут,
// покупатель за это время жмёт «отправить ещё раз», а потом ему приходят оба
// письма, и вводит он то, которое открыл первым. Раньше повторная отправка
// обнуляла прежний код и такой ввод падал с «неверный код»; теперь подходит
// любой из выданных, пока не вышел его собственный срок.

// Сколько живёт код. По умолчанию 5 минут; на сервере с медленной доставкой
// писем срок поднимается через EMAIL_CODE_TTL_MIN в .env.production без правки
// кода (см. SETUP-MAIL-RU.md).
export function ttlMs(): number {
  const min = Number(process.env.EMAIL_CODE_TTL_MIN);
  const safe = Number.isFinite(min) && min >= 1 && min <= 60 ? min : 5;
  return safe * 60 * 1000;
}

// Больше трёх живых кодов не храним: билет уезжает клиенту, а повторные
// отправки и так ограничены лимитером.
const MAX_CODES = 3;

function key(): Buffer {
  // Детерминированный ключ из серверных секретов (одинаков на всех воркерах).
  const src =
    process.env.DATA_ENCRYPTION_KEY ||
    process.env.PB_ADMIN_PASSWORD ||
    "dev-email-code-secret";
  return crypto.createHash("sha256").update(`email-code:${src}`).digest();
}

export function generateCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

// Для чего выдан билет. Кодами из письма подтверждают и регистрацию, и сброс
// пароля — назначение хранится ВНУТРИ билета, чтобы код от одного действия
// нельзя было предъявить другому.
export type TicketScope = "register" | "reset";

export type IssuedCode = { code: string; expiresAt: number };
export type Ticket = {
  email: string;
  scope: TicketScope;
  codes: IssuedCode[];
  // true — ни одного живого кода не осталось (нужен новый).
  expired: boolean;
};

// Новый билет. previous — билет, выданный этому же покупателю раньше: его ещё
// живые коды переносятся в новый, чтобы опоздавшее письмо не стало мусором.
export function issueTicket(
  email: string,
  code: string,
  opts: { previous?: Ticket | null; scope?: TicketScope } = {}
): string {
  const scope = opts.scope ?? "register";
  const previous = opts.previous;
  const now = Date.now();
  const carryOver =
    previous && previous.email === email && previous.scope === scope
      ? previous.codes
      : [];
  const kept = carryOver
    .filter((c) => c.expiresAt > now)
    .slice(-(MAX_CODES - 1));
  const codes = [...kept, { code, expiresAt: now + ttlMs() }];
  const payload = JSON.stringify({
    e: email,
    s: scope,
    l: codes.map((c) => [c.code, c.expiresAt]),
  });
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString("base64url");
}

// null — билет повреждён/подделан; expired проверяется отдельно, чтобы дать
// понятную ошибку «код устарел» вместо «неверный код».
export function readTicket(
  ticket: string,
  scope: TicketScope = "register"
): Ticket | null {
  try {
    const raw = Buffer.from(ticket, "base64url");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const json = Buffer.concat([
      decipher.update(raw.subarray(28)),
      decipher.final(),
    ]).toString("utf8");
    const p = JSON.parse(json) as {
      e?: string;
      s?: string;
      l?: unknown;
      // старый формат (один код) — билеты, выданные до обновления сайта
      c?: string;
      x?: number;
    };
    if (typeof p.e !== "string") return null;
    // Билеты без назначения выданы прежней версией сайта — это регистрация.
    if ((p.s ?? "register") !== scope) return null;

    const codes: IssuedCode[] = [];
    if (Array.isArray(p.l)) {
      for (const entry of p.l) {
        const [code, expiresAt] = Array.isArray(entry) ? entry : [];
        if (typeof code === "string" && typeof expiresAt === "number") {
          codes.push({ code, expiresAt });
        }
      }
    } else if (typeof p.c === "string" && typeof p.x === "number") {
      codes.push({ code: p.c, expiresAt: p.x });
    }
    if (codes.length === 0) return null;

    const now = Date.now();
    return {
      email: p.e,
      scope,
      codes,
      expired: codes.every((c) => c.expiresAt <= now),
    };
  } catch {
    return null;
  }
}

// Когда истечёт последний живой код (мс эпохи). 0 — живых не осталось.
export function ticketExpiresAt(ticket: Ticket): number {
  const now = Date.now();
  return ticket.codes.reduce(
    (max, c) => (c.expiresAt > now && c.expiresAt > max ? c.expiresAt : max),
    0
  );
}

// Сколько секунд осталось на ввод — уходит клиенту для таймера на экране.
export function secondsLeft(ticket: Ticket): number {
  const at = ticketExpiresAt(ticket);
  return at ? Math.max(0, Math.round((at - Date.now()) / 1000)) : 0;
}

// Сверка кода без утечки по времени сравнения. Подходит ЛЮБОЙ ещё живой код из
// билета: покупатель мог получить письма не в том порядке, в каком мы их слали.
export function codeMatches(ticket: Ticket, input: string): boolean {
  const b = Buffer.from(String(input).trim());
  const now = Date.now();
  let ok = false;
  for (const c of ticket.codes) {
    const a = Buffer.from(c.code);
    // Без раннего выхода: перебираем все коды, чтобы по времени ответа нельзя
    // было понять, какой из них совпал.
    if (a.length === b.length && crypto.timingSafeEqual(a, b) && c.expiresAt > now) {
      ok = true;
    }
  }
  return ok;
}

// Простейший лимитер попыток в памяти процесса (на воркер) — от перебора кода
// и спама повторной отправкой. Для магазина этого достаточно.
const buckets = new Map<string, { n: number; resetAt: number }>();

export function allowAttempt(bucket: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  // Защита от разрастания: чистим только ИСТЁКШИЕ окна. Раньше здесь был
  // clear() всей карты — он сбрасывал и активные лимиты, то есть поток
  // мусорных ключей обнулял ограничения для всех.
  if (buckets.size > 10_000) {
    for (const [key, val] of buckets) {
      if (now > val.resetAt) buckets.delete(key);
    }
  }
  const b = buckets.get(bucket);
  if (!b || now > b.resetAt) {
    buckets.set(bucket, { n: 1, resetAt: now + windowMs });
    return true;
  }
  b.n += 1;
  return b.n <= max;
}
