# 🗄️ Перенос базы данных на VPS (Supabase → PocketBase, пошагово)

Этап 2 переезда: база данных переезжает с облачного Supabase на **PocketBase**
на вашем же VPS. После этого весь магазин (сайт + база + фото) живёт на одном
российском сервере — это закрывает и требование 152-ФЗ о хранении персональных
данных в РФ.

Схема после переноса:

```
Покупатель → сайт (Next.js, pm2, :3000) ──→ PocketBase (systemd, 127.0.0.1:8090)
                  браузер покупателя ───────→ PocketBase (фото, вход, корзина)
```

Код сайта уже переписан под PocketBase — вам нужно только выполнить шаги ниже.
Всё делается копированием команд, займёт около часа. Supabase не трогаем до
шага 9 — пока не убедимся, что всё переехало.

> Все команды выполняются на сервере (ssh), в папке проекта.
> У вас проект лежит в `/var/www/seeds/seeds` — команды ниже написаны для этого пути.

---

## Шаг 0. Подтянуть свежий код

Файлы для этого этапа (служба PocketBase, скрипты переноса) появляются только
после обновления кода — сделайте это первым:

```bash
cd /var/www/seeds/seeds
git pull
```

## Шаг 1. Установить PocketBase

```bash
sudo apt install -y unzip sqlite3
sudo useradd -r -s /bin/false pocketbase 2>/dev/null || true
sudo mkdir -p /opt/pocketbase
cd /opt/pocketbase
sudo curl -L -o pb.zip https://github.com/pocketbase/pocketbase/releases/download/v0.39.6/pocketbase_0.39.6_linux_amd64.zip
sudo unzip -o pb.zip && sudo rm pb.zip
sudo chown -R pocketbase:pocketbase /opt/pocketbase
/opt/pocketbase/pocketbase --version
```

Должна напечататься версия. 

> Если github.com не отдаёт файл (бывает с РФ-IP), скачайте zip на своём
> компьютере со страницы github.com/pocketbase/pocketbase/releases и загрузите
> на сервер: `scp pocketbase_0.39.6_linux_amd64.zip dima@ВАШ_IP:/tmp/`,
> затем `sudo unzip /tmp/pocketbase_*.zip -d /opt/pocketbase`.

## Шаг 2. Запустить как службу (systemd)

```bash
sudo cp /var/www/seeds/seeds/deploy/pocketbase.service /etc/systemd/system/pocketbase.service
sudo systemctl daemon-reload
sudo systemctl enable --now pocketbase
systemctl status pocketbase --no-pager   # Active: active (running)
curl http://127.0.0.1:8090/api/health    # {"message":"API is healthy",...}
```

## Шаг 3. Создать суперпользователя PocketBase

Суперпользователь — «сервисный» аккаунт базы. Его использует сервер сайта для
оформления заказов (аналог прежнего service role key Supabase) и вы — для входа
в админку PocketBase. **Это НЕ аккаунт админа магазина** (его сделаем на шаге 6).

Придумайте пароль посложнее и сохраните его:

```bash
sudo -u pocketbase /opt/pocketbase/pocketbase superuser upsert service@tomatsemena.ru 'СИЛЬНЫЙ-ПАРОЛЬ' --dir /opt/pocketbase/pb_data
```

## Шаг 4. Обновить .env.production

```bash
nano /var/www/seeds/seeds/.env.production
```

Приведите файл к такому виду (старые строки SUPABASE пока НЕ удаляйте — они
нужны скрипту переноса; удалим на шаге 9):

```
# --- PocketBase (новая база) ---
# Адрес, доступный из БРАУЗЕРА покупателя (фото, вход, корзина).
# До домена — IP сервера с портом 8090; после домена — https://api.tomatsemena.ru
NEXT_PUBLIC_PB_URL=http://ВАШ_IP:8090
# Адрес для сервера сайта (localhost — быстрее и надёжнее)
PB_INTERNAL_URL=http://127.0.0.1:8090
# Суперпользователь из шага 3
PB_ADMIN_EMAIL=service@tomatsemena.ru
PB_ADMIN_PASSWORD=СИЛЬНЫЙ-ПАРОЛЬ

# --- Прочее (оставьте как было) ---
DATA_ENCRYPTION_KEY=ваш-ключ-шифрования
# NEXT_PUBLIC_DADATA_TOKEN=...

# --- Supabase (СТАРАЯ база — только на время переноса, удалить на шаге 9) ---
NEXT_PUBLIC_SUPABASE_URL=https://ВАШ_ПРОЕКТ.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

И откройте порт 8090 для браузеров (временно, до домена):

```bash
sudo ufw allow 8090/tcp
```

> ⚠️ `DATA_ENCRYPTION_KEY` должен остаться ТЕМ ЖЕ, что был: телефоны и адреса
> в заказах переносятся в зашифрованном виде, и расшифровывает их этот ключ.

## Шаг 5. Создать структуру базы (импорт схемы)

```bash
cd /var/www/seeds/seeds
npm ci                         # обновить зависимости (код уже подтянут на шаге 0)
node scripts/pb-import-schema.mjs
```

Должно вывести: `Схема импортирована: users, categories, products, orders, …`

## Шаг 6. Перенести данные из Supabase

Сначала пробный прогон (ничего не записывает, просто показывает объём):

```bash
node scripts/migrate-from-supabase.mjs --dry
```

Если в итогах видны ваши товары/заказы — запускайте перенос:

```bash
node scripts/migrate-from-supabase.mjs
```

Скрипт перекачает **все фото** из Supabase Storage (и внешних ссылок) в
PocketBase — при сотнях товаров это может занять 10–30 минут. Скрипт можно
запускать повторно — дубликатов не будет.

**Аккаунты покупателей.** Пароли перенести технически невозможно (это
односторонние хеши). Если покупательские аккаунты нужны:

```bash
node scripts/migrate-from-supabase.mjs --with-users
```

— аккаунты создадутся с новыми паролями, список ляжет в
`migrate-users-passwords.txt` (разошлите клиентам и удалите файл). Если
покупатели в основном оформляли заказы гостями — этот флаг не нужен.

### Создать администратора магазина

1. Зайдите в админку PocketBase со своего компьютера через SSH-туннель
   (админка слушает только localhost сервера):

   ```bash
   # на ВАШЕМ компьютере:
   ssh -L 8090:127.0.0.1:8090 dima@ВАШ_IP
   ```

   Не закрывая это окно, откройте в браузере `http://127.0.0.1:8090/_/` и
   войдите суперпользователем (шаг 3).
2. Коллекция **users** → **New record**: заполните email и пароль, поле
   **role** = `admin`, галочку **verified** → Save.
   (Если переносили аккаунты с `--with-users` и среди них был ваш админ — он
   уже с ролью admin, просто задайте ему новый пароль кнопкой «Change password».)
3. На сайте: `/login` → войдите этим email/паролем → должна открыться
   админ-панель (`/admin`).

## Шаг 7. Переключить сайт на новую базу

```bash
bash /var/www/seeds/seeds/deploy/update.sh
```

Проверьте:

```bash
curl http://127.0.0.1:3000/api/health    # {"ok":true,...} — сайт видит PocketBase
```

И в браузере на `http://ВАШ_IP`:
- каталог показывает ваши товары, фото открываются;
- вход в аккаунт работает, `/admin` открывается под админом;
- оформите тестовый заказ — он должен появиться в `/admin/orders`
  (нумерация продолжится со старых номеров);
- `/api/whoami` под админом: `"isAdmin": true, "superuserOk": true`.

## Шаг 8. Бэкапы (обязательно!)

Теперь база живёт на одном сервере — бэкапы критичны:

```bash
sudo cp /var/www/seeds/seeds/deploy/pb-backup.sh /opt/pocketbase/pb-backup.sh
sudo chmod +x /opt/pocketbase/pb-backup.sh
sudo /opt/pocketbase/pb-backup.sh          # проверка: OK: /opt/pocketbase/backups/...
sudo crontab -e                            # добавьте строку:
# 0 3 * * * /opt/pocketbase/pb-backup.sh
```

Бэкап каждую ночь в 3:00, хранится 14 дней. **Настоятельно рекомендуется**
оффсайт-копия (сервер один!): проще всего Яндекс Object Storage + rclone —
раскомментируйте последнюю строку в `pb-backup.sh` и настройте
`rclone config`. Плюс периодически скачивайте архив себе:
`scp dima@ВАШ_IP:/opt/pocketbase/backups/pb_data_*.tar.gz .`

## Шаг 9. Отключить Supabase

Когда всё из шага 7 работает (дайте себе 2–3 дня понаблюдать):

1. Удалите из `.env.production` три строки `*SUPABASE*` и пересоберите:
   `bash deploy/update.sh`.
2. Supabase → Project Settings → **Pause project** (или Delete, если уверены).
   Пока проект на паузе, данные там сохраняются — это ваша подстраховка.

## Шаг 10 (после покупки домена). Красивый адрес для базы

Когда появится домен и сертификат (шаги 8–10 из SETUP-VPS-RU.md):

1. Добавьте A-запись `api` → IP сервера.
2. В `/etc/nginx/sites-available/tomatsemena` раскомментируйте блок
   `api.tomatsemena.ru` (заготовка уже в `deploy/nginx.conf`), получите
   сертификат и на него, `sudo nginx -t && sudo systemctl reload nginx`.
3. В `.env.production` поменяйте:
   `NEXT_PUBLIC_PB_URL=https://api.tomatsemena.ru`
4. Закройте прямой порт: `sudo ufw delete allow 8090/tcp`.
5. Пересоберите: `bash deploy/update.sh`.

> ⚠️ Фото, перекачанные на шаге 6, получили URL вида `http://IP:8090/...`.
> После смены адреса выполните замену в товарах одной командой:
> ```bash
> sudo systemctl stop pocketbase
> sudo -u pocketbase sqlite3 /opt/pocketbase/pb_data/data.db \
>   "UPDATE products SET images = REPLACE(images,'http://ВАШ_IP:8090','https://api.tomatsemena.ru'), image_url = REPLACE(image_url,'http://ВАШ_IP:8090','https://api.tomatsemena.ru');"
> sudo systemctl start pocketbase
> ```

## Если что-то пошло не так

| Симптом | Что делать |
|---------|-----------|
| `systemctl status pocketbase` — failed | `journalctl -u pocketbase -n 30` — чаще всего неверные права: `sudo chown -R pocketbase:pocketbase /opt/pocketbase` |
| Импорт схемы: «Не удалось войти суперпользователем» | Проверьте PB_ADMIN_EMAIL/PASSWORD в `.env.production` и что служба запущена |
| Миграция падает по таймауту на фото | Запустите ещё раз (продолжит с места остановки); совсем без фото: `--skip-images` |
| Сайт в демо-режиме после шага 7 | `NEXT_PUBLIC_PB_URL` не задан на момент сборки — проверьте `.env.production` и пересоберите |
| Фото не открываются в браузере | Порт 8090 закрыт (`sudo ufw allow 8090/tcp`) или в NEXT_PUBLIC_PB_URL не IP сервера |
| Вход есть, но `/admin` — «Доступ запрещён» | В PB Admin UI (коллекция users) у вашего аккаунта поле role должно быть `admin`; перезайдите на сайте |
| «Сбросить пароль» с сайта не работает | PocketBase не умеет слать почту без SMTP. Пароль меняется в PB Admin UI (users → Change password). SMTP настраивается в PB: Settings → Mail settings |

## Что осталось от Supabase в репозитории

- `supabase/` (SQL-миграции) — история старой схемы, не используется. Можно удалить.
- `scripts/import-ozon.mjs` — импорт товаров с Ozon пока пишет в СТАРУЮ базу;
  если он снова понадобится — попросите переписать его под PocketBase.

## Следующий этап

Домен + платный TLS-сертификат (SETUP-VPS-RU.md, шаги 8–10), затем оплата
через Альфа-Банк (эквайринг + СБП + онлайн-касса 54-ФЗ) — по вашему плану.
