// Профиль покупателя: ФИО и телефон, которые он один раз заполняет в личном
// кабинете, а сайт потом сам подставляет в оформление заказа (там их можно
// поменять — на аккаунт это не влияет).
//
// Модуль чистый (без обращений к БД и без "server-only"): им пользуются и
// серверные роуты, и клиентские формы, и тесты.

export type Profile = {
  last_name: string;
  first_name: string;
  middle_name: string;
  phone: string;
};

export const EMPTY_PROFILE: Profile = {
  last_name: "",
  first_name: "",
  middle_name: "",
  phone: "",
};

// Ограничения совпадают со схемой PocketBase (pocketbase/pb_schema.json):
// поля ФИО — 100 символов, телефон — 32.
const MAX_NAME_PART = 100;
const MAX_PHONE = 32;

// Разбор одной строки ФИО на части. Нужен для аккаунтов, зарегистрированных до
// появления раздельных полей: там заполнено только name. Порядок — русский
// («Иванов Иван Иванович»), лишние слова уходят в отчество, чтобы ничего не
// потерялось.
export function splitFullName(full: string): Pick<
  Profile,
  "last_name" | "first_name" | "middle_name"
> {
  const parts = String(full ?? "").trim().split(/\s+/).filter(Boolean);
  return {
    last_name: parts[0] ?? "",
    first_name: parts[1] ?? "",
    middle_name: parts.slice(2).join(" "),
  };
}

// Сборка ФИО в одну строку — её ждёт поле name у пользователя (им подписаны
// отзывы и обращения в письмах).
export function joinFullName(p: {
  last_name?: string;
  first_name?: string;
  middle_name?: string;
}): string {
  return [p.last_name, p.first_name, p.middle_name]
    .map((s) => String(s ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

// Телефон в хранимом виде: +7XXXXXXXXXX. Пустая строка — «не разобрали»
// (в том числе если поле пустое).
export function normalizePhone(raw: string): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  // 8XXXXXXXXXX и 7XXXXXXXXXX — один и тот же российский номер.
  if (digits.length === 11 && (digits[0] === "8" || digits[0] === "7")) {
    return `+7${digits.slice(1)}`;
  }
  // Номер без кода страны, как его часто пишут: 9XXXXXXXXX.
  if (digits.length === 10) return `+7${digits}`;
  return "";
}

// Человеческий вид для полей ввода: +7 999 123-45-67.
export function formatPhone(raw: string): string {
  const normalized = normalizePhone(raw);
  if (!normalized) return String(raw ?? "").trim().slice(0, MAX_PHONE);
  const d = normalized.slice(2); // без «+7»
  return `+7 ${d.slice(0, 3)} ${d.slice(3, 6)}-${d.slice(6, 8)}-${d.slice(8, 10)}`;
}

export const PHONE_HINT =
  "Телефон нужен в формате +7 999 123-45-67 — по нему звонит курьер и служба доставки.";

// Приведение того, что пришло из формы, к виду для записи в БД.
// error — текст для покупателя; профиль при этом всё равно возвращается
// нормализованным (как parseRegInput в lib/registration.ts).
export function parseProfile(body: Record<string, unknown>): {
  profile: Profile;
  error: string | null;
} {
  const part = (v: unknown) =>
    String(v ?? "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, MAX_NAME_PART);

  const last_name = part(body.last_name);
  const first_name = part(body.first_name);
  const middle_name = part(body.middle_name);
  const rawPhone = String(body.phone ?? "").trim();

  const phone = rawPhone ? normalizePhone(rawPhone) : "";

  // Профиль — дело добровольное: пустая форма это «пока не заполняю».
  // Но если фамилию или имя начали писать, просим заполнить обе — иначе в
  // оформлении заказа подставится половина ФИО.
  let error: string | null = null;
  if ((last_name || first_name) && !(last_name && first_name)) {
    error = "Укажите и фамилию, и имя";
  } else if (rawPhone && !phone) {
    error = PHONE_HINT;
  }

  return { profile: { last_name, first_name, middle_name, phone }, error };
}

// Профиль из записи пользователя PocketBase. Для старых аккаунтов, где
// раздельных полей ещё нет, ФИО достаём из name.
export function profileFromRecord(record: Record<string, unknown>): Profile {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const last_name = str(record.last_name);
  const first_name = str(record.first_name);
  const middle_name = str(record.middle_name);
  const fio =
    last_name || first_name || middle_name
      ? { last_name, first_name, middle_name }
      : splitFullName(str(record.name));
  return { ...fio, phone: str(record.phone) };
}
