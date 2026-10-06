import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import { Types } from "mongoose";
import { InventoryModel } from "#/models/inventory.model.js";
import type { ReservationInput } from "#/repositories/inventory.repo.js";
import { newId, queryOf } from "./fixtures.js";

type Reservation = {
  reservationId: string;
  cartId: string;
  quantity: number;
  status: string;
  expiresAt: Date;
  reservedAt: Date;
  completedAt?: Date;
};

/**
 * In-memory inventory document that honours the atomic predicates used by the repository,
 * so concurrency/idempotency rules can be verified without MongoDB.
 */
export const mockInventory = (t: TestContext, initialStock = 3) => {
  const input: ReservationInput = {
    productId: newId(),
    sellerId: newId(),
    cartId: newId(),
    reservationId: newId(),
    quantity: 2,
  };
  const state = { stock: initialStock, reservations: [] as Reservation[] };
  const document = () => ({
    inven_productId: new Types.ObjectId(input.productId),
    inven_sellerId: new Types.ObjectId(input.sellerId),
    inven_reservations: structuredClone(state.reservations),
  });

  t.mock.method(InventoryModel, "findOne", () => queryOf(document()));
  t.mock.method(InventoryModel, "find", () => queryOf([document()]));
  t.mock.method(InventoryModel, "updateOne", async (filter: any, update: any) => {
    assert.equal(filter.inven_productId, input.productId);
    assert.equal(filter.inven_sellerId, input.sellerId);

    if (update.$push) {
      const reservationId = filter["inven_reservations.reservationId"].$ne;
      assert.equal(reservationId, update.$push.inven_reservations.reservationId);
      assert.equal(filter.inven_stock.$gte, -update.$inc.inven_stock);
      const duplicate = state.reservations.some((r) => r.reservationId === reservationId);
      if (state.stock < filter.inven_stock.$gte || duplicate) return { modifiedCount: 0 };
      state.stock += update.$inc.inven_stock;
      state.reservations.push(structuredClone(update.$push.inven_reservations));
      return { modifiedCount: 1 };
    }

    const expected = filter.inven_reservations.$elemMatch;
    assert.equal(expected.status, "active");
    const reservation = state.reservations.find(
      (r) =>
        r.reservationId === expected.reservationId &&
        r.cartId === expected.cartId &&
        r.status === "active" &&
        r.quantity === expected.quantity,
    );
    const tooLate = expected.expiresAt?.$gt && reservation && reservation.expiresAt <= expected.expiresAt.$gt;
    const tooEarly = expected.expiresAt?.$lte && reservation && reservation.expiresAt > expected.expiresAt.$lte;
    if (!reservation || tooLate || tooEarly) return { modifiedCount: 0 };

    state.stock += update.$inc?.inven_stock ?? 0;
    reservation.status = update.$set["inven_reservations.$.status"];
    reservation.completedAt = update.$set["inven_reservations.$.completedAt"];
    return { modifiedCount: 1 };
  });

  return { input, state };
};
