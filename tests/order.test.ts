import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import mongoose, { Types } from "mongoose";
import OrderService from "../src/services/order.service.js";
import CheckoutService from "../src/services/checkout.service.js";
import { OrderModel } from "../src/models/order.model.js";
import { InventoryModel } from "../src/models/inventory.model.js";
import { ProductModel } from "../src/models/products.model.js";
import { AccountModel } from "../src/models/account.model.js";
import { redisClient } from "../src/configs/redis.config.js";

const id = () => new Types.ObjectId().toHexString();
const fixture = (t: TestContext) => {
  const accountId = id();
  const sellerId = id();
  const products = [id(), id()].sort();
  const body = { requestId: id(), cartId: id(), shop_ids: [{ shop_id: sellerId, items: products.map((product_id) => ({ product_id, quantity: 2 })) }] };
  const state = {
    order: undefined as any, failSave: false, available: 2,
    inventories: products.map((productId) => ({ productId, stock: 3, reservations: [] as any[] })),
  };
  const query = (get: () => any) => ({
    select() { return this; }, session(value: unknown) { assert.equal(value, session); return this; },
    lean() { return this; }, exec: async () => get(),
  });
  const session = {
    withTransaction: async (fn: () => Promise<unknown>) => {
      const snapshot = structuredClone({ order: state.order, inventories: state.inventories });
      try { return await fn(); } catch (error) { state.order = snapshot.order; state.inventories = snapshot.inventories; throw error; }
    },
    endSession: async () => undefined,
  };
  t.mock.method(mongoose, "startSession", async () => session);
  t.mock.method(OrderModel, "init", async () => OrderModel);
  const document = () => state.order ? { ...state.order,
    toObject: () => structuredClone(state.order),
    save: async function(options: any) { assert.equal(options.session, session); state.order.status = this.status; state.order.cancelledAt = this.cancelledAt; },
  } : null;
  t.mock.method(OrderModel, "findOne", (filter: any) => query(() => {
    if (!state.order || state.order.accountId !== filter.accountId) return null;
    if (filter.requestId && filter.requestId !== state.order.requestId) return null;
    if (filter._id && filter._id !== state.order._id) return null;
    return document();
  }));
  const create = t.mock.method(OrderModel, "create", async (values: any[], options: any) => {
    assert.equal(options.session, session);
    if (state.failSave) throw new Error("Order storage failed");
    state.order = { _id: id(), ...structuredClone(values[0]) };
    return [document()];
  });
  t.mock.method(ProductModel, "countDocuments", () => query(() => state.available));
  t.mock.method(AccountModel, "countDocuments", () => query(() => 1));
  t.mock.method(CheckoutService, "reviewCheckout", async (_body: unknown, buyer: string, suppliedSession: unknown) => {
    assert.equal(buyer, accountId);
    assert.equal(suppliedSession, session);
    return {
      checkout_summary: [{ shop_id: sellerId, items: products.map((product_id) => ({ product_id, quantity: 2, price: 20 })), total_price: 80, total_discount: 0, total_checkout: 80 }],
      checkout_order: { total_price: 80, fee_shipping: 10, total_discount: 0, total_checkout: 90 },
    };
  });
  t.mock.method(InventoryModel, "findOne", (filter: any) => query(() => ({ inven_reservations: structuredClone(state.inventories.find((i) => i.productId === filter.inven_productId)!.reservations) })));
  t.mock.method(InventoryModel, "updateOne", async (filter: any, update: any, options: any) => {
    assert.equal(options.session, session);
    const inventory = state.inventories.find((i) => i.productId === filter.inven_productId)!;
    assert.equal(filter.inven_sellerId, sellerId);
    if (update.$push) {
      if (inventory.stock < filter.inven_stock.$gte) return { modifiedCount: 0 };
      assert.equal(filter["inven_reservations.reservationId"].$ne, update.$push.inven_reservations.reservationId);
      inventory.stock += update.$inc.inven_stock;
      inventory.reservations.push(structuredClone(update.$push.inven_reservations));
    } else {
      const expected = filter.inven_reservations.$elemMatch;
      const reservation = inventory.reservations.find((r) => r.reservationId === expected.reservationId && r.status === "active");
      if (!reservation) return { modifiedCount: 0 };
      inventory.stock += update.$inc?.inven_stock ?? 0;
      reservation.status = update.$set["inven_reservations.$.status"];
    }
    return { modifiedCount: 1 };
  });
  t.mock.method(redisClient, "connect", async () => redisClient);
  const lock = t.mock.method(redisClient, "set", async () => "OK");
  const unlock = t.mock.method(redisClient, "eval", async () => 1);
  return { body, accountId, state, create, lock, unlock };
};

test("order reserves all items, persists snapshots and returns the same order on retry", async (t) => {
  const f = fixture(t);
  const order = await OrderService.createOrder(f.body, f.accountId);
  assert.ok(order);
  assert.equal(order.status, "pending_payment");
  assert.equal(order.checkout_order.total_checkout, 90);
  assert.equal("requestHash" in order, false);
  assert.deepEqual(f.state.inventories.map((i) => i.stock), [1, 1]);
  assert.ok(f.state.inventories.every((i) => i.reservations[0].expiresAt.getTime() === order.expiresAt.getTime()));
  const retry = await OrderService.createOrder(f.body, f.accountId);
  assert.equal(retry?._id, order._id);
  assert.equal(f.create.mock.callCount(), 1);
  assert.equal(f.lock.mock.callCount(), 2);
  assert.equal(f.unlock.mock.callCount(), 2);
  const changed = structuredClone(f.body);
  changed.shop_ids[0].items[0].quantity = 1;
  await assert.rejects(OrderService.createOrder(changed, f.accountId), /different checkout data/);
});

test("insufficient stock in second product rolls back every reservation", async (t) => {
  const f = fixture(t);
  f.state.inventories[1].stock = 1;
  await assert.rejects(OrderService.createOrder(f.body, f.accountId), /không đủ hàng/);
  assert.deepEqual(f.state.inventories.map((i) => i.stock), [3, 1]);
  assert.ok(f.state.inventories.every((i) => i.reservations.length === 0));
  assert.equal(f.state.order, undefined);
  assert.equal(f.unlock.mock.callCount(), 2);
});

test("order save failure rolls back reservations and releases locks", async (t) => {
  const f = fixture(t);
  f.state.failSave = true;
  await assert.rejects(OrderService.createOrder(f.body, f.accountId), /storage failed/);
  assert.deepEqual(f.state.inventories.map((i) => i.stock), [3, 3]);
  assert.equal(f.state.order, undefined);
  assert.equal(f.unlock.mock.callCount(), 2);
});

test("only owner can read/cancel order; cancellation restores stock once", async (t) => {
  const f = fixture(t);
  const created = await OrderService.createOrder(f.body, f.accountId);
  const orderId = String(created!._id);
  await assert.rejects(OrderService.getOrder(orderId, id()), /not found/);
  await assert.rejects(OrderService.cancelOrder(orderId, id()), /not found/);
  assert.equal((await OrderService.cancelOrder(orderId, f.accountId))?.status, "cancelled");
  assert.equal((await OrderService.cancelOrder(orderId, f.accountId))?.status, "cancelled");
  assert.deepEqual(f.state.inventories.map((i) => i.stock), [3, 3]);
});

test("unpublished products cannot create an order", async (t) => {
  const f = fixture(t);
  f.state.available = 1;
  await assert.rejects(OrderService.createOrder(f.body, f.accountId), /not available/);
  assert.equal(f.create.mock.callCount(), 0);
  assert.deepEqual(f.state.inventories.map((i) => i.stock), [3, 3]);
});

test("expired order cancellation releases remaining holds and reports expiration", async (t) => {
  const f = fixture(t);
  const order = await OrderService.createOrder(f.body, f.accountId);
  f.state.order.expiresAt = new Date(0);
  assert.equal((await OrderService.getOrder(String(order!._id), f.accountId)).status, "expired");
  assert.equal((await OrderService.cancelOrder(String(order!._id), f.accountId))?.status, "expired");
  assert.deepEqual(f.state.inventories.map((i) => i.stock), [3, 3]);
});

test("cancellation rollback does not partially restore a multi-product order", async (t) => {
  const f = fixture(t);
  const order = await OrderService.createOrder(f.body, f.accountId);
  f.state.inventories[1].reservations[0].status = "confirmed";
  await assert.rejects(OrderService.cancelOrder(String(order!._id), f.accountId), /already completed/);
  assert.deepEqual(f.state.inventories.map((i) => i.stock), [1, 1]);
  assert.equal(f.state.inventories[0].reservations[0].status, "active");
  assert.equal(f.state.order.status, "pending_payment");
});
