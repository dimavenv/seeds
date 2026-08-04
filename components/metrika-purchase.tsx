"use client";

import { useEffect } from "react";
import {
  GOALS,
  dropPurchase,
  pushEcommerce,
  reachGoal,
  takePurchase,
} from "@/lib/metrika";

// Цель «покупка» на странице подтверждения заказа.
//
// Почему именно здесь, а не в момент отправки формы: при онлайн-оплате между
// оформлением и деньгами лежит платёжная страница Robokassa, и заказ ещё может
// сорваться.
// Сюда покупатель попадает уже с результатом (?paid=1 / ?failed=1), либо сразу
// после оформления с оплатой при получении — то есть в момент, когда заказ
// действительно состоялся.
//
// Состав заказа страница «спасибо» не знает (корзина к этому моменту очищена),
// поэтому его кладёт в sessionStorage страница оформления. Забираем состав
// РОВНО ОДИН РАЗ (takePurchase сразу удаляет запись): обновление страницы или
// возврат на неё кнопкой «назад» второй покупки в статистику не добавят.
export default function MetrikaPurchase({
  orderId,
  matchId,
  failed,
}: {
  orderId: string;
  // Запасной идентификатор для сверки: при онлайн-оплате состав заказа
  // складывается ДО оплаты, когда номера заказа ещё нет, — под номером счёта
  // Robokassa. На странице подтверждения он приходит параметром inv.
  matchId?: string | null;
  failed?: boolean;
}) {
  useEffect(() => {
    if (failed) {
      // При неудачной оплате заказа не существует — в цель уходит номер счёта.
      reachGoal(GOALS.paymentFailed, { order_id: matchId ?? orderId });
      // Товары остались в корзине, покупатель может оплатить ещё раз — состав
      // тогда сложит заново страница оформления.
      dropPurchase();
      return;
    }

    const purchase = takePurchase();
    // Записи нет — либо цель уже засчитана, либо страницу открыли по прямой
    // ссылке. Без состава заказа отправлять нечего: восстанавливать «покупку»
    // из адресной строки нельзя, это ломает защиту от двойного счёта.
    if (!purchase) return;
    // Чужой заказ (осталась запись от прошлой попытки) — не подменяем.
    if (purchase.orderId !== orderId && purchase.orderId !== matchId) return;

    pushEcommerce("purchase", purchase.products, {
      id: orderId,
      revenue: purchase.revenue,
      coupon: purchase.coupon,
    });
    // order_price + currency — ценность цели: в отчётах Метрики появится
    // выручка по цели «purchase», а не только количество достижений.
    reachGoal(GOALS.purchase, {
      order_id: orderId,
      order_price: purchase.revenue,
      currency: "RUB",
    });
  }, [orderId, matchId, failed]);

  return null;
}
