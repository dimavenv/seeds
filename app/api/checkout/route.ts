import { NextResponse } from "next/server";
import { csrfGuard } from "@/lib/csrf";
import { clientIp } from "@/lib/client-ip";
import { pbAdmin, hasAdminCredentials } from "@/lib/pb/server";
import { getSession } from "@/lib/auth";
import { isDbConfigured, mapProduct } from "@/lib/pb/shared";
import { normalizeCheckoutItems, findStockIssues, stockShortageMessage } from "@/lib/checkout";
import { reserveStock, releaseStock } from "@/lib/stock";
import { deliveryCostFor, normalizeDeliveryMethod, ozonRestriction } from "@/lib/delivery";
import { encryptField } from "@/lib/crypto";
import {
  isRobokassaConfigured,
  buildRobokassaPayment,
  invoiceTtlMinutes,
} from "@/lib/robokassa";
import { mailOrderPlaced } from "@/lib/order-mail";
import { notifyNewOrder } from "@/lib/admin-mail";
import { verifyCaptcha } from "@/lib/captcha";
import { allowAttempt } from "@/lib/email-code";
import { cleanupStalePendingOrders } from "@/lib/order-cleanup";
import {
  createOrderWithItems,
  mailOrderAccepted,
  nextInvoiceId,
} from "@/lib/order-flow";
import { normalizePromoCode } from "@/lib/promo";
import {
  hasConsent,
  recordConsent,
  CONSENT_REQUIRED_MESSAGE,
} from "@/lib/consent";
import {
  attachPromoUseToOrder,
  checkPromo,
  releasePromoUse,
  reservePromoUse,
  type PromoCheck,
} from "@/lib/promo-server";

type IncomingItem = { id: string; qty: number };

// Привязка заказа к аккаунту — «по возможности»: если проверка сессии долго
// не отвечает, не блокируем оформление (заказ просто будет без user).
async function bestEffortUserId(): Promise<string | null> {
  try {
    const result = await Promise.race([
      getSession(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
    ]);
    return result?.userId ?? null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  // Запрос обязан прийти с нашей же страницы (см. lib/csrf.ts).
  const csrf = csrfGuard(request);
  if (csrf) return csrf;

  let body: {
    customer_name?: string;
    phone?: string;
    email?: string;
    address?: string;
    comment?: string;
    delivery_method?: string;
    region_kladr?: string | null;
    items?: IncomingItem[];
    promo_code?: string | null;
    captchaToken?: string;
    consent?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const { customer_name, phone, address, email, comment } = body;
  const delivery_method = normalizeDeliveryMethod(body.delivery_method);
  // Целые количества, потолок на позицию и на число позиций, дубли слиты.
  const items = normalizeCheckoutItems(body.items);
  // Промокод: с клиента приходит ТОЛЬКО код. Правило скидки и сам факт, что
  // код ещё не потрачен, проверяются ниже по базе — присланному размеру
  // скидки здесь верить нечему, его просто нет.
  const promoCode = normalizePromoCode(body.promo_code);

  if (!customer_name?.trim() || !phone?.trim() || !address?.trim()) {
    return NextResponse.json(
      { error: "Заполните имя, телефон и адрес доставки" },
      { status: 400 }
    );
  }
  // E-mail обязателен: на него уходит фискальный чек (54-ФЗ) и письма о заказе.
  // Без адреса Robokassa не может доставить чек покупателю.
  if (!email?.trim() || !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email.trim())) {
    return NextResponse.json(
      { error: "Укажите e-mail — на него придут чек и письма о заказе" },
      { status: 400 }
    );
  }
  if (items.length === 0) {
    return NextResponse.json({ error: "Корзина пуста" }, { status: 400 });
  }
  // Согласие на обработку ПД. На странице оформления галочка есть и снята по
  // умолчанию, но проверять её обязан сервер: иначе это украшение, а согласия
  // на самом деле нет ни у кого (152-ФЗ, см. lib/consent.ts).
  if (!hasConsent(body.consent)) {
    return NextResponse.json(
      { error: CONSENT_REQUIRED_MESSAGE },
      { status: 400 }
    );
  }

  // Ozon не возит в Крым, Калининград и на Камчатку — не даём оформить такой
  // заказ, даже если клиентскую проверку обошли. Проверяем по нормализованному
  // коду региона DaData (если пришёл), иначе — по свободному тексту адреса.
  if (delivery_method === "ozon") {
    const restricted = ozonRestriction({
      regionKladrId: body.region_kladr,
      address,
    });
    if (restricted) {
      return NextResponse.json(
        {
          error: `Доставка Ozon в регион «${restricted}» недоступна. Выберите другой пункт выдачи или Почту России.`,
        },
        { status: 400 }
      );
    }
  }

  // Ограничение частоты оформления с одного IP — чтобы нельзя было массово
  // создавать заказы (резервировать весь склад, спамить письмами продавцу).
  // Лимитер в памяти воркера — достаточно как приложенческий слой поверх
  // nginx limit_req (см. deploy/nginx.conf).
  const ip = clientIp(request);
  if (!allowAttempt(`checkout:${ip ?? "?"}`, 15, 5 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Слишком много попыток оформления — подождите пару минут" },
      { status: 429 }
    );
  }

  // Антибот-капча (если подключена) — до любых операций с базой.
  if (!(await verifyCaptcha(body.captchaToken, ip, { failClosed: true }))) {
    return NextResponse.json(
      { error: "Подтвердите, что вы не робот" },
      { status: 400 }
    );
  }

  // Демо-режим без PocketBase: цены проверить негде — отдаём псевдо-номер.
  if (!isDbConfigured() || !hasAdminCredentials()) {
    if (promoCode) {
      // Без базы «один раз на аккаунт» не проверить — скидку не даём.
      return NextResponse.json(
        {
          error: "Промокоды временно недоступны — оформите заказ без кода",
          promoError: true,
        },
        { status: 503 }
      );
    }
    return NextResponse.json({
      id: Math.floor(Date.now() / 1000) % 1000000,
      total: 0,
      demo: true,
    });
  }

  const isTimeout = (e: unknown) => {
    const t = `${(e as Error)?.name ?? ""} ${(e as Error)?.message ?? ""}`.toLowerCase();
    return t.includes("abort") || t.includes("timeout") || t.includes("fetch failed");
  };

  try {
    const pb = await pbAdmin();

    // Параллельно: авторитетные цены (суперпользователем) и best-effort
    // привязка к аккаунту.
    const params: Record<string, string> = {};
    const or = items.map((it, i) => {
      params[`id${i}`] = it.id;
      return `id = {:id${i}}`;
    });
    const [productRecords, bestEffortUser] = await Promise.all([
      pb.collection("products").getFullList({ filter: pb.filter(or.join(" || "), params) }),
      bestEffortUserId(),
    ]);
    let userId = bestEffortUser;

    const priceList = productRecords.map(mapProduct);

    const lines = items
      .map((i) => {
        const p = priceList.find((x) => x.id === i.id);
        if (!p) return null;
        return { product: p.id, name: p.name, price: p.price, qty: i.qty, stock: p.stock };
      })
      .filter(Boolean) as {
      product: string;
      name: string;
      price: number;
      qty: number;
      stock: number;
    }[];

    if (lines.length === 0) {
      return NextResponse.json({ error: "Товары не найдены" }, { status: 400 });
    }

    // Сумма товаров — база и для скидки, и для доставки, и для итога.
    const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);

    // ===== Промокод: проверки ДО любых записей =====
    // Порядок важен: сначала убеждаемся, что код вообще существует и что
    // покупатель вошёл в аккаунт, и только потом (после резерва товара)
    // закрепляем код за аккаунтом. Так неудачная проверка не оставляет за
    // собой ни списанных остатков, ни «сгоревшего» промокода.
    let promo: PromoCheck | null = null;
    if (promoCode) {
      // Привязка к аккаунту здесь обязана быть достоверной: bestEffortUserId
      // отдаёт null и при медленной проверке сессии, а «не смогли проверить»
      // не должно превращаться ни в «гость» (обидно), ни тем более в скидку
      // без учёта использования. Поэтому — строгая проверка.
      if (!userId) {
        try {
          userId = (await getSession()).userId;
        } catch {
          return NextResponse.json(
            {
              error: "Не удалось проверить аккаунт — попробуйте ещё раз",
              promoError: true,
            },
            { status: 503 }
          );
        }
      }
      // Условия кода (срок, порог, лимиты, «только первый заказ») проверяет та
      // же функция, что и корзина, — расходиться им нельзя. Сумма здесь уже
      // авторитетная: посчитана по ценам из базы.
      promo = await checkPromo(pb, { code: promoCode, userId, subtotal });
      if (!promo.ok) {
        return NextResponse.json(
          {
            error: promo.error,
            promoError: true,
            ...(promo.needAuth ? { needAuth: true } : {}),
          },
          { status: promo.status }
        );
      }
    }
    const promoRule = promo?.ok ? promo.rule : null;

    // Предпроверка наличия по свежим данным БД — чтобы в типовом случае
    // (устаревшая корзина) вернуть понятное пер-товарное сообщение.
    const shortages = findStockIssues(lines);
    if (shortages.length > 0) {
      return NextResponse.json(
        { error: stockShortageMessage(shortages) },
        { status: 409 }
      );
    }

    // Атомарное резервирование: списание всех позиций одной транзакцией
    // PocketBase (min: 0 на stock не даст уйти в минус). Именно здесь
    // закрывается гонка «двое покупают последний пакетик»: предпроверку выше
    // могли пройти оба, но транзакция спишет остаток только одному.
    const reserveLines = lines.map((l) => ({ productId: l.product, qty: l.qty }));
    if ((await reserveStock(pb, reserveLines)) === "conflict") {
      // Кто-то успел выкупить остаток между предпроверкой и списанием.
      // Перечитываем остатки ради точного сообщения.
      const fresh = await pb
        .collection("products")
        .getFullList({ filter: pb.filter(or.join(" || "), params), fields: "id,name,stock" })
        .catch(() => null);
      const freshShortages = fresh
        ? findStockIssues(
            lines.map((l) => {
              const f = fresh.find((x) => x.id === l.product);
              return { name: l.name, qty: l.qty, stock: f ? Number(f.stock) || 0 : 0 };
            })
          )
        : [];
      return NextResponse.json(
        {
          error:
            freshShortages.length > 0
              ? stockShortageMessage(freshShortages)
              : "Не получилось зарезервировать товар — остатки только что изменились. Попробуйте ещё раз.",
        },
        { status: 409 }
      );
    }

    // ===== Промокод: закрепление за аккаунтом =====
    // Ровно один раз на аккаунт обеспечивает уникальный индекс (user, code) в
    // коллекции promo_uses: одновременные оформления сериализуются базой, и
    // вставку получает только одно из них. Резерв снимается на всех откатах
    // ниже (заказ не создался, состав не сохранился, платёж не завёлся).
    let promoUseId: string | null = null;
    let discount = 0;
    if (promo?.ok) {
      // Запись об использовании нужна только кодам «один раз на аккаунт» —
      // именно она (через уникальный индекс) и делает их одноразовыми.
      // Многоразовый код и код для гостей обходятся без неё.
      if (promo.record.oncePerUser && userId) {
        const reserved = await reservePromoUse(pb, userId, promo.rule.code);
        if (reserved.status !== "reserved") {
          await releaseStock(pb, reserveLines);
          return NextResponse.json(
            {
              error:
                reserved.status === "used"
                  ? "Этот промокод уже использован на вашем аккаунте"
                  : "Не удалось проверить промокод — попробуйте ещё раз",
              promoError: true,
            },
            { status: reserved.status === "used" ? 409 : 503 }
          );
        }
        promoUseId = reserved.id;
      }
      // Скидка посчитана в checkPromo от авторитетных цен из базы.
      discount = promo.discount;
    }

    // Сумма и доставка: стоимость доставки считаем НА СЕРВЕРЕ по тем же
    // правилам, что и на странице оформления (Почта России бесплатно от
    // порога) — клиенту не доверяем. Скидка по промокоду уменьшает только
    // товары: порог бесплатной доставки берётся от суммы ДО скидки (так же
    // показано в корзине и на оформлении).
    const deliveryCost = deliveryCostFor(delivery_method, subtotal);
    const total = Math.max(0, subtotal - discount) + deliveryCost;

    // Данные будущего заказа: одинаковые и для оплаты при получении, и для
    // онлайн-оплаты. Персональные данные шифруются здесь один раз — дальше
    // ходят и хранятся уже зашифрованными.
    const payload = {
      customer_name: customer_name.trim(),
      phone: encryptField(phone.trim()) ?? "",
      email: encryptField(email?.trim() || null) ?? "",
      address: encryptField(address.trim()) ?? "",
      comment: comment?.trim() || "",
      delivery_method,
      delivery_cost: deliveryCost,
      promo_code: promoRule && discount > 0 ? promoRule.code : "",
      discount,
      total,
      user: userId ?? "",
      items: lines.map((l) => ({
        product: l.product,
        name: l.name,
        price: l.price,
        qty: l.qty,
      })),
    };

    // Фоновая уборка зависших попыток оплаты — не задерживает текущее
    // оформление и не роняет его при ошибке.
    void cleanupStalePendingOrders(pb).catch(() => {});

    // ===== Онлайн-оплата (если подключена Robokassa) =====
    // Заказ создаётся ЗДЕСЬ, со статусом оплаты «ожидает оплаты»: продавец
    // видит в админке и незавершённые попытки, а покупатель может доплатить
    // заказ позже кнопкой «Оплатить» в личном кабинете. Деньги подтвердит
    // уведомление Result URL (или возврат покупателя, или уборка) — тогда
    // статус станет «оплачен». Счёт в Robokassa нигде не «регистрируется»
    // заранее: сайт подписывает параметры Паролем#1 и отдаёт браузеру данные
    // POST-формы.
    if (isRobokassaConfigured()) {
      let order: { id: string; number: number } | null = null;
      try {
        const invoiceId = await nextInvoiceId(pb);
        order = await createOrderWithItems(pb, payload, {
          invoiceId,
          paymentStatus: "pending",
        });
        if (promoUseId) await attachPromoUseToOrder(pb, promoUseId, order.id);
        await recordConsent(pb, {
          email: email?.trim() || null,
          purpose: "order",
          userId,
          reference: `заказ №${order.number}`,
        });

        const ttl = invoiceTtlMinutes();
        const payment = buildRobokassaPayment({
          invId: invoiceId,
          amount: total,
          description: `Заказ №${order.number} на ${lines.reduce((s, l) => s + l.qty, 0)} шт.`,
          email: email?.trim() || null,
          // Состав — для фискального чека (если чек включён): скидка по
          // промокоду размазывается по товарам, доставка идёт отдельной
          // позицией-услугой, сумма чека сходится с суммой платежа.
          lines: lines.map((l) => ({ name: l.name, price: l.price, qty: l.qty })),
          deliveryCost,
          discount,
          // Счёт протухает раньше, чем уборка снимет резерв, — иначе
          // покупатель мог бы оплатить заказ, товар из которого уже вернули
          // в продажу.
          expiresAt: ttl > 0 ? new Date(Date.now() + ttl * 60_000) : null,
        });

        // «Заказ принят, ожидает оплаты» — сразу: номер у покупателя на руках
        // ещё до банка, и в письме написано, где продолжить оплату.
        void mailOrderAccepted(order, payload, { awaitingPayment: true }).catch(
          () => {}
        );

        // id страница НЕ получает: при онлайн-оплате она уходит на Robokassa,
        // а на страницу заказа её вернёт Success URL уже по номеру заказа.
        return NextResponse.json({ number: order.number, invoiceId, total, payment });
      } catch (e) {
        // Заказ не создался или настройки кривые (например, неизвестный
        // алгоритм хеша) — возвращаем резерв, корзина у покупателя цела.
        console.error("[checkout] не удалось подготовить оплату Robokassa:", e);
        if (order) {
          await pb.collection("orders").delete(order.id).catch(() => {});
        }
        await releaseStock(pb, reserveLines);
        if (promoUseId) await releasePromoUse(pb, promoUseId);
        return NextResponse.json(
          {
            error:
              "Онлайн-оплата сейчас недоступна — заказ не оформлен, товары остались в корзине. Попробуйте ещё раз через пару минут.",
          },
          { status: 502 }
        );
      }
    }

    // ===== Без онлайн-оплаты: заказ оформлен сразу и окончательно =====
    // Товар уже зарезервирован выше (reserveStock) — повторно списывать не
    // нужно.
    let order: { id: string; number: number };
    try {
      order = await createOrderWithItems(pb, payload, {
        paymentStatus: "unpaid",
      });
    } catch (e) {
      // Заказ не создался — возвращаем зарезервированный товар и промокод.
      await releaseStock(pb, reserveLines);
      if (promoUseId) await releasePromoUse(pb, promoUseId);
      throw e;
    }

    // Привязываем использование промокода к заказу: по этой связи код
    // вернётся покупателю, если заказ потом удалят.
    if (promoUseId) await attachPromoUseToOrder(pb, promoUseId, order.id);
    await recordConsent(pb, {
      email: email?.trim() || null,
      purpose: "order",
      userId,
      reference: `заказ №${order.number}`,
    });

    // Шлём «заказ принят».
    if (email?.trim()) {
      void mailOrderPlaced(
        { to: email.trim(), number: order.number, name: customer_name.trim() },
        lines.map((l) => ({ name: l.name, price: l.price, qty: l.qty })),
        {
          total,
          deliveryCost,
          deliveryMethod: delivery_method,
          discount,
          promoCode: discount > 0 ? promoRule?.code ?? null : null,
        }
      ).catch(() => {});
    }
    // Уведомление продавцу «у вас новый заказ». При онлайн-оплате оно уходит
    // из callback после успешной оплаты (см. app/api/payment/callback).
    void notifyNewOrder({
      id: order.id,
      number: order.number,
      total,
      deliveryCost,
      deliveryMethod: delivery_method,
      discount,
      promoCode: discount > 0 ? promoRule?.code ?? null : null,
      paid: false,
      customer: {
        name: customer_name.trim(),
        phone: phone.trim(),
        email: email?.trim() || null,
        address: address.trim(),
        comment: comment?.trim() || null,
      },
      items: lines.map((l) => ({ name: l.name, price: l.price, qty: l.qty })),
    }).catch(() => {});

    return NextResponse.json({ id: order.number, total });
  } catch (e) {
    return NextResponse.json(
      {
        error: isTimeout(e)
          ? "База долго отвечает, попробуйте ещё раз"
          : "Не удалось создать заказ",
      },
      { status: 503 }
    );
  }
}
