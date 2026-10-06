import assert from "node:assert/strict";
import { test } from "node:test";
import { redisClient } from "#/configs/redis.config.js";
import { reserveInventory } from "#/services/inventoryReservation.service.js";
import { newId } from "../../helpers/fixtures.js";
import { mockInventory } from "../../helpers/inventory.mock.js";

test("reserveInventory locks the product and releases it on success and on insufficient stock", async (t) => {
  const { input, state } = mockInventory(t);
  t.mock.method(redisClient, "connect", async () => redisClient);
  const set = t.mock.method(redisClient, "set", async (key: string) => {
    assert.equal(key, `lock:${input.productId}`);
    return "OK";
  });
  const unlock = t.mock.method(redisClient, "eval", async () => 1);

  await reserveInventory(input);
  await assert.rejects(reserveInventory({ ...input, reservationId: newId() }), /không đủ hàng/);

  assert.equal(state.stock, 1);
  assert.equal(set.mock.callCount(), 2);
  assert.equal(unlock.mock.callCount(), 2);
});

test("reserveInventory does not touch stock when the lock is busy", async (t) => {
  const { input, state } = mockInventory(t);
  t.mock.method(redisClient, "connect", async () => redisClient);
  t.mock.method(redisClient, "set", async () => null);

  await assert.rejects(reserveInventory(input), /being reserved/);
  assert.equal(state.stock, 3);
});
