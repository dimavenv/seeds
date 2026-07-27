import { NextResponse } from "next/server";
import { getSessionPb } from "@/lib/auth";
import { isValidRecordId, mapReview } from "@/lib/pb/shared";

export const dynamic = "force-dynamic";

// Может ли текущий покупатель оставить отзыв об этом сорте.
//
// Только ЧТЕНИЕ и только про самого себя: запросы идут клиентом пользователя,
// а правила PocketBase отдают ему лишь его собственные позиции заказов и его
// собственные неодобренные отзывы. Чужой заказ подставить нельзя, и ответ не
// раскрывает ничего о других покупателях.
//
// Права проверяются ещё раз в submitProductReview — этот роут решает только,
// показывать форму или нет.
export async function GET(request: Request) {
  const productId = new URL(request.url).searchParams.get("product") ?? "";
  const denied = {
    loggedIn: false,
    canReview: false,
    defaultName: "",
    own: null,
  };
  if (!isValidRecordId(productId)) return NextResponse.json(denied);

  try {
    const { session, pb } = await getSessionPb();
    if (!session.userId) return NextResponse.json(denied);

    // Свой отзыв на этот сорт уже есть — показываем его вместе со статусом
    // модерации, повторный оставить нельзя.
    const mine = await pb.collection("reviews").getList(1, 1, {
      filter: pb.filter("product = {:product} && user = {:user}", {
        product: productId,
        user: session.userId,
      }),
    });
    if (mine.items.length > 0) {
      return NextResponse.json({
        loggedIn: true,
        canReview: false,
        defaultName: "",
        own: mapReview(mine.items[0]),
      });
    }

    // Иначе нужен полученный заказ, в котором этот сорт действительно был.
    const items = await pb.collection("order_items").getList(1, 1, {
      filter: pb.filter(
        'product = {:product} && (order.status = "shipped" || order.status = "done")',
        { product: productId }
      ),
      expand: "order",
    });
    const order = items.items[0]?.expand?.order as
      | { customer_name?: string }
      | undefined;

    return NextResponse.json({
      loggedIn: true,
      canReview: items.items.length > 0,
      defaultName: String(order?.customer_name ?? ""),
      own: null,
    });
  } catch {
    // База недоступна — 503, клиент покажет «попробуйте ещё раз» и не станет
    // рисовать форму, отправка которой всё равно бы не прошла.
    return NextResponse.json(
      { error: "Сервис недоступен" },
      { status: 503 }
    );
  }
}
