import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cancelReservationInventory,
  confirmReservationInventory,
  expireInventoryReservations,
  reserveInventoryStock,
} from "#/repositories/inventory.repo.js";
import { newId } from "../../helpers/fixtures.js";
import { mockInventory } from "../../helpers/inventory.mock.js";

test("concurrent retries reserve once; conflicting reuse and overselling are rejected", async (t) => {
  const { input, state } = mockInventory(t);

  const results = await Promise.all([reserveInventoryStock(input), reserveInventoryStock(input)]);
  assert.equal(state.stock, 1);
  assert.equal(results[0].reservationId, results[1].reservationId);
  assert.equal(state.reservations.length, 1);

  await assert.rejects(reserveInventoryStock({ ...input, quantity: 1 }), /different data/);
  await assert.rejects(reserveInventoryStock({ ...input, reservationId: newId() }), /không đủ hàng/);

  await Promise.all([cancelReservationInventory(input), cancelReservationInventory(input)]);
  assert.equal(state.stock, 3);
  await assert.rejects(reserveInventoryStock(input), /cancelled or expired/);
});

test("confirmation is idempotent and never restores consumed stock", async (t) => {
  const { input, state } = mockInventory(t);
  await reserveInventoryStock(input);

  await Promise.all([confirmReservationInventory(input), confirmReservationInventory(input)]);
  assert.equal(state.stock, 1);
  assert.equal(state.reservations[0].status, "confirmed");

  await assert.rejects(cancelReservationInventory(input), /already completed/);
  await reserveInventoryStock(input); // retry of a confirmed reservation is a no-op
  assert.equal(state.stock, 1);
});

test("expiry restores stock once and blocks late confirmation", async (t) => {
  const { input, state } = mockInventory(t);
  await reserveInventoryStock(input);
  state.reservations[0].expiresAt = new Date(0);

  await assert.rejects(confirmReservationInventory(input), /expired/);
  await Promise.all([expireInventoryReservations(), expireInventoryReservations()]);
  assert.equal(state.stock, 3);
  assert.equal(state.reservations[0].status, "expired");

  await expireInventoryReservations();
  assert.equal(state.stock, 3);
  // Cancelling an already-expired reservation is treated as done.
  assert.equal((await cancelReservationInventory(input)).status, "expired");
});

test("reservation identity must be valid IDs", async (t) => {
  const { input } = mockInventory(t);
  await assert.rejects(reserveInventoryStock({ ...input, cartId: "bad" }), { name: "BadRequestError" });
  await assert.rejects(reserveInventoryStock({ ...input, quantity: 0 }), { name: "BadRequestError" });
});
