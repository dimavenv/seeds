import { describe, expect, it } from "vitest";
import {
  capQty,
  mergeCartsWithStock,
  nextRemovedPending,
  resolveCartOnLoad,
  subtractRemoved,
} from "@/lib/cart-sync";
import { MAX_QTY_PER_ITEM } from "@/lib/checkout";
import type { CartItem } from "@/lib/types";

const GUEST_ID = "guestitem000001";
const ACC_ID = "accountitem0001";
const USER = "user12345678901";

function ci(id: string, qty = 1, over: Partial<CartItem> = {}): CartItem {
  return {
    id,
    slug: `slug-${id}`,
    name: `Товар ${id}`,
    price: 100,
    image_url: null,
    qty,
    ...over,
  };
}

const ids = (list: CartItem[]) => list.map((i) => i.id).sort();

// Базовый набор входных данных: гость с товаром + аккаунт со своим товаром.
function loginInput(over: Partial<Parameters<typeof resolveCartOnLoad>[0]> = {}) {
  return {
    localCart: [ci(GUEST_ID, 2)],
    localWishlist: [GUEST_ID],
    serverCart: [ci(ACC_ID, 1)],
    serverWishlist: [ACC_ID],
    serverExists: true,
    syncedUser: null as string | null,
    userId: USER,
    justLoggedIn: true,
    ...over,
  };
}

describe("вход в аккаунт: гостевая корзина не теряется", () => {
  // Тот самый сценарий из живой проверки, который падал.
  it("непустая гостевая корзина + непустая корзина аккаунта → после входа ОБЕ на месте", () => {
    const r = resolveCartOnLoad(loginInput());
    expect(r.action).toBe("merge");
    expect(ids(r.cart)).toEqual([ACC_ID, GUEST_ID].sort());
    expect(r.cart).toHaveLength(2);
    // Избранное тоже объединяется.
    expect(r.wishlist.sort()).toEqual([ACC_ID, GUEST_ID].sort());
  });

  // Корневая причина бага: метка синхронизации осталась от прошлой сессии в
  // этом браузере (сессия кончилась без загрузки страницы «как гость»), и
  // серверная корзина побеждала.
  it("метка SYNC_KEY от прошлой сессии НЕ должна отменять слияние при входе", () => {
    const r = resolveCartOnLoad(loginInput({ syncedUser: USER }));
    expect(r.action).toBe("merge");
    expect(ids(r.cart)).toEqual([ACC_ID, GUEST_ID].sort());
  });

  it("количество общего товара — большее из двух, а не сумма", () => {
    const r = resolveCartOnLoad(
      loginInput({
        localCart: [ci(GUEST_ID, 2)],
        serverCart: [ci(GUEST_ID, 5)],
      })
    );
    expect(r.cart).toHaveLength(1);
    expect(r.cart[0].qty).toBe(5);
  });

  it("пустая корзина аккаунта — гостевые товары сохраняются", () => {
    const r = resolveCartOnLoad(
      loginInput({ serverCart: [], serverWishlist: [] })
    );
    expect(ids(r.cart)).toEqual([GUEST_ID]);
  });

  it("пустая гостевая корзина — корзина аккаунта сохраняется", () => {
    const r = resolveCartOnLoad(
      loginInput({ localCart: [], localWishlist: [] })
    );
    expect(ids(r.cart)).toEqual([ACC_ID]);
  });

  it("записи user_store ещё нет — гостевая корзина всё равно не теряется", () => {
    const r = resolveCartOnLoad(
      loginInput({ serverExists: false, serverCart: [], serverWishlist: [] })
    );
    expect(r.action).toBe("merge");
    expect(ids(r.cart)).toEqual([GUEST_ID]);
  });
});

describe("обычная загрузка страницы (без входа): сервер — источник истины", () => {
  it("метка совпадает и запись есть → берём серверную корзину", () => {
    const r = resolveCartOnLoad(
      loginInput({ justLoggedIn: false, syncedUser: USER })
    );
    expect(r.action).toBe("trust-server");
    expect(ids(r.cart)).toEqual([ACC_ID]);
  });

  it("корзину очистили на другом устройстве — она НЕ воскресает из localStorage", () => {
    const r = resolveCartOnLoad(
      loginInput({
        justLoggedIn: false,
        syncedUser: USER,
        serverCart: [],
        serverWishlist: [],
      })
    );
    expect(r.action).toBe("trust-server");
    expect(r.cart).toEqual([]);
  });

  it("записи user_store нет → пустой сервер не затирает локальную корзину", () => {
    const r = resolveCartOnLoad(
      loginInput({
        justLoggedIn: false,
        syncedUser: USER,
        serverExists: false,
        serverCart: [],
        serverWishlist: [],
      })
    );
    expect(r.action).toBe("merge");
    expect(ids(r.cart)).toEqual([GUEST_ID]);
  });

  it("на устройстве был другой пользователь → сливаем, а не верим метке", () => {
    const r = resolveCartOnLoad(
      loginInput({ justLoggedIn: false, syncedUser: "otheruser000001" })
    );
    expect(r.action).toBe("merge");
    expect(ids(r.cart)).toEqual([ACC_ID, GUEST_ID].sort());
  });
});

describe("локальное новее серверного снимка (keep-local)", () => {
  it("действия во время загрузки снимка не перетираются сервером", () => {
    // Пользователь удалил ACC_ID из корзины, пока грузился loadUserStore();
    // серверный снимок сделан ДО удаления — верить ему нельзя.
    const r = resolveCartOnLoad(
      loginInput({
        justLoggedIn: false,
        syncedUser: USER,
        localCart: [ci(GUEST_ID, 2)],
        serverCart: [ci(GUEST_ID, 2), ci(ACC_ID, 1)],
        localIsNewer: true,
      })
    );
    expect(r.action).toBe("keep-local");
    expect(ids(r.cart)).toEqual([GUEST_ID]);
    expect(r.wishlist).toEqual([GUEST_ID]); // и избранное локальное
  });

  it("keep-local важнее правила «слить при входе»", () => {
    const r = resolveCartOnLoad(loginInput({ localIsNewer: true }));
    expect(r.action).toBe("keep-local");
    expect(ids(r.cart)).toEqual([GUEST_ID]);
  });
});

describe("надгробия удалённых товаров (removedPending)", () => {
  // Приоритетный сценарий: удалил товар → запись на сервер полностью не
  // прошла (провайдер снял SYNC_KEY после исчерпания повторов) → перезагрузка.
  // Без надгробия merge объединил бы корзины и товар воскрес из устаревшей
  // серверной копии.
  it("удалил товар → запись не прошла → перезагрузка: товар остаётся удалённым", () => {
    const r = resolveCartOnLoad(
      loginInput({
        justLoggedIn: false,
        syncedUser: null, // SYNC_KEY снята после неудачной записи
        localCart: [ci(GUEST_ID, 2)], // удалённого ACC_ID уже нет
        serverCart: [ci(GUEST_ID, 2), ci(ACC_ID, 1)], // сервер устарел
        removedPending: [ACC_ID],
      })
    );
    expect(r.action).toBe("merge");
    expect(ids(r.cart)).toEqual([GUEST_ID]);
  });

  it("перезагрузка, пока запись ещё в полёте (trust-server): надгробие тоже вычитается", () => {
    const r = resolveCartOnLoad(
      loginInput({
        justLoggedIn: false,
        syncedUser: USER, // метка на месте — запись не «провалилась», а не успела
        localCart: [ci(GUEST_ID, 2)],
        serverCart: [ci(GUEST_ID, 2), ci(ACC_ID, 1)],
        removedPending: [ACC_ID],
      })
    );
    expect(r.action).toBe("trust-server");
    expect(ids(r.cart)).toEqual([GUEST_ID]);
  });

  it("при входе в аккаунт гостевые надгробия игнорируются", () => {
    // Гость удалял из СВОЕЙ корзины; тот же товар в корзине аккаунта — чужое
    // состояние, его стирать нельзя.
    const r = resolveCartOnLoad(
      loginInput({ removedPending: [ACC_ID] }) // justLoggedIn: true
    );
    expect(r.action).toBe("merge");
    expect(ids(r.cart)).toEqual([ACC_ID, GUEST_ID].sort());
  });

  // Явная проверка семантики количества: общий товар в двух снимках с разным
  // qty даёт БОЛЬШЕЕ из двух (max), а не сумму — иначе каждое слияние
  // локальной и серверной копий одной корзины удваивало бы количество.
  it("общий товар с разным количеством: max, а не сумма (2 и 5 → 5, не 7)", () => {
    const r = resolveCartOnLoad(
      loginInput({
        justLoggedIn: false,
        syncedUser: null,
        localCart: [ci(GUEST_ID, 2)],
        serverCart: [ci(GUEST_ID, 5)],
      })
    );
    expect(r.cart).toHaveLength(1);
    expect(r.cart[0].qty).toBe(5);
  });

  it("…и в другую сторону (5 локально, 2 на сервере → 5)", () => {
    const r = resolveCartOnLoad(
      loginInput({
        justLoggedIn: false,
        syncedUser: null,
        localCart: [ci(GUEST_ID, 5)],
        serverCart: [ci(GUEST_ID, 2)],
      })
    );
    expect(r.cart[0].qty).toBe(5);
  });
});

describe("nextRemovedPending / subtractRemoved", () => {
  it("удаление добавляет надгробие, повторное добавление — снимает", () => {
    const a = ci("itemaaaaaaaaaaa");
    const b = ci("itembbbbbbbbbbb");
    let tombs = nextRemovedPending([], [a, b], [b]); // удалили a
    expect(tombs).toEqual([a.id]);
    tombs = nextRemovedPending(tombs, [b], [b, a]); // вернули a
    expect(tombs).toEqual([]);
  });

  it("очистка корзины ставит надгробия на все позиции", () => {
    const a = ci("itemaaaaaaaaaaa");
    const b = ci("itembbbbbbbbbbb");
    expect(nextRemovedPending([], [a, b], []).sort()).toEqual(
      [a.id, b.id].sort()
    );
  });

  it("старые надгробия сохраняются между действиями", () => {
    const a = ci("itemaaaaaaaaaaa");
    const b = ci("itembbbbbbbbbbb");
    const tombs = nextRemovedPending([a.id], [b], []); // ранее удалён a, теперь b
    expect(tombs.sort()).toEqual([a.id, b.id].sort());
  });

  it("subtractRemoved убирает только перечисленные id", () => {
    const a = ci("itemaaaaaaaaaaa");
    const b = ci("itembbbbbbbbbbb");
    expect(subtractRemoved([a, b], [a.id])).toEqual([b]);
    expect(subtractRemoved([a, b], [])).toEqual([a, b]);
  });
});

describe("mergeCartsWithStock / capQty", () => {
  it("не мутирует исходные корзины", () => {
    const a = [ci(GUEST_ID, 2)];
    const b = [ci(GUEST_ID, 9)];
    const before = JSON.stringify([a, b]);
    mergeCartsWithStock(a, b);
    expect(JSON.stringify([a, b])).toBe(before);
  });

  it("количество ограничивается известным остатком", () => {
    const r = mergeCartsWithStock([ci(GUEST_ID, 10, { stock: 3 })], []);
    expect(r[0].qty).toBe(3);
  });

  it("остаток берётся из свежей (серверной) записи", () => {
    const r = mergeCartsWithStock(
      [ci(GUEST_ID, 10, { stock: 99 })],
      [ci(GUEST_ID, 1, { stock: 2 })]
    );
    expect(r[0].qty).toBe(2);
  });

  it("нулевой остаток не выкидывает позицию, но количество не ниже 1", () => {
    const r = mergeCartsWithStock([ci(GUEST_ID, 5, { stock: 0 })], []);
    expect(r).toHaveLength(1);
    expect(r[0].qty).toBe(1);
  });

  it("потолок количества соблюдается", () => {
    expect(capQty(1e9, null)).toBe(MAX_QTY_PER_ITEM);
    expect(capQty(2.9, null)).toBe(2);
    expect(capQty(5, 3)).toBe(3);
    expect(capQty(5, undefined)).toBe(5);
  });
});
