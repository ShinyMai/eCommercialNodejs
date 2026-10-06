"use strict";

import { validateIdString, validatePositiveSafeInteger } from "#/common/utils/validation.js";
import { ConflictRequestError } from "#/core/error.response.js";
import inventoryModel, { Inventory } from "../inventory.model.js";
import type { ClientSession } from "mongoose";

const insertInventory = async (payload: Partial<Inventory>) => {
  return inventoryModel.create(payload);
};

const setInventoryStock = async (productId: string, sellerId: string, stock: number) => {
  const result = await inventoryModel.updateOne(
    { inven_productId: productId, inven_sellerId: sellerId },
    {
      $set: { inven_stock: stock },
      $setOnInsert: { inven_location: "default" },
    },
    { runValidators: true, upsert: true },
  );
  return result;
};

export type ReservationInput = {
  productId: string;
  sellerId: string;
  cartId: string;
  reservationId: string; // Reuse this ID for retries of the same checkout attempt.
  quantity: number;
};
export type ReservationIdentity = Omit<ReservationInput, "quantity">;
export const RESERVATION_TTL_MS = 15 * 60 * 1000;

const parseIdentity = (input: ReservationIdentity): ReservationIdentity => ({
  productId: validateIdString(input.productId, "productId"),
  sellerId: validateIdString(input.sellerId, "sellerId"),
  cartId: validateIdString(input.cartId, "cartId"),
  reservationId: validateIdString(input.reservationId, "reservationId"),
});

const findReservation = async (input: ReservationIdentity, session?: ClientSession) => {
  const query = inventoryModel.findOne({
    inven_productId: input.productId,
    inven_sellerId: input.sellerId,
  });
  if (session) query.session(session);
  const inventory = await query.select("inven_reservations").lean().exec();
  return inventory?.inven_reservations.find((item) => item.reservationId === input.reservationId);
};

const reservationInventory = async (input: ReservationInput, session?: ClientSession, expiry?: Date) => {
  const identity = parseIdentity(input);
  const quantity = validatePositiveSafeInteger(input.quantity, "quantity");
  const now = new Date();
  const reservation = {
    reservationId: identity.reservationId,
    cartId: identity.cartId,
    quantity,
    reservedAt: now,
    expiresAt: expiry ?? new Date(now.getTime() + RESERVATION_TTL_MS),
    status: "active" as const,
  };
  // The absent-ID predicate and stock decrement are atomic on the same inventory document.
  const result = await inventoryModel.updateOne(
    {
      inven_productId: identity.productId,
      inven_sellerId: identity.sellerId,
      inven_stock: { $gte: quantity },
      "inven_reservations.reservationId": { $ne: identity.reservationId },
    },
    { $inc: { inven_stock: -quantity }, $push: { inven_reservations: reservation } },
    { session },
  );
  if (result.modifiedCount === 1) return reservation;
  const existing = await findReservation(identity, session);
  if (!existing) throw new ConflictRequestError("Inventory không tồn tại hoặc không đủ hàng");
  if (existing.cartId !== identity.cartId || existing.quantity !== quantity) {
    throw new ConflictRequestError("Reservation ID was already used with different data");
  }
  if (existing.status === "active" && existing.expiresAt && existing.expiresAt > now) return existing;
  if (existing.status === "confirmed") return existing;
  throw new ConflictRequestError("Reservation is cancelled or expired; use a new reservationId");
};

// Terminal records are retained so retries never decrement or restore stock twice.
const finishReservation = async (
  input: ReservationIdentity,
  status: "confirmed" | "cancelled" | "expired",
  session?: ClientSession,
) => {
  const identity = parseIdentity(input);
  const existing = await findReservation(identity, session);
  if (!existing || existing.cartId !== identity.cartId) throw new ConflictRequestError("Reservation not found");
  if (existing.status === status) return existing;
  if (status === "cancelled" && existing.status === "expired") return existing;
  if (existing.status !== "active") throw new ConflictRequestError("Reservation is already completed");
  const quantity = validatePositiveSafeInteger(existing.quantity, "reservation quantity");
  const now = new Date();
  const expiresAt = status === "confirmed" ? { $gt: now } : status === "expired" ? { $lte: now } : undefined;
  const result = await inventoryModel.updateOne(
    {
      inven_productId: identity.productId,
      inven_sellerId: identity.sellerId,
      inven_reservations: {
        $elemMatch: {
          reservationId: identity.reservationId,
          cartId: identity.cartId,
          status: "active",
          quantity,
          ...(expiresAt ? { expiresAt } : {}),
        },
      },
    },
    {
      ...(status === "confirmed" ? {} : { $inc: { inven_stock: quantity } }),
      $set: { "inven_reservations.$.status": status, "inven_reservations.$.completedAt": now },
    },
    { session },
  );
  if (result.modifiedCount === 1) return { ...existing, status, completedAt: now };
  const current = await findReservation(identity, session);
  if (current?.status === status) return current;
  if (status === "cancelled" && current?.status === "expired") return current;
  throw new ConflictRequestError("Reservation expired or was completed concurrently");
};

const cancelReservationInventory = (input: ReservationIdentity, session?: ClientSession) =>
  finishReservation(input, "cancelled", session);
const confirmReservationInventory = (input: ReservationIdentity, session?: ClientSession) =>
  finishReservation(input, "confirmed", session);

const expireInventoryReservations = async (): Promise<number> => {
  const now = new Date();
  const inventories = await inventoryModel
    .find({
      inven_reservations: { $elemMatch: { status: "active", expiresAt: { $lte: now } } },
    })
    .select("inven_productId inven_sellerId inven_reservations")
    .limit(100)
    .lean()
    .exec();
  let expired = 0;
  for (const inventory of inventories) {
    for (const reservation of inventory.inven_reservations) {
      if (
        !reservation.reservationId ||
        reservation.status !== "active" ||
        !reservation.expiresAt ||
        reservation.expiresAt > now
      )
        continue;
      try {
        await finishReservation(
          {
            productId: inventory.inven_productId.toString(),
            sellerId: inventory.inven_sellerId.toString(),
            cartId: reservation.cartId,
            reservationId: reservation.reservationId,
          },
          "expired",
        );
        expired++;
      } catch (error) {
        // A concurrent cancellation/confirmation/worker can win the atomic transition.
        if (!(error instanceof ConflictRequestError)) throw error;
      }
    }
  }
  return expired;
};

export {
  insertInventory,
  setInventoryStock,
  reservationInventory,
  cancelReservationInventory,
  confirmReservationInventory,
  expireInventoryReservations,
};
