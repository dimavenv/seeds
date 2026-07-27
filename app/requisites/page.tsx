import type { Metadata } from "next";
import { ORGANIZATION } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Реквизиты продавца",
  description:
    "Полные реквизиты продавца интернет-магазина «Томат Семена»: " +
    "наименование ИП, ИНН, ОГРНИП, адрес и контактный e-mail.",
  alternates: { canonical: "/requisites" },
};

// Реквизиты продавца берём из lib/seo: те же значения уходят в микроразметку
// Organization в корневом layout. Держать их в одном месте важно — расхождение
// между видимой страницей и разметкой поисковик трактует как недостоверные
// данные, а Яндекс отдельно смотрит на полноту контактов («коммерческие
// факторы»).
export default function RequisitesPage() {
  return (
    <div className="container-page py-10">
      <div className="card mx-auto max-w-2xl p-8">
        <h1 className="text-3xl font-extrabold text-brand-800">Реквизиты</h1>
        <div className="mt-5 space-y-3 leading-relaxed text-brand-700">
          <p>
            Продавец интернет-магазина «Tomat Semena» (tomatsemena.ru):
          </p>
          <table className="w-full text-sm">
            <tbody className="[&_td]:border-t [&_td]:border-brand-100 [&_td]:py-2 [&_td:first-child]:pr-4 [&_td:first-child]:text-brand-500">
              <tr><td>Наименование</td><td><strong>{ORGANIZATION.legalName}</strong></td></tr>
              <tr><td>ИНН</td><td>{ORGANIZATION.taxId}</td></tr>
              <tr><td>ОГРНИП</td><td>{ORGANIZATION.registrationId}</td></tr>
              <tr>
                <td>Адрес</td>
                <td>
                  {ORGANIZATION.postalCode}, Россия,{" "}
                  {ORGANIZATION.addressRegion}, г. {ORGANIZATION.addressLocality}
                </td>
              </tr>
              <tr><td>E-mail</td><td>{ORGANIZATION.email}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
