# 🗄️ Перенос базы данных на VPS (Supabase → PocketBase, пошагово)

> ✅ **Миграция выполнена, Supabase отключён.** Документ оставлен как запись о
> проделанном переносе. Актуальны на постоянку только: **шаг 8 (бэкапы и
> восстановление)** и **шаг 10 (домен для базы)**. Инструмент переноса
> (`scripts/migrate-from-supabase.mjs`) и зависимость от Supabase удалены из
> проекта — весь магазин работает на PocketBase.

Этап 2 переезда: база данных переехала с облачного Supabase на **PocketBase**
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

> ℹ️ Служебный файл из шага 2 уже настроен слушать на `0.0.0.0:8090`, чтобы
> браузер покупателя доставал базу по `http://IP:8090`. Это временно, до домена;
> на шаге 10 база уедет за nginx на `https://api.tomatsemena.ru`, а порт 8090
> закроется. Не тяните с доменом — держать базу в интернете по голому http долго
> не стоит; пароль суперпользователя сделайте посложнее.

> ⚠️ `DATA_ENCRYPTION_KEY` должен остаться ТЕМ ЖЕ, что был: телефоны и адреса
> в заказах переносятся в зашифрованном виде, и расшифровывает их этот ключ.

## Шаг 5. Создать структуру базы (импорт схемы)

```bash
cd /var/www/seeds/seeds
npm ci                         # обновить зависимости (код уже подтянут на шаге 0)
node scripts/pb-import-schema.mjs
```

Должно вывести: `Схема импортирована: users, categories, products, orders, …`

Тот же скрипт (`npm run db:schema`) нужно прогнать и после обновления кода,
если в схеме появились новые поля или коллекции. Он идемпотентен: существующие
ДАННЫЕ не трогает, только доводит структуру до состояния
`pocketbase/pb_schema.json`. Например, промокоды живут в двух коллекциях:
`promos` (сами коды со сроками и условиями — их создаёт админка `/admin/promos`)
и `promo_uses` (пара «аккаунт + код» с уникальным индексом — именно он не даёт
применить код дважды), а у заказов появились поля `promo_code` и `discount`:
без импорта схемы промокоды в админке не создать, а раздел покажет подсказку
«импортируйте схему базы».

То же самое — с данными покупателя в личном кабинете: у `users` появились поля
`last_name`, `first_name`, `middle_name`, `phone` и `auto_password` (сайт
подставляет их в оформление заказа вместе с почтой аккаунта), а также `blocked`
и `blocked_reason` — ими управляет раздел «Аккаунты» в админке. Без импорта
схемы форма «Мои данные» в кабинете при сохранении честно скажет, что базе не
хватает полей, а блокировка работать не будет.

И с оплатой: у `orders` появилось поле `pay_started_at` (когда начата текущая
попытка оплаты — по нему уборка возвращает товар в продажу), а рядом — маленькая
коллекция `payment_claims`, которая не даёт продублировать письма об оплате.
Коллекция `payment_drafts` больше не используется — её можно удалить в админке
PocketBase.

### Названия категорий в единственном числе

Каталог показывает названия категорий из базы. Привести их к единственному
числу («Томаты» → «Томат», «Баклажаны» → «Баклажан») можно разом:

```bash
cd /var/www/seeds/seeds
npm run db:categories -- --dry-run   # показать, что изменится
npm run db:categories                # переименовать
```

Адреса категорий (`/catalog/tomaty`) при этом НЕ меняются — переименование
проиндексированных страниц стоило бы дороже, чем единообразие в URL. Скрипт
идемпотентен и сам сбрасывает кэш каталога.

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
sudo /opt/pocketbase/pb-backup.sh          # проверка: OK (локально): ...
```

Автозапуск каждую ночь в 3:00 (идемпотентно, с логом в /var/log/pb-backup.log):

```bash
( sudo crontab -l 2>/dev/null | grep -v pb-backup.sh; \
  echo "0 3 * * * /opt/pocketbase/pb-backup.sh >> /var/log/pb-backup.log 2>&1" ) | sudo crontab -
```

Бэкап хранится 14 дней (и локально, и в облаке).

### Оффсайт-копия в облако (Yandex Object Storage)

Сервер один — держите копию вне его. Настройка (S3-совместимое хранилище):

1. В [console.yandex.cloud](https://console.yandex.cloud) привяжите платёжный
   аккаунт → **Object Storage** → создайте приватный бакет (напр.
   `tomatsemena-backups`).
2. **IAM → Сервисные аккаунты** → создайте `backup`, на каталоге выдайте роль
   **`storage.editor`** (Права доступа → Настроить доступ) → **Создать ключ →
   Статический ключ доступа** (сохраните Access Key ID и секрет).
3. На сервере — rclone:
   ```bash
   sudo apt install -y rclone
   mkdir -p /root/.config/rclone
   cat > /root/.config/rclone/rclone.conf <<'EOF'
   [yandex]
   type = s3
   provider = Other
   access_key_id = ВАШ_ACCESS_KEY_ID
   secret_access_key = ВАШ_СЕКРЕТ
   endpoint = storage.yandexcloud.net
   region = ru-central1
   acl = private
   EOF
   chmod 600 /root/.config/rclone/rclone.conf
   rclone lsd yandex:                        # должен показать бакет
   ```
4. Укажите бакет скрипту — и он будет выгружать каждую копию сам:
   ```bash
   echo 'RCLONE_REMOTE=yandex:tomatsemena-backups' > /opt/pocketbase/backup.conf
   sudo /opt/pocketbase/pb-backup.sh          # OK (локально) + OK (облако)
   ```

### Восстановление из бэкапа

Проверенное восстановление — часть бэкапа. Как развернуть копию:

```bash
# 1. Взять нужный архив: локально из /opt/pocketbase/backups/ или из облака:
rclone copy yandex:tomatsemena-backups/pb_data_ДАТА.tar.gz /tmp/
# 2. Остановить базу, отложить текущие данные, распаковать бэкап:
sudo systemctl stop pocketbase
sudo mv /opt/pocketbase/pb_data /opt/pocketbase/pb_data.old
sudo tar xzf /tmp/pb_data_ДАТА.tar.gz -C /opt/pocketbase/
sudo chown -R pocketbase:pocketbase /opt/pocketbase/pb_data
# 3. Запустить:
sudo systemctl start pocketbase && curl -s http://127.0.0.1:8090/api/health
```

Убедившись, что всё на месте, удалите `pb_data.old`.

## Шаг 9. Отключить Supabase

Когда всё из шага 7 работает (дайте себе 2–3 дня понаблюдать):

1. Удалите из `.env.production` три строки `*SUPABASE*` и пересоберите:
   `bash deploy/update.sh`.
2. Supabase → Project Settings → **Pause project** (или Delete, если уверены).
   Пока проект на паузе, данные там сохраняются — это ваша подстраховка.

## Шаг 10 (после покупки домена). HTTPS и база за nginx

Когда домен направлен на сервер (A-записи `@`, `www`, при желании `api` → IP)
и есть SSL-сертификат. Здесь применён рабочий вариант: **один сертификат** на
`tomatsemena.ru`, а база отдаётся с того же домена по пути **`/pb`** — так
второй сертификат/поддомен не нужен.

1. Положите файлы сертификата в `/etc/ssl/tomatsemena/`:
   `certificate.crt`, `chain.crt` (корневой), `privkey.pem`. Соберите цепочку и
   проверьте, что ключ подходит:
   ```bash
   cd /etc/ssl/tomatsemena
   cat certificate.crt chain.crt > fullchain.pem && chmod 600 privkey.pem
   diff <(openssl x509 -noout -modulus -in fullchain.pem | openssl md5) \
        <(openssl rsa  -noout -modulus -in privkey.pem  | openssl md5) \
        && echo "ключ подходит"
   ```
2. Перепропишите адреса фото в базе на новый (`https://ДОМЕН/pb`):
   ```bash
   sudo systemctl stop pocketbase
   sudo sqlite3 /opt/pocketbase/pb_data/data.db "UPDATE products SET image_url=REPLACE(image_url,'http://ВАШ_IP:8090','https://tomatsemena.ru/pb'), images=REPLACE(images,'http://ВАШ_IP:8090','https://tomatsemena.ru/pb');"
   sudo systemctl start pocketbase
   ```
3. В `.env.production`: `NEXT_PUBLIC_PB_URL=https://tomatsemena.ru/pb`
   (`PB_INTERNAL_URL=http://127.0.0.1:8090` оставьте — сервер ходит в базу напрямую).
4. Поставьте боевой nginx-конфиг (HTTPS + сайт + база на `/pb`):
   ```bash
   sudo cp deploy/nginx.conf /etc/nginx/sites-available/tomatsemena
   sudo nginx -t && sudo systemctl reload nginx
   ```
5. Верните PocketBase на localhost и закройте прямой порт (теперь база за nginx):
   ```bash
   sudo sed -i 's|--http=0.0.0.0:8090|--http=127.0.0.1:8090|' /etc/systemd/system/pocketbase.service
   sudo systemctl daemon-reload && sudo systemctl restart pocketbase
   sudo ufw delete allow 8090/tcp
   ```
6. Пересоберите сайт: `bash deploy/update.sh`.
7. Проверка: `https://tomatsemena.ru` (замок, фото, вход) и
   `curl -s https://tomatsemena.ru/pb/api/health` → `API is healthy`.

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
через Robokassa (карты + СБП + онлайн-касса 54-ФЗ) — по вашему плану.
