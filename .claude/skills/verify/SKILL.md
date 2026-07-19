---
name: verify
description: Как собрать, запустить и проверить этот сайт (Next.js + PocketBase) без настоящей базы — мок PB REST API, прод-сборка, Playwright.
---

# Проверка сайта локально

Next.js 14 (app router) + PocketBase. Без `NEXT_PUBLIC_PB_URL` сайт падает на
демо-данные, но **админка недоступна** (нужна сессия из базы). Настоящий
PocketBase-бинарь скачать из этой среды нельзя (GitHub вне scope прокси) —
работает мок его REST API.

## Рецепт

1. **Мок PocketBase** (Node http-сервер на 127.0.0.1:8090). Минимум эндпоинтов:
   - `GET /api/health` → `{code:200,...}`
   - `POST /api/collections/users/auth-with-password` → `{token, record}` —
     token должен быть JWT-образным (`b64url(header).b64url({id, exp: будущее, type:"auth"}).sig`),
     иначе SDK сочтёт сессию невалидной; в record поле `role: "admin"` даёт доступ в админку
   - `POST /api/collections/users/auth-refresh` → то же (сервер проверяет роль ТОЛЬКО через него)
   - `GET /api/collections/{categories,products,site_settings}/records` →
     `{page,perPage,totalItems,totalPages,items:[...]}`; у products поле связи
     называется `category` (маппится в category_id)
   - CORS-заголовки `Access-Control-Allow-*: *` + ответ на OPTIONS — логин идёт из браузера
2. **Сборка и запуск** (NEXT_PUBLIC_* вшивается на этапе сборки — пересобирать при смене URL):
   ```bash
   NEXT_PUBLIC_PB_URL=http://127.0.0.1:8090 npm run build
   NEXT_PUBLIC_PB_URL=http://127.0.0.1:8090 NO_PROXY=127.0.0.1,localhost npm run start &
   ```
3. **Playwright**: `npm i playwright-core` в scratchpad; браузер уже стоит:
   `executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"`, `args: ["--no-sandbox"]`.

## Что стоит гонять

- Логин: `/login`, селектор формы — `form:has(input[type="password"])`
  (просто `button[type="submit"]` попадает в поиск в шапке!), после входа
  редирект на `/account`, админка — `/admin/products`.
- Корзина: добавить товар кнопкой «В корзину» в `/catalog` (хранится в
  localStorage), смотреть `/cart`.
- Капча и почта выключены без env-ключей — формы работают сразу.

## Грабли

- `curl` к 127.0.0.1 — добавлять `--noproxy '*'` (в среде задан HTTPS_PROXY).
- Прод-сервер и мок запускать в фоне (`run_in_background`), не `&& sleep`.
