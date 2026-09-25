import { pbAdmin } from "@/lib/pb/server";
import { verifyOrderResumeToken } from "@/lib/order-resume";
import PayOrderButton from "@/components/pay-order-button";
import { servicePageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = { ...servicePageMetadata("/order/continue", "Продолжить оформление"), robots: { index: false, follow: false }, referrer: "no-referrer" as const };

export default async function ContinueOrder({ params }: { params: { token: string } }) {
  const id = verifyOrderResumeToken(params.token);
  const pb = id ? await pbAdmin() : null;
  const order = id && pb ? await pb.collection("orders").getOne(id).catch(() => null) : null;
  if (!order) return <div className="container py-12">Ссылка недействительна или срок её действия истёк. Обратитесь в поддержку.</div>;
  const finished = order.payment_status === "paid" || order.payment_status === "refunded";
  return <div className="container max-w-lg py-12">
    <div className="card p-6 text-center">
      <h1 className="mb-4 text-xl font-bold">Заказ №{order.number}</h1>
      {finished ? <p>Этот заказ уже оплачен.</p> : order.status === "cancelled" ? <p>Заказ отменён. Обратитесь в поддержку.</p> : <>
        <p className="mb-6">Заказ сохранён и ожидает оплаты. Регистрация не требуется.</p>
        <PayOrderButton resumeToken={params.token} label="Продолжить оформление" />
      </>}
    </div>
  </div>;
}
