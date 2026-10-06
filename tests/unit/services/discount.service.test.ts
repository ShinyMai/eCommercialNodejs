import assert from "node:assert/strict";
import { describe, test, type TestContext } from "node:test";
import { Types } from "mongoose";
import { DiscountModel } from "#/models/discount.model.js";
import { ProductModel } from "#/models/product.model.js";
import DiscountService from "#/services/discount.service.js";
import type { DiscountInput } from "#/validators/discount.validator.js";
import { newId, queryOf } from "../../helpers/fixtures.js";

const DAY = 24 * 60 * 60 * 1000;
const sellerId = newId();
const buyerId = newId();
const discountId = newId();
const [p1, p2] = [new Types.ObjectId(), new Types.ObjectId()];

const activeDiscount = (override: object = {}) => ({
  discount_type: "percentage",
  discount_value: 10,
  discount_minimum_purchase: 0,
  discount_used_count: 0,
  discount_max_uses: 10,
  discount_used_by_accounts: [] as Types.ObjectId[],
  discount_start_date: new Date(Date.now() - DAY),
  discount_end_date: new Date(Date.now() + DAY),
  discount_status: true,
  discount_applies_to: "all",
  discount_productIds: [] as Types.ObjectId[],
  ...override,
});

/** p1 costs 100, p2 costs 50; the cart has 2 × p1 and 1 × p2 (subtotal 250). */
const cartItems = [
  { productId: p1.toHexString(), quantity: 2 },
  { productId: p2.toHexString(), quantity: 1 },
];

const mockAmountQueries = (t: TestContext, discount: object | null, prices = [100, 50]) => {
  t.mock.method(DiscountModel, "findOne", () => queryOf(discount));
  t.mock.method(ProductModel, "find", () =>
    queryOf([p1, p2].slice(0, prices.length).map((_id, index) => ({ _id, product_price: prices[index] }))),
  );
};

const amount = () => DiscountService.getDiscountAmount(discountId, cartItems, sellerId, buyerId);

describe("getDiscountAmount", () => {
  test("percentage discount applies to the whole subtotal", async (t) => {
    mockAmountQueries(t, activeDiscount());
    assert.deepEqual(await amount(), { totalPrice: 250, eligibleTotalPrice: 250, discountAmount: 25, finalPrice: 225 });
  });

  test("specific-product discount only counts eligible lines", async (t) => {
    mockAmountQueries(t, activeDiscount({ discount_applies_to: "specific_products", discount_productIds: [p2] }));
    const result = await amount();
    assert.equal(result.eligibleTotalPrice, 50);
    assert.equal(result.discountAmount, 5);

    mockAmountQueries(t, activeDiscount({ discount_applies_to: "specific_products", discount_productIds: [newId()] }));
    await assert.rejects(amount(), /does not apply to any selected product/);
  });

  test("fixed discount is capped at the eligible value", async (t) => {
    mockAmountQueries(t, activeDiscount({ discount_type: "fixed_amount", discount_value: 1_000 }));
    const result = await amount();
    assert.equal(result.discountAmount, 250);
    assert.equal(result.finalPrice, 0);
  });

  test("unusable discounts are rejected", async (t) => {
    const cases: [object, RegExp][] = [
      [{ discount_status: false }, /inactive/],
      [{ discount_start_date: new Date(Date.now() + DAY) }, /not started yet/],
      [{ discount_end_date: new Date(Date.now() - 1) }, /expired/],
      [{ discount_used_count: 10 }, /maximum usage limit/],
      [{ discount_used_by_accounts: [new Types.ObjectId(buyerId)] }, /already used/],
      [{ discount_minimum_purchase: 300 }, /Minimum purchase amount is 300/],
    ];
    for (const [override, message] of cases) {
      mockAmountQueries(t, activeDiscount(override));
      await assert.rejects(amount(), message);
    }
  });

  test("missing discounts and foreign products are rejected", async (t) => {
    mockAmountQueries(t, null);
    await assert.rejects(amount(), { name: "NotFoundError" });

    mockAmountQueries(t, activeDiscount(), [100]);
    await assert.rejects(amount(), /do not exist for this seller/);
  });

  test("cart items are validated before querying", async (t) => {
    const findOne = t.mock.method(DiscountModel, "findOne", () => queryOf(null));
    await assert.rejects(DiscountService.getDiscountAmount(discountId, [], sellerId, buyerId), /cannot be empty/);
    assert.equal(findOne.mock.callCount(), 0);
  });
});

describe("createDiscountCode", () => {
  const input = (): DiscountInput => ({
    discount_name: "Summer",
    discount_description: "Summer sale",
    discount_type: "fixed_amount",
    discount_value: 5,
    discount_code: "summer",
    discount_start_date: new Date(Date.now() + DAY).toISOString(),
    discount_end_date: new Date(Date.now() + 2 * DAY).toISOString(),
    discount_max_uses: 10,
    discount_minimum_purchase: 0,
    discount_applies_to: "specific_products",
    discount_productIds: [p1.toHexString()],
  });

  test("stores a normalized discount for the authenticated seller", async (t) => {
    t.mock.method(ProductModel, "countDocuments", () => queryOf(1));
    t.mock.method(DiscountModel, "exists", () => queryOf(null));
    const create = t.mock.method(DiscountModel, "create", async (doc: any) => doc);

    const created: any = await DiscountService.createDiscountCode(input(), sellerId);
    assert.equal(create.mock.callCount(), 1);
    assert.equal(created.discount_code, "SUMMER");
    assert.equal(String(created.discount_sellerId), sellerId);
    assert.ok(created.discount_start_date instanceof Date);
  });

  test("rejects duplicate codes and products owned by another seller", async (t) => {
    t.mock.method(ProductModel, "countDocuments", () => queryOf(1));
    t.mock.method(DiscountModel, "exists", () => queryOf({ _id: new Types.ObjectId() }));
    await assert.rejects(DiscountService.createDiscountCode(input(), sellerId), /already exists/);

    t.mock.method(ProductModel, "countDocuments", () => queryOf(0));
    await assert.rejects(DiscountService.createDiscountCode(input(), sellerId), /do not belong to this seller/);
  });
});

describe("delete / cancel", () => {
  test("soft-delete and cancel only touch the seller's own, non-deleted discount", async (t) => {
    const update = t.mock.method(DiscountModel, "findOneAndUpdate", (filter: any, change: any) =>
      queryOf({ filter, change }),
    );

    const deleted: any = await DiscountService.deleteDiscountCode(discountId, sellerId);
    assert.deepEqual(deleted.change, { $set: { is_deleted: true } });
    assert.equal(deleted.filter.is_deleted, false);
    assert.equal(String(deleted.filter.discount_sellerId), sellerId);

    const cancelled: any = await DiscountService.cancelDiscountCode(discountId, sellerId);
    assert.deepEqual(cancelled.change, { $set: { discount_status: false } });
    assert.equal(update.mock.callCount(), 2);
  });

  test("a missing discount is reported as not found", async (t) => {
    t.mock.method(DiscountModel, "findOneAndUpdate", () => queryOf(null));
    await assert.rejects(DiscountService.cancelDiscountCode(discountId, sellerId), { name: "NotFoundError" });
    await assert.rejects(DiscountService.deleteDiscountCode("bad", sellerId), { name: "BadRequestError" });
  });
});
