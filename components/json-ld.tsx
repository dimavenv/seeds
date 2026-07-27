// Вывод микроразметки schema.org одним <script type="application/ld+json">.
//
// Серверный компонент: разметка обязана быть в SSR-HTML. Яндекс исполняет JS
// куда осторожнее Google, и разметку, дорисованную после гидратации, он может
// не увидеть вовсе.
//
// JSON.stringify экранируем: последовательность "</script>" внутри строки
// (например, в описании сорта) иначе закрыла бы тег и сломала страницу.
export default function JsonLd({ data }: { data: unknown }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
