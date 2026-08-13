// Поиск по каталогу: разбор запроса и сравнение.
//
// Почему сравниваем в коде, а не фильтром базы. У SQLite (на нём работает
// PocketBase) оператор LIKE регистронезависим ТОЛЬКО для латиницы: «Томат» и
// «томат» для него разные слова. Раньше это обходили перебором вариантов
// написания — искали заодно «томат» и «Томат». Приём разваливался на всём
// остальном: «ТОМАТ» капслоком, «чЕрри», второе слово в запросе («чёрный
// принц» против «Чёрный Принц») и уж тем более «е» вместо «ё».
//
// Здесь всё это решается разом: обе стороны приводятся к одному виду, а запрос
// разбивается на слова, каждое из которых должно найтись. Заодно поиск идёт и
// по описанию, а не только по названию.

// Приведение к сравнимому виду: регистр, «ё» → «е», пробелы.
//
// «ё» и «е» покупатели путают постоянно, и это не их ошибка: на клавиатуре «ё»
// в углу, а в текстах её обычно не ставят. Для поиска это одна буква.
export function normalizeSearch(value: string): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

// Слова запроса. Каждое должно найтись в товаре — так «принц чёрный» находит
// «Томат Чёрный Принц» независимо от порядка слов.
export function searchTokens(query: string): string[] {
  const normalized = normalizeSearch(query);
  return normalized ? normalized.split(" ") : [];
}

// Насколько товар подходит запросу. 0 — не подходит, больше — лучше.
//
// Порядок важнее, чем кажется: без него на запрос «томат» первым может встать
// товар, у которого «томат» только в описании, а карточки самих томатов
// окажутся ниже.
export function searchScore(
  o: { name: string; description?: string | null },
  tokens: string[]
): number {
  if (tokens.length === 0) return 0;
  const name = normalizeSearch(o.name);
  const description = normalizeSearch(o.description ?? "");

  let score = 0;
  for (const token of tokens) {
    if (name.startsWith(token)) score += 100;
    else if (name.includes(` ${token}`)) score += 50; // с начала слова в названии
    else if (name.includes(token)) score += 25;
    else if (description.includes(token)) score += 5;
    else return 0; // слово не нашлось нигде — товар не подходит
  }
  // Короткое название при равном совпадении вернее: «Томат Чёрный принц»
  // ближе к запросу «томат», чем «Томат Чёрный принц, семена от коллекционера».
  return score * 1000 - Math.min(name.length, 999);
}

// Отбор и упорядочивание по совпадению.
export function searchFilter<T extends { name: string; description?: string | null }>(
  items: T[],
  query: string
): T[] {
  const tokens = searchTokens(query);
  if (tokens.length === 0) return items;
  return items
    .map((item) => ({ item, score: searchScore(item, tokens) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.item);
}
