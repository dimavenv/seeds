import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Реквизиты — Tomat Semena",
};

// ВАЖНО: заполните реквизиты ИП реальными данными — их проверяет банк при
// подключении эквайринга и требует закон. Значения в [квадратных скобках].
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
              <tr><td>Наименование</td><td><strong>ИП [Фамилия Имя Отчество]</strong></td></tr>
              <tr><td>ИНН</td><td>[указать ИНН]</td></tr>
              <tr><td>ОГРНИП</td><td>[указать ОГРНИП]</td></tr>
              <tr><td>Адрес</td><td>[указать адрес регистрации]</td></tr>
              <tr><td>Телефон</td><td>[указать телефон]</td></tr>
              <tr><td>E-mail</td><td>info@tomatsemena.ru</td></tr>
              <tr><td>Режим работы</td><td>Пн–Вс: 9:00–20:00</td></tr>
            </tbody>
          </table>
          <p className="pt-2 text-sm text-brand-500">
            Расчётный счёт и данные банка указывать на сайте не обязательно —
            они нужны банку-эквайеру, а не в публичном доступе.
          </p>
        </div>

        <p className="mt-6 text-sm text-brand-500">
          Заполните реальные данные ИП в{" "}
          <code className="rounded bg-brand-100 px-1">app/requisites/page.tsx</code>
          {" "}(и те же данные в{" "}
          <code className="rounded bg-brand-100 px-1">app/privacy/page.tsx</code>).
        </p>
      </div>
    </div>
  );
}
