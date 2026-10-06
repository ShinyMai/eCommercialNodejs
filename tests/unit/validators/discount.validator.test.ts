import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseCalculateDiscountInput,
  parseDiscountInput,
  validateDiscountCartItems,
  validateDiscountRules,
  type DiscountInput,
  type DiscountRules,
} from "#/validators/discount.validator.js";
import { newId } from "../../helpers/fixtures.js";

const DAY = 24 * 60 * 60 * 1000;

const discountInput = (): DiscountInput => ({
  discount_name: " Summer ",
  discount_description: "Summer sale",
  discount_type: "percentage",
  discount_value: 10,
  discount_code: " summer10 ",
  discount_start_date: new Date(Date.now() + DAY).toISOString(),
  discount_end_date: new Date(Date.now() + 2 * DAY).toISOString(),
  discount_max_uses: 100,
  discount_minimum_purchase: 0,
  discount_applies_to: "all",
  discount_productIds: [],
});

const rules = (override: Partial<DiscountRules> = {}): DiscountRules => ({
  startDate: new Date(Date.now() + DAY),
  endDate: new Date(Date.now() + 2 * DAY),
  startDateChanged: true,
  type: "fixed_amount",
  value: 5,
  appliesTo: "all",
  productIds: [],
  ...override,
});

test("create payload is trimmed, upper-cased and de-duplicated", () => {
  const productId = newId();
  const parsed = parseDiscountInput({ ...discountInput(), discount_productIds: [productId, productId] }, false);
  assert.equal(parsed.discount_name, "Summer");
  assert.equal(parsed.discount_code, "SUMMER10");
  assert.deepEqual(parsed.discount_productIds, [productId]);
});

test("create payload requires every field except product IDs", () => {
  const { discount_productIds: _ids, ...withoutProducts } = discountInput();
  assert.deepEqual(parseDiscountInput(withoutProducts as DiscountInput, false).discount_productIds, []);

  const { discount_code: _code, ...withoutCode } = discountInput();
  assert.throws(() => parseDiscountInput(withoutCode as DiscountInput, false), /Missing required discount fields/);
});

test("invalid field values are rejected", () => {
  const cases: [Partial<DiscountInput>, RegExp][] = [
    [{ discount_type: "bogo" as never }, /discount_type must be/],
    [{ discount_applies_to: "some" as never }, /discount_applies_to must be/],
    [{ discount_value: -1 }, /discount_value must be a non-negative number/],
    [{ discount_max_uses: 0 }, /discount_max_uses must be a positive integer/],
    [{ discount_value: 150 }, /Percentage discount cannot exceed 100/],
    [{ discount_name: " " }, /discount_name must be a non-empty string/],
    [{ discount_productIds: ["bad"] }, /Invalid discount_productIds/],
  ];
  for (const [override, message] of cases) {
    assert.throws(() => parseDiscountInput({ ...discountInput(), ...override }, false), message);
  }
});

test("partial payload must contain at least one supported field", () => {
  assert.deepEqual(parseDiscountInput({ discount_value: 3 }, true), { discount_value: 3 });
  assert.throws(() => parseDiscountInput({ unknown: 1 } as never, true), /No supported discount fields/);
  assert.throws(() => parseDiscountInput([] as never, true), /must be an object/);
});

test("cross-field rules validate dates, percentage cap and product scope", () => {
  assert.doesNotThrow(() => validateDiscountRules(rules()));
  assert.throws(() => validateDiscountRules(rules({ startDate: new Date("nope") })), /must be valid/);
  assert.throws(() => validateDiscountRules(rules({ startDate: new Date(Date.now() - DAY) })), /after the current date/);
  assert.doesNotThrow(() =>
    validateDiscountRules(rules({ startDate: new Date(Date.now() - DAY), startDateChanged: false })),
  );
  assert.throws(() => validateDiscountRules(rules({ endDate: new Date(Date.now() + DAY / 2) })), /end date/);
  assert.throws(() => validateDiscountRules(rules({ type: "percentage", value: 101 })), /cannot exceed 100/);
  assert.throws(() => validateDiscountRules(rules({ appliesTo: "specific_products" })), /at least one product/);
});

test("cart items for discount calculation must be valid and unique", () => {
  const productId = newId();
  assert.doesNotThrow(() => validateDiscountCartItems([{ productId, quantity: 1 }]));
  assert.throws(() => validateDiscountCartItems([]), /cannot be empty/);
  assert.throws(() => validateDiscountCartItems([{ productId: "bad", quantity: 1 }]), /products\[0\].productId/);
  assert.throws(() => validateDiscountCartItems([{ productId, quantity: 0 }]), /products\[0\].quantity/);
  assert.throws(
    () => validateDiscountCartItems([{ productId, quantity: 1 }, { productId, quantity: 2 }]),
    /duplicate productId/,
  );
  assert.throws(() => parseCalculateDiscountInput({ products: "x" } as never), /are required/);
});
