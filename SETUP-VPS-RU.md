# 🇷🇺 Перенос сайта на российский VPS (пошагово)

Эта инструкция переносит **сам сайт** с Vercel на российский VPS. База данных
(Supabase) на этом этапе остаётся как есть — сайт просто ходит в неё по тем же
ключам. Перенос базы на российский сервер — **этап 2**, см. последний раздел.

Схема после переноса:

```
Покупатель → ваш домен → nginx (VPS, 80/443) → Docker-контейнер с сайтом (порт 3000)
                                                └→ Supabase (пока в облаке)
```

Понадобится примерно час. Программировать не нужно — только копировать команды.

---

## Что понадобится

1. **VPS у российского провайдера.** Подойдёт любой, например:
   [Timeweb Cloud](https://timeweb.cloud), [Beget](https://beget.com),
   [Selectel](https://selectel.ru), [REG.RU](https://reg.ru), [VDSina](https://vdsina.ru).
   - Конфигурация: минимум **2 ГБ RAM, 1–2 CPU, 20 ГБ диска** (сборка Next.js
     на 1 ГБ может падать по памяти).
   - Операционная система: **Ubuntu 22.04** или **24.04**.
2. **Домен** (например, на REG.RU или у того же провайдера). Можно временно
   работать и по IP-адресу, но HTTPS и вход в аккаунты нормально заработают
   только с доменом.
3. Пароль/ключ root-доступа к серверу — провайдер выдаёт после создания сервера.

---

## Шаг 1. Создать сервер

В панели провайдера создайте сервер (обычно кнопка «Создать сервер» / «Cloud
server»): выберите Ubuntu 22.04/24.04, тариф от 2 ГБ RAM, дата-центр в России.
После создания провайдер покажет **IP-адрес** и **пароль root** (или попросит
загрузить SSH-ключ). Сохраните их.

## Шаг 2. Подключиться к серверу по SSH

- **Windows 10/11:** откройте PowerShell.
- **macOS / Linux:** откройте Терминал.

```bash
ssh root@ВАШ_IP
```

Введите пароль (при вводе символы не отображаются — это нормально). При первом
подключении на вопрос про fingerprint ответьте `yes`.

## Шаг 3. Базовая настройка и защита

```bash
apt update && apt upgrade -y

# Фаервол: разрешаем только SSH и веб-порты
apt install -y ufw
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
```

## Шаг 4. Установить Docker

```bash
curl -fsSL https://get.docker.com | sh
docker --version   # должно показать версию — значит всё хорошо
```

> **Если `docker pull`/сборка падает с ошибкой доступа к registry** (Docker Hub
> периодически ограничивает доступ с российских IP), подключите зеркало:
>
> ```bash
> cat > /etc/docker/daemon.json <<'EOF'
> {
>   "registry-mirrors": [
>     "https://dockerhub.timeweb.cloud",
>     "https://mirror.gcr.io"
>   ]
> }
> EOF
> systemctl restart docker
> ```

## Шаг 5. Скачать код сайта на сервер

```bash
apt install -y git
cd /opt
git clone https://github.com/dimavenv/seeds.git shop
cd /opt/shop
```

> **Если репозиторий приватный**, git попросит логин и пароль. Вместо пароля
> нужен **токен**: GitHub → Settings → Developer settings →
> **Personal access tokens → Fine-grained tokens** → Generate new token →
> доступ только к этому репозиторию, права **Contents: Read-only**.
> Логин — ваш ник на GitHub, пароль — этот токен.

## Шаг 6. Создать файл с ключами (.env)

Сайт продолжает работать с вашей текущей базой Supabase — ключи те же, что были
на Vercel (Vercel → Project → Settings → Environment Variables, либо Supabase →
Project Settings → API).

```bash
nano /opt/shop/.env
```

Вставьте (подставьте свои значения):

```
NEXT_PUBLIC_SUPABASE_URL=https://ВАШ_ПРОЕКТ.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=ваш-anon-ключ
SUPABASE_SERVICE_ROLE_KEY=ваш-service-role-ключ

# Если задавали на Vercel — перенесите и их:
# DATA_ENCRYPTION_KEY=...
# NEXT_PUBLIC_DADATA_TOKEN=...
```

Сохранить в nano: `Ctrl+O`, `Enter`, выйти: `Ctrl+X`.

> Файл `.env` — секретный, он в `.gitignore` и никогда не попадёт в git.

## Шаг 7. Собрать и запустить сайт

```bash
cd /opt/shop
docker compose up -d --build
```

Первая сборка занимает 3–7 минут. Проверка:

```bash
docker compose ps                          # STATUS должен стать healthy
curl http://127.0.0.1:3000/api/health      # ожидаем {"ok":true,...}
```

Если `"ok":false` — сайт работает, но не достучался до Supabase: проверьте ключи
в `.env` и что проект Supabase не на паузе. После правки `.env` пересоберите:
`docker compose up -d --build`.

Логи при проблемах: `docker compose logs -f web` (выход — `Ctrl+C`).

## Шаг 8. Домен: DNS-запись

В панели, где куплен домен, создайте **A-запись**:

| Тип | Имя | Значение |
|-----|-----|----------|
| A | `@` (или поддомен, например `shop`) | IP вашего VPS |

DNS обновляется от пары минут до пары часов. Проверить: `ping ваш-домен.ru`
должен показывать IP сервера.

## Шаг 9. nginx и HTTPS-сертификат

```bash
apt install -y nginx certbot python3-certbot-nginx

# Конфиг из репозитория; замените shop.example.ru на свой домен
sed 's/shop\.example\.ru/ваш-домен.ru/g' /opt/shop/deploy/nginx.conf \
  > /etc/nginx/sites-available/shop
ln -s /etc/nginx/sites-available/shop /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

Сайт уже должен открываться по `http://ваш-домен.ru`. Теперь HTTPS (бесплатный
сертификат Let's Encrypt, продлевается автоматически):

```bash
certbot --nginx -d ваш-домен.ru
```

Certbot спросит email и предложит редирект на HTTPS — соглашайтесь (вариант
Redirect). Готово: сайт работает по `https://ваш-домен.ru`.

## Шаг 10. Переключить Supabase на новый адрес

Чтобы вход в аккаунты и письма работали с нового домена:

1. Supabase → **Authentication → URL Configuration**.
2. **Site URL** → `https://ваш-домен.ru`.
3. В **Redirect URLs** добавьте этот же адрес.

## Шаг 11. Проверка и отключение Vercel

Проверьте на новом домене: главная, каталог, карточка товара, корзина,
оформление заказа, `/login`, `/admin`, загрузка фото товара.

Когда всё работает, Vercel-проект можно удалить (Vercel → Project → Settings →
Delete Project) или просто оставить — мешать он не будет. Если на Vercel был
подключён этот же домен — сначала отвяжите его там (Settings → Domains).

---

## Как обновлять сайт

Автодеплоя «как на Vercel» больше нет — после изменений в GitHub выполните на
сервере одну команду:

```bash
bash /opt/shop/deploy/update.sh
```

Она подтянет код, пересоберёт контейнер и перезапустит сайт (перерыв ~5 секунд).

## Если что-то пошло не так

| Симптом | Что делать |
|---------|-----------|
| Сборка падает: `JavaScript heap out of memory` | Мало RAM. Добавьте swap: `fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile` |
| `docker compose up` не тянет образы | Зеркала registry — см. шаг 4 |
| Сайт открывается, но каталог демо/пустой | `curl http://127.0.0.1:3000/api/health` — если `ok:false`, неверные ключи в `.env` или Supabase на паузе |
| Вход в аккаунт не работает | Шаг 10 (Site URL в Supabase) и открывайте сайт по https |
| `502 Bad Gateway` от nginx | Контейнер не запущен: `docker compose ps`, `docker compose logs web` |
| Посмотреть, что происходит | `docker compose logs -f web` |

---

## Этап 2. Перенос базы данных в Россию (следующий шаг)

Сейчас данные (товары, заказы, аккаунты) остаются в облачном Supabase. Вторым
этапом переносим и их на этот же VPS:

- поднимем на сервере **self-hosted Supabase** (или чистый PostgreSQL) в том же
  `docker-compose.yml` — файл уже рассчитан на добавление сервисов;
- перенесём схему (`supabase/migrations/`), данные и фото из Storage;
- поменяем ключи в `.env` на локальные — код сайта менять не придётся.

Для этапа 2 стоит взять тариф посолиднее: **от 4 ГБ RAM и 40 ГБ диска** (полный
self-hosted Supabase — это несколько сервисов). Учитывайте это при выборе
тарифа уже сейчас, либо выбирайте провайдера, у которого тариф можно повысить
без пересоздания сервера.
