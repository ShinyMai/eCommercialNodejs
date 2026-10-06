import assert from "node:assert/strict";
import { test } from "node:test";
import { Types } from "mongoose";
import CheckoutService, { type ReviewCheckoutPayload } from "../src/services/checkout.service.js";
import { CartModel } from "../src/models/cart.model.js";
import DiscountService from "../src/services/discount.service.js";
import CheckoutController from "../src/controllers/checkout.controller.js";
import { InventoryModel } from "../src/models/inventory.model.js";
import { ProductModel } from "../src/models/products.model.js";

const buyer = new Types.ObjectId();
const seller = new Types.ObjectId();
const product = new Types.ObjectId();
const cart = new Types.ObjectId();
const makePayload = (): ReviewCheckoutPayload => ({
  cartId: cart.toHexString(),
  accountId: buyer.toHexString(),
  shop_ids: [{ shop_id: seller.toHexString(), items: [{ product_id: product.toHexString(), quantity: 2 }], discount_id: undefined }],
});

test("checkout accepts string IDs, checks cart owner and resolves stored prices", async (t) => {
  t.mock.method(CartModel, "findOne", async (filter: { _id: string; cart_account: string }) => {
    assert.equal(filter._id, cart.toHexString());
    assert.equal(filter.cart_account, buyer.toHexString());
    return { cart_items: [{ product, quantity: 2 }] };
  });
  t.mock.method(ProductModel, "find", (filter: { _id: { $in: string[] } }) => {
    assert.equal(filter._id.$in[0], product.toHexString());
    return { select() { return this; }, lean() { return this; }, exec: async () => [{ _id: product, product_seller: seller, product_price: 20 }] };
  });
  t.mock.method(InventoryModel, "find", () => ({ select() { return this; }, lean() { return this; }, exec: async () => [{ inven_productId: product, inven_sellerId: seller, inven_stock: 10 }] }));
  const result = await CheckoutService.reviewCheckout(makePayload());
  assert.equal(result.checkout_order.total_price, 40);
  assert.equal(result.checkout_summary[0].items[0].price, 20);
});

test("service validates raw payload before querying", async (t) => {
  const query = t.mock.method(CartModel, "findOne", () => { throw new Error("Must not query"); });
  const valid = { cartId: cart.toHexString(), shop_ids: [{ shop_id: seller.toHexString(), items: [{ product_id: product.toHexString(), quantity: 2 }] }] };
  const invalid: unknown[] = [
    null,
    { ...valid, cartId: "invalid" },
    { ...valid, shop_ids: [] },
    { ...valid, shop_ids: [valid.shop_ids[0], valid.shop_ids[0]] },
    { ...valid, shop_ids: [{ ...valid.shop_ids[0], discount_id: "invalid" }] },
    { ...valid, shop_ids: [{ ...valid.shop_ids[0], items: [{ product_id: "invalid", quantity: 2 }] }] },
    { ...valid, shop_ids: [{ ...valid.shop_ids[0], items: [{ product_id: product.toHexString(), quantity: 0 }] }] },
    { ...valid, shop_ids: [{ ...valid.shop_ids[0], items: [valid.shop_ids[0].items[0], valid.shop_ids[0].items[0]] }] },
  ];
  for (const body of invalid) await assert.rejects(CheckoutService.reviewCheckout(body, buyer.toHexString()), { name: "BadRequestError" });
  assert.equal(query.mock.callCount(), 0);
});

test("controller passes raw body and trusted account ID to service", async (t) => {
  const body = { cartId: cart.toHexString(), accountId: "untrusted", shop_ids: [] };
  t.mock.method(CheckoutService, "reviewCheckout", async (payload: unknown, accountId?: string) => {
    assert.equal(payload, body);
    assert.equal(accountId, buyer.toHexString());
    return { checkout_summary: [], checkout_order: { total_price: 0, fee_shipping: 0, total_discount: 0, total_checkout: 0 } };
  });
  await CheckoutController.reviewCheckout(
    { body, auth: { accountId: buyer.toHexString() } } as Parameters<typeof CheckoutController.reviewCheckout>[0],
    { status() { return this; }, json(value: unknown) { return value; } } as unknown as Parameters<typeof CheckoutController.reviewCheckout>[1],
  );
});

test("service preserves string IDs and overrides body accountId with authenticated account", async (t) => {
  t.mock.method(CartModel, "findOne", async (filter: { _id: string; cart_account: string }) => {
    assert.equal(filter._id, cart.toHexString());
    assert.equal(filter.cart_account, buyer.toHexString());
    return { cart_items: [{ product }] };
  });
  t.mock.method(ProductModel, "find", () => ({ select() { return this; }, lean() { return this; }, exec: async () => [{ _id: product, product_seller: seller, product_price: 20 }] }));
  t.mock.method(InventoryModel, "find", () => ({ select() { return this; }, lean() { return this; }, exec: async () => [{ inven_productId: product, inven_sellerId: seller, inven_stock: 10 }] }));
  const result = await CheckoutService.reviewCheckout({ cartId: cart.toHexString(), accountId: "invalid", shop_ids: [{ shop_id: seller.toHexString(), items: [{ product_id: product.toHexString(), quantity: 2 }] }] }, buyer.toHexString());
  assert.equal(result.checkout_order.total_price, 40);
  assert.equal(result.checkout_summary[0].shop_id, seller.toHexString());
});


test("checkout applies each shop discount once and propagates coupon errors", async (t) => {
  const secondSeller = new Types.ObjectId();
  const secondProduct = new Types.ObjectId();
  const discountId = new Types.ObjectId();
  const secondDiscountId = new Types.ObjectId();
  t.mock.method(CartModel, "findOne", async () => ({ cart_items: [{ product }, { product: secondProduct }] }));
  t.mock.method(ProductModel, "find", () => ({ select() { return this; }, lean() { return this; }, exec: async () => [
    { _id: product, product_seller: seller, product_price: 20 },
    { _id: secondProduct, product_seller: secondSeller, product_price: 30 },
  ] }));
  t.mock.method(InventoryModel, "find", () => ({ select() { return this; }, lean() { return this; }, exec: async () => [
    { inven_productId: product, inven_sellerId: seller, inven_stock: 10 },
    { inven_productId: secondProduct, inven_sellerId: secondSeller, inven_stock: 10 },
  ] }));
  let failure: Error | undefined;
  let changedPrice = false;
  const discountMock = t.mock.method(DiscountService, "getDiscountAmount", async (id: string, items: unknown, sellerId: string, buyerId: string) => {
    if (failure) throw failure;
    assert.equal(buyerId, buyer.toHexString());
    if (id === discountId.toHexString()) {
      assert.equal(sellerId, seller.toHexString());
      assert.deepEqual(items, [{ productId: product.toHexString(), quantity: 2 }]);
      return { totalPrice: changedPrice ? 41 : 40, eligibleTotalPrice: 40, discountAmount: 10, finalPrice: 30 };
    }
    assert.equal(id, secondDiscountId.toHexString());
    assert.equal(sellerId, secondSeller.toHexString());
    return { totalPrice: 30, eligibleTotalPrice: 30, discountAmount: 5, finalPrice: 25 };
  });
  const payload = makePayload();
  payload.shop_ids[0].discount_id = discountId.toHexString();
  payload.shop_ids.push({ shop_id: secondSeller.toHexString(), items: [{ product_id: secondProduct.toHexString(), quantity: 1 }], discount_id: secondDiscountId.toHexString() });
  const result = await CheckoutService.reviewCheckout(payload);
  assert.equal(discountMock.mock.callCount(), 2);
  assert.equal(result.checkout_order.total_price, 70);
  assert.equal(result.checkout_order.total_discount, 15);
  assert.equal(result.checkout_order.total_checkout, 65); // Existing shipping placeholder: 5 per line.
  assert.deepEqual(result.checkout_summary.map((shop) => shop.total_discount), [10, 5]);
  failure = new Error("Discount code has expired");
  await assert.rejects(CheckoutService.reviewCheckout(payload), /expired/);
  failure = undefined;
  changedPrice = true;
  await assert.rejects(CheckoutService.reviewCheckout(payload), /prices changed/);
  changedPrice = false;

});





test("checkout checks inventory by product and seller before calculating discounts", async (t) => {
  t.mock.method(CartModel, "findOne", async () => ({ cart_items: [{ product }] }));
  t.mock.method(ProductModel, "find", () => ({ select() { return this; }, lean() { return this; }, exec: async () => [{ _id: product, product_seller: seller, product_price: 20 }] }));
  let stock = 2;
  let missing = false;
  let wrongSeller = false;
  const inventoryQuery = t.mock.method(InventoryModel, "find", (filter: unknown) => {
    assert.deepEqual(filter, { $or: [{ inven_productId: product.toHexString(), inven_sellerId: seller.toHexString() }] });
    return { select() { return this; }, lean() { return this; }, exec: async () => missing ? [] : [{ inven_productId: product, inven_sellerId: wrongSeller ? new Types.ObjectId() : seller, inven_stock: stock }] };
  });
  const discount = t.mock.method(DiscountService, "getDiscountAmount", async () => ({ totalPrice: 40, eligibleTotalPrice: 40, discountAmount: 5, finalPrice: 35 }));
  const payload = makePayload();
  payload.shop_ids[0].discount_id = new Types.ObjectId().toHexString();
  assert.equal((await CheckoutService.reviewCheckout(payload)).checkout_order.total_discount, 5);
  assert.equal(inventoryQuery.mock.callCount(), 1);
  assert.equal(discount.mock.callCount(), 1);
  for (const remaining of [1, 0, NaN, -1]) {
    stock = remaining;
    await assert.rejects(CheckoutService.reviewCheckout(payload), { name: "ConflictRequestError", statusCode: 409 });
  }
  missing = true;
  await assert.rejects(CheckoutService.reviewCheckout(payload), /Inventory is not available/);
  missing = false;
  wrongSeller = true;
  await assert.rejects(CheckoutService.reviewCheckout(payload), /Inventory is not available/);
  assert.equal(discount.mock.callCount(), 1);
});
