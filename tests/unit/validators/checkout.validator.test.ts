import assert from "node:assert/strict";
import { test } from "node:test";
import { validateReviewCheckoutPayload } from "#/validators/checkout.validator.js";
import { validateCreateOrderPayload } from "#/validators/order.validator.js";
import { newId } from "../../helpers/fixtures.js";

const buyer = newId();
const shopA = newId();
const shopB = newId();
const [p1, p2, p3] = [newId(), newId(), newId()];

const validBody = () => ({
  cartId: newId(),
  shop_ids: [{ shop_id: shopA, items: [{ product_id: p1, quantity: 2 }] }],
});

test("checkout payload is parsed and the authenticated account overrides the body", () => {
  const body = { ...validBody(), accountId: "untrusted" };
  const parsed = validateReviewCheckoutPayload(body, buyer);
  assert.equal(parsed.accountId, buyer);
  assert.equal(parsed.cartId, body.cartId);
  assert.deepEqual(parsed.shop_ids[0].items, [{ product_id: p1, quantity: 2 }]);
});

test("invalid checkout payloads are rejected", () => {
  const valid = validBody();
  const shop = valid.shop_ids[0];
  const invalid: unknown[] = [
    null,
    { ...valid, cartId: "invalid" },
    { ...valid, shop_ids: [] },
    { ...valid, shop_ids: [shop, shop] },
    { ...valid, shop_ids: [{ ...shop, discount_id: "invalid" }] },
    { ...valid, shop_ids: [{ ...shop, items: [] }] },
    { ...valid, shop_ids: [{ ...shop, items: [{ product_id: "invalid", quantity: 2 }] }] },
    { ...valid, shop_ids: [{ ...shop, items: [{ product_id: p1, quantity: 0 }] }] },
    { ...valid, shop_ids: [{ ...shop, items: [shop.items[0], shop.items[0]] }] },
  ];
  for (const body of invalid) {
    assert.throws(() => validateReviewCheckoutPayload(body, buyer), { name: "BadRequestError" });
  }
});

test("a product may appear only once across all shops", () => {
  const body = {
    cartId: newId(),
    shop_ids: [
      { shop_id: shopA, items: [{ product_id: p1, quantity: 1 }] },
      { shop_id: shopB, items: [{ product_id: p1, quantity: 1 }] },
    ],
  };
  assert.throws(() => validateReviewCheckoutPayload(body, buyer), /Duplicate product_id/);
});

test("order request hash ignores shop and item ordering but not quantities", () => {
  const cartId = newId();
  const requestId = newId();
  const build = (shops: unknown[]) => validateCreateOrderPayload({ requestId, cartId, shop_ids: shops }, buyer);
  const a = { shop_id: shopA, items: [{ product_id: p1, quantity: 1 }, { product_id: p2, quantity: 1 }] };
  const b = { shop_id: shopB, items: [{ product_id: p3, quantity: 1 }] };

  const original = build([a, b]);
  const reordered = build([b, { ...a, items: [...a.items].reverse() }]);
  const changed = build([{ ...a, items: [{ product_id: p1, quantity: 2 }, a.items[1]] }, b]);

  assert.equal(original.requestId, requestId);
  assert.equal(original.requestHash, reordered.requestHash);
  assert.notEqual(original.requestHash, changed.requestHash);
  assert.throws(() => validateCreateOrderPayload({ cartId, shop_ids: [a] }, buyer), /requestId/);
});
