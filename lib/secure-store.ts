"use client";

// Локальное шифрованное хранилище для функции «Запомнить меня».
// Ключ AES-GCM создаётся неизвлекаемым (extractable: false) и хранится в
// IndexedDB — из JavaScript его значение прочитать нельзя. В localStorage
// лежит только шифртекст. Работает в secure context (https/localhost).

const DB_NAME = "tomatsemena-secure";
const STORE = "keys";
const KEY_ID = "aesgcm";

function hasCrypto(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof indexedDB !== "undefined" &&
    !!window.crypto?.subtle
  );
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet(db: IDBDatabase, key: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, key: string, val: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(val, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getKey(): Promise<CryptoKey | null> {
  if (!hasCrypto()) return null;
  try {
    const db = await openDb();
    const existing = (await idbGet(db, KEY_ID)) as CryptoKey | undefined;
    if (existing) return existing;
    const key = await window.crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false, // неизвлекаемый
      ["encrypt", "decrypt"]
    );
    await idbPut(db, KEY_ID, key);
    return key;
  } catch {
    return null;
  }
}

function toB64(buf: ArrayBufferLike): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function fromB64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

// Имя записи «Запомнить меня» на странице оформления. Живёт здесь, чтобы
// выход из аккаунта мог её стереть, не зная ничего про страницу оформления.
export const CHECKOUT_PROFILE_KEY = "checkout_profile";

// Сколько хранить сохранённые данные. Отметка «запомнить» не должна означать
// «навсегда»: ФИО, телефон и адрес доставки остаются на устройстве, а
// устройство бывает общим (аудит 5.3). Через месяц данные протухают сами.
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export async function secureSet(name: string, obj: unknown): Promise<void> {
  const key = await getKey();
  if (!key) return;
  try {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    // Время записи кладём ВНУТРЬ шифртекста: снаружи его можно было бы
    // подправить и продлить срок хранения.
    const data = new TextEncoder().encode(
      JSON.stringify({ savedAt: Date.now(), value: obj })
    );
    const cipher = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      data as BufferSource
    );
    localStorage.setItem(
      name,
      JSON.stringify({ iv: toB64(iv.buffer), data: toB64(cipher) })
    );
  } catch {
    /* шифрование не удалось — молча игнорируем */
  }
}

export async function secureGet<T>(name: string): Promise<T | null> {
  const key = await getKey();
  if (!key) return null;
  try {
    const raw = localStorage.getItem(name);
    if (!raw) return null;
    const { iv, data } = JSON.parse(raw) as { iv: string; data: string };
    const plain = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromB64(iv) as BufferSource },
      key,
      fromB64(data) as BufferSource
    );
    const parsed = JSON.parse(new TextDecoder().decode(plain)) as unknown;
    // Записи прежнего формата (без отметки времени) читаем, но считаем
    // просроченными: срок хранения у них неизвестен.
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof (parsed as { savedAt?: unknown }).savedAt !== "number"
    ) {
      secureClear(name);
      return null;
    }
    const { savedAt, value } = parsed as { savedAt: number; value: T };
    if (Date.now() - savedAt > MAX_AGE_MS) {
      secureClear(name);
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

export function secureClear(name: string): void {
  try {
    localStorage.removeItem(name);
  } catch {
    /* недоступно — игнорируем */
  }
}
