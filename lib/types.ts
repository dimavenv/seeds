export type Category = {
  id: number;
  slug: string;
  name: string;
  sort_order: number;
};

export type Product = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  price: number;
  category_id: number | null;
  image_url: string | null;
  images?: string[] | null;
  stock: number;
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

export type Order = {
  id: number;
  customer_name: string;
  phone: string;
  email: string | null;
  address: string;
  comment: string | null;
  status: OrderStatus;
  total: number;
  delivery_method?: string | null;
  delivery_cost?: number | null;
  user_id: string | null;
  created_at: string;
  order_items?: OrderItem[];
};

export type SupportRequest = {
  id: number;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: string;
  user_id: string | null;
  created_at: string;
};

export type OrderItem = {
  id: number;
  order_id: number;
  product_id: number | null;
  name: string;
  price: number;
  qty: number;
};

export type CartItem = {
  id: number;
  slug: string;
  name: string;
  price: number;
  image_url: string | null;
  qty: number;
};
