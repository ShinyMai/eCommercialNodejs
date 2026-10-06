import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { Types } from "mongoose";
import { InventoryModel } from "../src/models/inventory.model.js";
import {
  reservationInventory, cancelReservationInventory, confirmReservationInventory,
  expireInventoryReservations, type ReservationInput,
} from "../src/models/repositories/inventory.repo.js";
import { reserveInventory } from "../src/services/inventoryReservation.service.js";
import { redisClient } from "../src/configs/redis.config.js";

type Reservation = { reservationId: string; cartId: string; quantity: number; status: string; expiresAt: Date; reservedAt: Date; completedAt?: Date };
const fixture = (t: TestContext) => {
  const input: ReservationInput = { productId: new Types.ObjectId().toString(), sellerId: new Types.ObjectId().toString(), cartId: new Types.ObjectId().toString(), reservationId: new Types.ObjectId().toString(), quantity: 2 };
  const state = { stock: 3, reservations: [] as Reservation[] };
  const doc = () => ({ inven_productId: new Types.ObjectId(input.productId), inven_sellerId: new Types.ObjectId(input.sellerId), inven_reservations: structuredClone(state.reservations) });
  const query = (result: unknown) => ({ select() { return this; }, lean() { return this; }, limit() { return this; }, exec: async () => result });
  t.mock.method(InventoryModel, "findOne", () => query(doc()));
  t.mock.method(InventoryModel, "find", () => query([doc()]));
  t.mock.method(InventoryModel, "updateOne", async (filter: any, update: any, options: any) => {
    assert.equal(options?.upsert, undefined);
    assert.equal(filter.inven_productId, input.productId);
    assert.equal(filter.inven_sellerId, input.sellerId);
    if (update.$push) {
      assert.equal(filter.inven_stock.$gte, -update.$inc.inven_stock);
      assert.equal(filter["inven_reservations.reservationId"].$ne, update.$push.inven_reservations.reservationId);
      if (state.stock < filter.inven_stock.$gte || state.reservations.some((r) => r.reservationId === filter["inven_reservations.reservationId"].$ne)) return { modifiedCount: 0 };
      state.stock += update.$inc.inven_stock;
      state.reservations.push(structuredClone(update.$push.inven_reservations));
    } else {
      const expected = filter.inven_reservations.$elemMatch;
      assert.equal(expected.status, "active");
      const r = state.reservations.find((r) => r.reservationId === expected.reservationId && r.cartId === expected.cartId && r.status === "active" && r.quantity === expected.quantity);
      if (!r || (expected.expiresAt?.$gt && r.expiresAt <= expected.expiresAt.$gt) || (expected.expiresAt?.$lte && r.expiresAt > expected.expiresAt.$lte)) return { modifiedCount: 0 };
      state.stock += update.$inc?.inven_stock ?? 0;
      r.status = update.$set["inven_reservations.$.status"];
      r.completedAt = update.$set["inven_reservations.$.completedAt"];
    }
    return { modifiedCount: 1 };
  });
  return { input, state };
};

test("concurrent retries reserve once; conflicting reuse and overselling are rejected", async (t) => {
  const { input, state } = fixture(t);
  const results = await Promise.all([reservationInventory(input), reservationInventory(input)]);
  assert.equal(state.stock, 1);
  assert.equal(results[0].reservationId, results[1].reservationId);
  assert.equal(state.reservations.length, 1);
  await assert.rejects(reservationInventory({ ...input, quantity: 1 }), /different data/);
  await assert.rejects(reservationInventory({ ...input, reservationId: new Types.ObjectId().toString() }), /không đủ hàng/);
  await Promise.all([cancelReservationInventory(input), cancelReservationInventory(input)]);
  assert.equal(state.stock, 3);
  await assert.rejects(reservationInventory(input), /cancelled or expired/);
});

test("confirmation is idempotent and cannot restore consumed stock", async (t) => {
  const { input, state } = fixture(t);
  await reservationInventory(input);
  await Promise.all([confirmReservationInventory(input), confirmReservationInventory(input)]);
  assert.equal(state.stock, 1);
  assert.equal(state.reservations[0].status, "confirmed");
  await assert.rejects(cancelReservationInventory(input), /already completed/);
  await reservationInventory(input);
  assert.equal(state.stock, 1);
});

test("expiry restores once and blocks late payment confirmation", async (t) => {
  const { input, state } = fixture(t);
  await reservationInventory(input);
  state.reservations[0].expiresAt = new Date(0);
  await assert.rejects(confirmReservationInventory(input), /expired/);
  await Promise.all([expireInventoryReservations(), expireInventoryReservations()]);
  assert.equal(state.stock, 3);
  assert.equal(state.reservations[0].status, "expired");
  await expireInventoryReservations();
  assert.equal(state.stock, 3);
});

test("Redis lock is released on reserve success and insufficient-stock failure", async (t) => {
  const { input, state } = fixture(t);
  t.mock.method(redisClient, "connect", async () => redisClient);
  const set = t.mock.method(redisClient, "set", async (key: string) => {
    assert.equal(key, `lock:${input.productId}`);
    return "OK";
  });
  const unlock = t.mock.method(redisClient, "eval", async () => 1);
  await reserveInventory(input);
  await assert.rejects(reserveInventory({ ...input, reservationId: new Types.ObjectId().toString() }), /không đủ hàng/);
  assert.equal(state.stock, 1);
  assert.equal(set.mock.callCount(), 2);
  assert.equal(unlock.mock.callCount(), 2);
});
