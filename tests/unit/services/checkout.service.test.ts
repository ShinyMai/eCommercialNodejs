import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { Types } from "mongoose";
import { CartModel } from "#/models/cart.model.js";
import { InventoryModel } from "#/models/inventory.model.js";
import { ProductModel } from "#/models/product.model.js";
import CheckoutService, { type ReviewCheckoutPayload } from "#/services/checkout.service.js";
import DiscountService from "#/services/discount.service.js";
import { queryOf } from "../../helpers/fixtures.js";

const buyer = new Types.ObjectId();
const seller = new Types.ObjectId();
const product = new Types.ObjectId();
const cart = new Types.ObjectId();

const makePayload = (): ReviewCheckoutPayload => ({
  cartId: cart.toHexString(),
  accountId: buyer.toHexString(),
  shop_ids: [{ shop_id: seller.toHexString(), items: [{ product_id: product.toHexString(), quantity: 2 }] }],
});

type CatalogEntry = { product: Types.ObjectId; seller: Types.ObjectId; price: number; stock?: number };

/** Mocks the cart, product and inventory reads that a checkout review performs. */
const mockCatalog = (t: TestContext, entries: CatalogEntry[] = [{ product, seller, price: 20, stock: 10 }]) => {
  const cartQuery = t.mock.method(CartModel, "findOne", (filter: { _id: string; cart_account: string }) =>
    queryOf(
      filter._id === cart.toHexString() && filter.cart_account === buyer.toHexString()
        ? { cart_items: entries.map((entry) => ({ product: entry.product, quantity: 1 })) }
        : null,
    ),
  );
  t.mock.method(ProductModel, "find", () =>
    queryOf(entries.map((entry) => ({ _id: entry.product, product_seller: entry.seller, product_price: entry.price }))),
  );
  const inventoryQuery = t.mock.method(InventoryModel, "find", () =>
    queryOf(
      entries
        .filter((entry) => entry.stock !== undefined)
        .map((entry) => ({ inven_productId: entry.product, inven_sellerId: entry.seller, inven_stock: entry.stock })),
    ),
  );
  return { cartQuery, inventoryQuery };
};

test("review prices items from the database and adds the per-line shipping fee", async (t) => {
  mockCatalog(t);
  const result = await CheckoutService.reviewCheckout(makePayload());

  assert.equal(result.checkout_summary[0].items[0].price, 20);
  assert.deepEqual(result.checkout_order, { total_price: 40, fee_shipping: 5, total_discount: 0, total_checkout: 45 });
});

test("the authenticated account overrides the accountId in the body", async (t) => {
  mockCatalog(t);
  const body = { ...makePayload(), accountId: "untrusted" };
  const result = await CheckoutService.reviewCheckout(body, buyer.toHexString());
  assert.equal(result.checkout_order.total_price, 40);
});

test("the payload is validated before any query runs", async (t) => {
  const { cartQuery } = mockCatalog(t);
  await assert.rejects(CheckoutService.reviewCheckout({ cartId: "bad" }, buyer.toHexString()), {
    name: "BadRequestError",
  });
  assert.equal(cartQuery.mock.callCount(), 0);
});

test("a cart owned by someone else is not found", async (t) => {
  mockCatalog(t);
  await assert.rejects(CheckoutService.reviewCheckout(makePayload(), new Types.ObjectId().toHexString()), /Cart not found/);
});

test("items must be in the cart and belong to the selected shop", async (t) => {
  mockCatalog(t, [{ product, seller: new Types.ObjectId(), price: 20, stock: 10 }]);
  await assert.rejects(CheckoutService.reviewCheckout(makePayload()), /not found for this shop/);

  t.mock.restoreAll();
  mockCatalog(t, []);
  await assert.rejects(CheckoutService.reviewCheckout(makePayload()), /not found in cart/);
});

test("stock is checked per product and seller before any discount is calculated", async (t) => {
  const discount = t.mock.method(DiscountService, "getDiscountAmount", async () => ({
    totalPrice: 40,
    eligibleTotalPrice: 40,
    discountAmount: 5,
    finalPrice: 35,
  }));
  const payload = makePayload();
  payload.shop_ids[0].discount_id = new Types.ObjectId().toHexString();

  for (const stock of [1, 0, NaN, -1]) {
    mockCatalog(t, [{ product, seller, price: 20, stock }]);
    await assert.rejects(CheckoutService.reviewCheckout(payload), { name: "ConflictRequestError", statusCode: 409 });
  }
  mockCatalog(t, [{ product, seller, price: 20 }]);
  await assert.rejects(CheckoutService.reviewCheckout(payload), /Inventory is not available/);
  assert.equal(discount.mock.callCount(), 0);

  const { inventoryQuery } = mockCatalog(t);
  assert.equal((await CheckoutService.reviewCheckout(payload)).checkout_order.total_discount, 5);
  assert.deepEqual(inventoryQuery.mock.calls[0].arguments[0], {
    $or: [{ inven_productId: product.toHexString(), inven_sellerId: seller.toHexString() }],
  });
  assert.equal(discount.mock.callCount(), 1);
});

test("each shop discount is applied once; coupon errors and price drift propagate", async (t) => {
  const secondSeller = new Types.ObjectId();
  const secondProduct = new Types.ObjectId();
  const discountId = new Types.ObjectId().toHexString();
  const secondDiscountId = new Types.ObjectId().toHexString();
  mockCatalog(t, [
    { product, seller, price: 20, stock: 10 },
    { product: secondProduct, seller: secondSeller, price: 30, stock: 10 },
  ]);

  let failure: Error | undefined;
  let priceDrift = false;
  const discountMock = t.mock.method(
    DiscountService,
    "getDiscountAmount",
    async (id: string, items: unknown, sellerId: string, buyerId: string) => {
      if (failure) throw failure;
      assert.equal(buyerId, buyer.toHexString());
      if (id === discountId) {
        assert.equal(sellerId, seller.toHexString());
        assert.deepEqual(items, [{ productId: product.toHexString(), quantity: 2 }]);
        return { totalPrice: priceDrift ? 41 : 40, eligibleTotalPrice: 40, discountAmount: 10, finalPrice: 30 };
      }
      assert.equal(id, secondDiscountId);
      assert.equal(sellerId, secondSeller.toHexString());
      return { totalPrice: 30, eligibleTotalPrice: 30, discountAmount: 5, finalPrice: 25 };
    },
  );

  const payload = makePayload();
  payload.shop_ids[0].discount_id = discountId;
  payload.shop_ids.push({
    shop_id: secondSeller.toHexString(),
    items: [{ product_id: secondProduct.toHexString(), quantity: 1 }],
    discount_id: secondDiscountId,
  });

  const result = await CheckoutService.reviewCheckout(payload);
  assert.equal(discountMock.mock.callCount(), 2);
  assert.deepEqual(
    result.checkout_summary.map((shop) => shop.total_discount),
    [10, 5],
  );
  assert.deepEqual(result.checkout_order, { total_price: 70, fee_shipping: 10, total_discount: 15, total_checkout: 65 });

  failure = new Error("Discount code has expired");
  await assert.rejects(CheckoutService.reviewCheckout(payload), /expired/);

  failure = undefined;
  priceDrift = true;
  await assert.rejects(CheckoutService.reviewCheckout(payload), /prices changed/);
});
