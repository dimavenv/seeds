// fetch с таймаутом — чтобы вызовы Supabase не висели вечно
// при недоступном проекте или неверных ключах.
export function fetchWithTimeout(timeoutMs = 8000): typeof fetch {
  return (input, init) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(input, { ...init, signal: controller.signal }).finally(() =>
      clearTimeout(timer)
    );
  };
}
