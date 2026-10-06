import assert from "node:assert/strict";
import { test } from "node:test";
import type { Response } from "express";
import CheckoutController from "#/controllers/checkout.controller.js";
import OrderController from "#/controllers/order.controller.js";
import type { AuthenticatedRequest } from "#/middlewares/authentication.middleware.js";
import CheckoutService from "#/services/checkout.service.js";
import OrderService from "#/services/order.service.js";
import { fakeResponse, newId } from "../../helpers/fixtures.js";

const buyerId = newId();
const authenticated = (request: object) =>
  ({ auth: { accountId: buyerId, sessionId: newId(), role: "buyer" }, ...request }) as AuthenticatedRequest<any>;

test("checkout controller passes the raw body and the trusted account ID", async (t) => {
  const body = { cartId: newId(), accountId: "untrusted", shop_ids: [] };
  const emptyReview = {
    checkout_summary: [],
    checkout_order: { total_price: 0, fee_shipping: 0, total_discount: 0, total_checkout: 0 },
  };
  const review = t.mock.method(CheckoutService, "reviewCheckout", async () => emptyReview);
  const { res, sent } = fakeResponse();

  await CheckoutController.reviewCheckout(authenticated({ body }), res as unknown as Response);

  assert.deepEqual(review.mock.calls[0].arguments, [body, buyerId]);
  assert.equal(sent.statusCode, 200);
  assert.deepEqual((sent.body as any).metadata.items, emptyReview);
});

test("order controller responds 201 on create and forwards route params", async (t) => {
  const orderId = newId();
  t.mock.method(OrderService, "createOrder", async () => ({ _id: orderId }));
  const getOrder = t.mock.method(OrderService, "getOrder", async () => ({ _id: orderId }));

  const created = fakeResponse();
  await OrderController.create(authenticated({ body: {} }), created.res as unknown as Response);
  assert.equal(created.sent.statusCode, 201);
  assert.equal((created.sent.body as any).message, "Order created successfully");

  const fetched = fakeResponse();
  await OrderController.get(authenticated({ params: { orderId } }), fetched.res as unknown as Response);
  assert.deepEqual(getOrder.mock.calls[0].arguments, [orderId, buyerId]);
  assert.equal(fetched.sent.statusCode, 200);
});
