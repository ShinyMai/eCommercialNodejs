import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import mongoose from "mongoose";
import { redisClient } from "#/configs/redis.config.js";
import { AccountModel } from "#/models/account.model.js";
import { InventoryModel } from "#/models/inventory.model.js";
import { OrderModel } from "#/models/order.model.js";
import { ProductModel } from "#/models/product.model.js";
import CheckoutService from "#/services/checkout.service.js";
import OrderService from "#/services/order.service.js";
import { fakeQuery, newId } from "../../helpers/fixtures.js";

type StoredReservation = { reservationId: string; status: string; expiresAt: Date };

/**
 * In-memory order + inventory store with a fake transaction that snapshots and
 * restores state on failure, mirroring MongoDB transaction rollback.
 */
const setup = (t: TestContext) => {
  const accountId = newId();
  const sellerId = newId();
  const products = [newId(), newId()].sort();
  const body = {
    requestId: newId(),
    cartId: newId(),
    shop_ids: [{ shop_id: sellerId, items: products.map((product_id) => ({ product_id, quantity: 2 })) }],
  };
  const state = {
    order: undefined as any,
    failSave: false,
    available: products.length,
    inventories: products.map((productId) => ({ productId, stock: 3, reservations: [] as StoredReservation[] })),
  };

  const session = {
    withTransaction: async (work: () => Promise<unknown>) => {
      const snapshot = structuredClone({ order: state.order, inventories: state.inventories });
      try {
        return await work();
      } catch (error) {
        Object.assign(state, snapshot);
        throw error;
      }
    },
    endSession: async () => undefined,
  };
  const query = <T>(resolve: () => T) =>
    fakeQuery(resolve, { onSession: (value) => assert.equal(value, session) });
  const inventoryOf = (productId: string) => state.inventories.find((inventory) => inventory.productId === productId)!;

  const orderDocument = () =>
    state.order
      ? {
          ...state.order,
          toObject: () => structuredClone(state.order),
          async save(this: any, options: any) {
            assert.equal(options.session, session);
            state.order.status = this.status;
            state.order.cancelledAt = this.cancelledAt;
          },
        }
      : null;

  t.mock.method(mongoose, "startSession", async () => session);
  t.mock.method(OrderModel, "init", async () => OrderModel);
  t.mock.method(OrderModel, "findOne", (filter: any) =>
    query(() => {
      if (!state.order || state.order.accountId !== filter.accountId) return null;
      if (filter.requestId && filter.requestId !== state.order.requestId) return null;
      if (filter._id && filter._id !== state.order._id) return null;
      return orderDocument();
    }),
  );
  const create = t.mock.method(OrderModel, "create", async (values: any[], options: any) => {
    assert.equal(options.session, session);
    if (state.failSave) throw new Error("Order storage failed");
    state.order = { _id: newId(), ...structuredClone(values[0]) };
    return [orderDocument()];
  });
  t.mock.method(ProductModel, "countDocuments", () => query(() => state.available));
  t.mock.method(AccountModel, "countDocuments", () => query(() => 1));
  t.mock.method(CheckoutService, "reviewCheckout", async (_body: unknown, buyer: string, suppliedSession: unknown) => {
    assert.equal(buyer, accountId);
    assert.equal(suppliedSession, session);
    return {
      checkout_summary: [
        {
          shop_id: sellerId,
          items: products.map((product_id) => ({ product_id, quantity: 2, price: 20 })),
          total_price: 80,
          total_discount: 0,
          total_checkout: 80,
        },
      ],
      checkout_order: { total_price: 80, fee_shipping: 10, total_discount: 0, total_checkout: 90 },
    };
  });

  t.mock.method(InventoryModel, "findOne", (filter: any) =>
    query(() => ({ inven_reservations: structuredClone(inventoryOf(filter.inven_productId).reservations) })),
  );
  t.mock.method(InventoryModel, "updateOne", async (filter: any, update: any, options: any) => {
    assert.equal(options.session, session);
    assert.equal(filter.inven_sellerId, sellerId);
    const inventory = inventoryOf(filter.inven_productId);

    if (update.$push) {
      if (inventory.stock < filter.inven_stock.$gte) return { modifiedCount: 0 };
      inventory.stock += update.$inc.inven_stock;
      inventory.reservations.push(structuredClone(update.$push.inven_reservations));
      return { modifiedCount: 1 };
    }

    const expected = filter.inven_reservations.$elemMatch;
    const reservation = inventory.reservations.find(
      (r) => r.reservationId === expected.reservationId && r.status === "active",
    );
    if (!reservation) return { modifiedCount: 0 };
    inventory.stock += update.$inc?.inven_stock ?? 0;
    reservation.status = update.$set["inven_reservations.$.status"];
    return { modifiedCount: 1 };
  });

  t.mock.method(redisClient, "connect", async () => redisClient);
  const lock = t.mock.method(redisClient, "set", async () => "OK");
  const unlock = t.mock.method(redisClient, "eval", async () => 1);

  const stocks = () => state.inventories.map((inventory) => inventory.stock);
  return { body, accountId, state, stocks, create, lock, unlock };
};

test("createOrder reserves every item, stores a snapshot and is idempotent per requestId", async (t) => {
  const f = setup(t);
  const order = await OrderService.createOrder(f.body, f.accountId);

  assert.equal(order.status, "pending_payment");
  assert.equal(order.checkout_order.total_checkout, 90);
  assert.equal("requestHash" in order, false);
  assert.deepEqual(f.stocks(), [1, 1]);
  assert.ok(f.state.inventories.every((i) => i.reservations[0].expiresAt.getTime() === order.expiresAt.getTime()));

  const retry = await OrderService.createOrder(f.body, f.accountId);
  assert.equal(retry._id, order._id);
  assert.equal(f.create.mock.callCount(), 1);
  assert.equal(f.lock.mock.callCount(), 2, "the retry returns early without locking");
  assert.equal(f.unlock.mock.callCount(), 2);

  const changed = structuredClone(f.body);
  changed.shop_ids[0].items[0].quantity = 1;
  await assert.rejects(OrderService.createOrder(changed, f.accountId), /different checkout data/);
});

test("insufficient stock on one product rolls back every reservation", async (t) => {
  const f = setup(t);
  f.state.inventories[1].stock = 1;

  await assert.rejects(OrderService.createOrder(f.body, f.accountId), /không đủ hàng/);
  assert.deepEqual(f.stocks(), [3, 1]);
  assert.ok(f.state.inventories.every((i) => i.reservations.length === 0));
  assert.equal(f.state.order, undefined);
  assert.equal(f.unlock.mock.callCount(), 2);
});

test("a failed order save rolls back reservations and still releases locks", async (t) => {
  const f = setup(t);
  f.state.failSave = true;

  await assert.rejects(OrderService.createOrder(f.body, f.accountId), /storage failed/);
  assert.deepEqual(f.stocks(), [3, 3]);
  assert.equal(f.state.order, undefined);
  assert.equal(f.unlock.mock.callCount(), 2);
});

test("unpublished products cannot be ordered", async (t) => {
  const f = setup(t);
  f.state.available = 1;

  await assert.rejects(OrderService.createOrder(f.body, f.accountId), /not available/);
  assert.equal(f.create.mock.callCount(), 0);
  assert.deepEqual(f.stocks(), [3, 3]);
});

test("a busy product lock aborts before any stock changes", async (t) => {
  const f = setup(t);
  f.lock.mock.mockImplementation(async () => null);

  await assert.rejects(OrderService.createOrder(f.body, f.accountId), /retry with the same requestId/);
  assert.deepEqual(f.stocks(), [3, 3]);
});

test("only the owner can read or cancel; cancellation restores stock exactly once", async (t) => {
  const f = setup(t);
  const orderId = String((await OrderService.createOrder(f.body, f.accountId))._id);

  await assert.rejects(OrderService.getOrder(orderId, newId()), /not found/);
  await assert.rejects(OrderService.cancelOrder(orderId, newId()), /not found/);
  assert.equal((await OrderService.cancelOrder(orderId, f.accountId)).status, "cancelled");
  assert.equal((await OrderService.cancelOrder(orderId, f.accountId)).status, "cancelled");
  assert.deepEqual(f.stocks(), [3, 3]);
});

test("an expired order is reported as expired and cancelling it releases remaining holds", async (t) => {
  const f = setup(t);
  const orderId = String((await OrderService.createOrder(f.body, f.accountId))._id);
  f.state.order.expiresAt = new Date(0);

  assert.equal((await OrderService.getOrder(orderId, f.accountId)).status, "expired");
  assert.equal((await OrderService.cancelOrder(orderId, f.accountId)).status, "expired");
  assert.deepEqual(f.stocks(), [3, 3]);
});

test("cancellation is all-or-nothing across a multi-product order", async (t) => {
  const f = setup(t);
  const orderId = String((await OrderService.createOrder(f.body, f.accountId))._id);
  f.state.inventories[1].reservations[0].status = "confirmed";

  await assert.rejects(OrderService.cancelOrder(orderId, f.accountId), /already completed/);
  assert.deepEqual(f.stocks(), [1, 1]);
  assert.equal(f.state.inventories[0].reservations[0].status, "active");
  assert.equal(f.state.order.status, "pending_payment");
});
