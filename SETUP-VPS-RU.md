# 🇷🇺 Перенос tomatsemena.ru на VPS reg.ru (пошагово)

Инструкция переносит **сам сайт** с Vercel на российский VPS. **База данных на
этом этапе не трогается**: сайт продолжает работать с текущим облачным Supabase
по тем же ключам. Перенос базы (PocketBase на этом же сервере) — этап 2,
см. последний раздел.

Схема после переноса:

```
Покупатель → tomatsemena.ru → nginx (VPS, 80/443) → Next.js под pm2 (127.0.0.1:3000)
                                                     └→ Supabase (пока в облаке)
```

Всё делается копированием команд, займёт 1–2 часа. Правило безопасности
миграции: **сначала поднимаем и проверяем всё на новом сервере, и только потом
переключаем DNS.**

---

## Шаг 1. Заказать VPS на reg.ru

1. reg.ru → VPS/VDS → регион **Москва**, ОС **Debian 12**.
2. Конфигурация: минимум **2 vCPU / 4 ГБ RAM / 40+ ГБ NVMe** — с запасом под
   этап 2 (PocketBase на этом же сервере).
3. IP-адрес и пароль root придут письмом и видны в личном кабинете.

## Шаг 2. Первый вход и базовая настройка

С компьютера (Windows — PowerShell, macOS/Linux — Терминал):

```bash
ssh root@ВАШ_IP
```

На сервере:

```bash
apt update && apt upgrade -y
timedatectl set-timezone Europe/Moscow
apt install -y curl git ufw fail2ban nginx rsync
```

## Шаг 3. Пользователь вместо root и защита SSH

```bash
adduser dima                # придумайте пароль, остальные поля можно пропустить
usermod -aG sudo dima
rsync --archive --chown=dima:dima ~/.ssh /home/dima 2>/dev/null || true
```

С **локального компьютера** загрузите свой SSH-ключ (если ключа нет — сначала
`ssh-keygen -t ed25519` и три раза Enter):

```bash
ssh-copy-id dima@ВАШ_IP
ssh dima@ВАШ_IP    # проверьте, что вход по ключу работает, НЕ закрывая root-сессию
```

Когда вход под `dima` по ключу работает — закройте вход root и пароли
(на сервере, через `sudo nano /etc/ssh/sshd_config`):

```
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
```

```bash
sudo systemctl restart ssh
```

## Шаг 4. Фаервол и fail2ban

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'    # 80 + 443
sudo ufw enable
sudo systemctl status fail2ban --no-pager   # active (running) — защита SSH от перебора
```

## Шаг 5. Node.js 22 и pm2

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
pm2 install pm2-logrotate
```

## Шаг 6. Код сайта и ключи

```bash
sudo mkdir -p /var/www/seeds && sudo chown dima:dima /var/www/seeds
cd /var/www/seeds
git clone https://github.com/dimavenv/seeds.git .
```

> Если репозиторий приватный, вместо пароля git попросит **токен**: GitHub →
> Settings → Developer settings → Personal access tokens → Fine-grained →
> доступ к одному репозиторию, права Contents: Read-only.

Создайте файл с ключами (те же значения, что были на Vercel: Vercel → Project →
Settings → Environment Variables, либо Supabase → Project Settings → API):

```bash
nano /var/www/seeds/.env.production
```

```
NEXT_PUBLIC_SUPABASE_URL=https://ВАШ_ПРОЕКТ.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=ваш-anon-ключ
SUPABASE_SERVICE_ROLE_KEY=ваш-service-role-ключ

# Если задавали на Vercel — перенесите и их:
# DATA_ENCRYPTION_KEY=...
# NEXT_PUBLIC_DADATA_TOKEN=...
```

Сохранить: `Ctrl+O`, `Enter`; выйти: `Ctrl+X`. Файл в `.gitignore`, в git не попадёт.

> **Важно:** `NEXT_PUBLIC_*` вшиваются в код при сборке, поэтому файл должен
> существовать **до** `npm run build`. Серверные секреты передаёт в приложение
> pm2 — `ecosystem.config.js` сам читает `.env.production` (standalone-сервер
> Next.js env-файлы не читает). После правки ключей: пересборка + `pm2 reload
> ecosystem.config.js --update-env`.

## Шаг 7. Сборка и запуск под pm2

```bash
cd /var/www/seeds
npm ci
npm run build
cp -r .next/static .next/standalone/.next/
cp -r public .next/standalone/

pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd
# ⬑ выполните команду, которую выведет pm2 startup — это автозапуск после перезагрузки
```

> ⚠️ **Автозапуск должен быть настроен под ТЕМ ЖЕ пользователем, под которым
> запущен pm2.** Если `pm2 ls` показывает процессы под root — выполняйте
> `pm2 startup systemd` и `pm2 save` под root (иначе после перезагрузки сервера
> сайт не поднимется). Проверка: `systemctl list-unit-files | grep pm2` — юнит
> должен соответствовать пользователю из колонки `user` в `pm2 ls`.
> Заодно проверьте, что swap переживает перезагрузку:
> `grep swapfile /etc/fstab` — если пусто, добавьте:
> `echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab`.

Проверка:

```bash
pm2 ls                                    # seeds ×2, status: online, ↺ 0
curl http://127.0.0.1:3000/api/health     # {"ok":true,...}
```

Если `"ok":false` — сайт жив, но не видит Supabase: сверьте ключи в
`.env.production` (и что проект Supabase не на паузе), затем пересоберите
(шаг 7 заново). Логи: `pm2 logs seeds`.

> Если pm2 показывает рестарты с ошибкой «Failed to start server» без
> подробностей — порт 3000 занят другим процессом. Найти: `pgrep -a next-server`
> (процесс Next называется `next-server`, а не `node`) и убить лишний.

## Шаг 8. nginx

```bash
sudo cp /var/www/seeds/deploy/nginx.conf /etc/nginx/sites-available/tomatsemena
sudo ln -s /etc/nginx/sites-available/tomatsemena /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

Сайт уже должен открываться в браузере по `http://ВАШ_IP` — проверьте до
переключения DNS.

## Шаг 9. TLS-сертификат — платный DV у РФ-поставщика

Для .ru-магазина с планируемыми платежами **не полагайтесь на Let's Encrypt**:
формально он ещё может выдавать сертификаты негосударственным организациям РФ,
но зарубежные УЦ уже практиковали принудительный отзыв по .ru-доменам
(GlobalSign, июнь 2026). Надёжный путь — **платный DV-сертификат** у reg.ru
(«SSL-сертификаты» в ЛК), RU-CENTER и т.п. Он же закрывает требования
Альфа-Банка к сайту (RSA ≥ 2048, SHA-256, доверенный УЦ).

1. Закажите DV-сертификат на `tomatsemena.ru` (+ `www`), пройдите проверку
   домена (обычно DNS-запись или файл на сайте — reg.ru покажет).
2. Получите файлы сертификата и положите на сервер:

```bash
sudo mkdir -p /etc/ssl/tomatsemena
sudo nano /etc/ssl/tomatsemena/fullchain.pem   # сертификат + цепочка (CA bundle)
sudo nano /etc/ssl/tomatsemena/privkey.pem     # приватный ключ
sudo chmod 600 /etc/ssl/tomatsemena/privkey.pem
```

3. В `/etc/nginx/sites-available/tomatsemena` раскомментируйте блок **HTTPS** и
   строку `return 301 https://...` в блоке HTTP (удалив из него `location /`),
   затем:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

> Certbot/Let's Encrypt можно держать как запасной вариант, но не как
> единственный. Поставьте себе напоминание о продлении платного сертификата —
> автопродления, как у certbot, у него нет.

## Шаг 10. DNS: переключение домена

Пока идёт настройка, снизьте TTL A-записей до **300 секунд** — тогда откат, если
что-то пойдёт не так, займёт минуты.

В ЛК reg.ru (управление DNS домена tomatsemena.ru) укажите:

| Тип | Имя | Значение |
|-----|-----|----------|
| A | `@` | IP VPS |
| A | `www` | IP VPS |
| A | `api` | IP VPS (заготовка на этап 2, можно добавить сразу) |

Если домен был привязан к Vercel — удалите его там (Project → Settings →
Domains), чтобы не конфликтовали инструкции DNS. Проверка: `ping tomatsemena.ru`
показывает IP сервера.

## Шаг 11. Supabase: новый адрес сайта

Чтобы вход в аккаунты и письма работали с нового адреса:

1. Supabase → **Authentication → URL Configuration**.
2. **Site URL** → `https://tomatsemena.ru`.
3. В **Redirect URLs** добавьте этот же адрес.

## Шаг 12. Финальная проверка и отключение Vercel

Пройдите по сайту на боевом домене: главная, каталог, карточка товара, корзина,
оформление заказа, `/login`, `/admin`, загрузка фото товара, `/api/health`.

Когда всё работает — Vercel-проект можно удалить (Settings → Delete Project)
или оставить выключенным; мешать он не будет.

---

## Как обновлять сайт

Автодеплоя «как на Vercel» больше нет. После изменений в GitHub — одна команда
на сервере:

```bash
bash /var/www/seeds/deploy/update.sh
```

Она подтягивает код, пересобирает и делает `pm2 reload` (воркеры перезапускаются
по одному — без простоя).

## Бэкапы, логи, мониторинг

- **Логи:** `pm2 logs seeds` (ротация — pm2-logrotate), nginx — `/var/log/nginx/`.
- **Мониторинг:** `pm2 monit`; внешний uptime-пинг на `https://tomatsemena.ru/api/health`
  (например, UptimeRobot или пинг из Яндекс.Метрики).
- **Бэкапы:** пока база в Supabase — там же и бэкапы; на этапе 2 настроим
  локальные + оффсайт (Yandex Object Storage).

## Если что-то пошло не так

| Симптом | Что делать |
|---------|-----------|
| Сборка падает: `heap out of memory` | Добавьте swap: `sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile` |
| pm2: рестарты, «Failed to start server» | Порт 3000 занят: `pgrep -a next-server`, убейте лишний процесс |
| `/api/health` → `ok:false` | Ключи в `.env.production` / Supabase на паузе; после правки — пересборка |
| Вход в аккаунт не работает | Шаг 11 (Site URL) и открывайте сайт по https |
| `502 Bad Gateway` | `pm2 ls` — приложение упало; `pm2 logs seeds` |
| Supabase недоступен с РФ-IP | Редко, но возможно; тогда ускоряем этап 2 (перенос БД) |

## Юридический минимум для .ru-магазина (сделать параллельно)

1. **152-ФЗ:** персональные данные покупателей должны храниться в РФ — это
   закроет этап 2 (перенос базы). Пока база в Supabase — не затягивайте с ним.
2. **Уведомление в Роскомнадзор** (pd.rkn.gov.ru) об обработке ПД — подаётся
   один раз, до начала обработки; штраф за неподачу для ИП — 30–50 тыс. ₽.
3. На сайте: политика обработки ПД (страница `/privacy` уже есть — проверьте
   актуальность), согласие с чекбоксом в формах, реквизиты ИП, условия
   доставки/возврата. Это же потребует Альфа-Банк при подключении эквайринга.

---

## Этап 2. Перенос базы данных

Готово к выполнению: код сайта уже переписан под **PocketBase**, скрипты
переноса данных и фото лежат в `scripts/`. Пошаговая инструкция —
[`SETUP-DB-RU.md`](./SETUP-DB-RU.md).

После этапа 2 отдельным шагом — домен + TLS (шаги 8–10 выше), затем
подключение оплаты (Альфа-Банк: эквайринг, СБП, онлайн-касса по 54-ФЗ).
