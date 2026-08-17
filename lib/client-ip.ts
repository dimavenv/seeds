// IP покупателя для капчи и лимитера попыток.
//
// nginx (deploy/nginx.conf) проксирует с $proxy_add_x_forwarded_for: к
// пришедшему заголовку X-Forwarded-For ДОБАВЛЯЕТСЯ реальный адрес клиента.
// Значит, доверять можно только ПОСЛЕДНЕМУ элементу списка — первые может
// прислать сам клиент и, например, обходить лимит попыток, меняя подделку
// на каждый запрос.
export function clientIp(request: Request): string | undefined {
  return clientIpFromHeaders(request.headers);
}

// То же самое, но от готовых заголовков: server actions получают их через
// headers() из next/headers, объекта Request у них нет.
export function clientIpFromHeaders(h: Headers): string | undefined {
  const xff = h.get("x-forwarded-for");
  if (!xff) return h.get("x-real-ip") ?? undefined;
  const parts = xff
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : undefined;
}
