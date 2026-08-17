import type { ImageVariantMap } from "@/lib/image-variants";

// ID записей — строки PocketBase (15 символов). У заказов дополнительно есть
// человекочитаемый номер `number` (у перенесённых из Supabase заказов он
// совпадает со старым числовым id).

export type Category = {
  id: string;
  slug: string;
  name: string;
  sort_order: number;
  // Вступительный текст над сеткой товаров и переопределения меты. Пустые
  // строки приходят как null: страница категории тогда собирает title и
  // description сама (см. app/catalog/[category]/page.tsx). Заполняются в
  // админке PocketBase.
  description?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
};

export type Product = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price: number;
  category_id: string | null;
  image_url: string | null;
  images?: string[] | null;
  // Облегчённые WebP-варианты: «адрес оригинала → { ширина: адрес }».
  // Пусто у фото, загруженных до появления вариантов, — тогда показывается
  // оригинал (см. components/product-image.tsx).
  image_variants?: ImageVariantMap;
  stock: number;
  seeds_per_pack?: number | null;
  is_new: boolean;
  is_featured: boolean;
  created_at: string;
  category?: Pick<Category, "slug" | "name"> | null;
};

export type OrderStatus =
  | "new"
  | "processing"
  | "shipped"
  | "done"
  | "cancelled";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  new: "Новый",
  processing: "В обработке",
  shipped: "Отправлен",
  done: "Выполнен",
  cancelled: "Отменён",
};

export type PaymentStatus =
  | "unpaid"
  | "pending"
  | "paid"
  | "failed"
  | "refunded";

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: "Без онлайн-оплаты",
  pending: "Ожидает оплаты",
  paid: "Оплачен",
  failed: "Оплата не прошла",
  refunded: "Возврат",
};

export type Order = {
  id: string;
  number: number;
  customer_name: string;
  phone: string;
  email: string | null;
  address: string;
  comment: string | null;
  status: OrderStatus;
  total: number;
  delivery_method?: string | null;
  delivery_cost?: number | null;
  // Промокод, применённый при оформлении, и скидка по нему в рублях.
  // Скидка снимается только с товаров: total = товары − discount + доставка.
  promo_code?: string | null;
  discount?: number;
  tracking_number?: string | null;
  payment_status?: PaymentStatus;
  // Номер счёта в Robokassa (InvId): по нему заказ находится в личном кабинете
  // и по нему же делается возврат.
  invoice_id?: number | null;
  // Сколько рублей уже возвращено покупателю (частичные возвраты суммируются).
  refunded_amount?: number;
  user_id: string | null;
  created_at: string;
  order_items?: OrderItem[];
};

export type SupportRequest = {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: string;
  // Ответ продавца (зашифрован, как и message) и когда он отправлен.
  reply?: string | null;
  replied_at?: string | null;
  user_id: string | null;
  created_at: string;
};

export type OrderItem = {
  id: string;
  order_id: string;
  product_id: string | null;
  name: string;
  price: number;
  qty: number;
  // Сколько штук из qty возвращено покупателю деньгами.
  refunded_qty?: number;
};

export type ReviewStatus = "pending" | "approved" | "rejected";

export type Review = {
  id: string;
  user_id: string | null;
  order_id: string | null;
  author_name: string;
  rating: number;
  text: string;
  status: ReviewStatus;
  source: string | null;
  created_at: string;
};

export type CartItem = {
  id: string;
  slug: string;
  name: string;
  price: number;
  image_url: string | null;
  // Облегчённое фото для миниатюры в корзине (WebP 400px). У старых корзин и
  // у фото без вариантов поля нет — тогда показывается image_url.
  image_thumb?: string | null;
  qty: number;
  // Остаток на складе на момент добавления — ограничивает счётчик количества.
  // У старых сохранённых корзин поля нет; тогда лимит проверяет только сервер.
  stock?: number | null;
};
