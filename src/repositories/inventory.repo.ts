import type { ClientSession, Types } from "mongoose";
import { ConflictRequestError } from "#/core/error.response.js";
import { InventoryModel, type Inventory, type ReservationStatus } from "#/models/inventory.model.js";
import { validateIdString, validatePositiveSafeInteger } from "#/utils/validation.js";
import { withSession } from "#/utils/mongo.js";

export type ReservationInput = {
  productId: string;
  sellerId: string;
  cartId: string;
  /** Reuse this ID for retries of the same checkout attempt. */
  reservationId: string;
  quantity: number;
};
export type ReservationIdentity = Omit<ReservationInput, "quantity">;
type TerminalStatus = Exclude<ReservationStatus, "active">;

export const RESERVATION_TTL_MS = 15 * 60 * 1000;
const EXPIRE_BATCH_SIZE = 100;

const insertInventory = (payload: Partial<Inventory>) => InventoryModel.create(payload);

const setInventoryStock = (productId: string, sellerId: string, stock: number) =>
  InventoryModel.updateOne(
    { inven_productId: productId, inven_sellerId: sellerId },
    { $set: { inven_stock: stock }, $setOnInsert: { inven_location: "default" } },
    { runValidators: true, upsert: true },
  );

const findStock = (productId: Types.ObjectId | string, sellerId: Types.ObjectId | string) =>
  InventoryModel.findOne({ inven_productId: productId, inven_sellerId: sellerId }).select("inven_stock").lean().exec();

/** Loads stock for many (product, seller) pairs in a single query. */
const findStocks = (pairs: { productId: string; sellerId: string }[], session?: ClientSession) =>
  withSession(
    InventoryModel.find({
      $or: pairs.map(({ productId, sellerId }) => ({ inven_productId: productId, inven_sellerId: sellerId })),
    }),
    session,
  )
    .select("inven_productId inven_sellerId inven_stock")
    .lean()
    .exec();

const parseIdentity =(input: ReservationIdentity): ReservationIdentity => ({
  productId: validateIdString(input.productId, "productId"),
  sellerId: validateIdString(input.sellerId, "sellerId"),
  cartId: validateIdString(input.cartId, "cartId"),
  reservationId: validateIdString(input.reservationId, "reservationId"),
});

const inventoryFilter = ({ productId, sellerId }: ReservationIdentity) => ({
  inven_productId: productId,
  inven_sellerId: sellerId,
});

const findReservation = async (identity: ReservationIdentity, session?: ClientSession) => {
  const inventory = await withSession(InventoryModel.findOne(inventoryFilter(identity)), session)
    .select("inven_reservations")
    .lean()
    .exec();
  return inventory?.inven_reservations.find((item) => item.reservationId === identity.reservationId);
};

/** A cancel request on an already-expired reservation is treated as done. */
const isAlreadyFinished = (current: ReservationStatus | null | undefined, target: TerminalStatus) =>
  current === target || (target === "cancelled" && current === "expired");

const reserveInventoryStock = async (input: ReservationInput, session?: ClientSession, expiry?: Date) => {
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
  const result = await InventoryModel.updateOne(
    {
      ...inventoryFilter(identity),
      inven_stock: { $gte: quantity },
      "inven_reservations.reservationId": { $ne: identity.reservationId },
    },
    { $inc: { inven_stock: -quantity }, $push: { inven_reservations: reservation } },
    { session },
  );
  if (result.modifiedCount === 1) return reservation;

  // Nothing changed: either stock is insufficient or this is a retry of an existing reservation.
  const existing = await findReservation(identity, session);
  if (!existing) throw new ConflictRequestError("Inventory không tồn tại hoặc không đủ hàng");
  if (existing.cartId !== identity.cartId || existing.quantity !== quantity) {
    throw new ConflictRequestError("Reservation ID was already used with different data");
  }
  const isStillActive = existing.status === "active" && existing.expiresAt && existing.expiresAt > now;
  if (isStillActive || existing.status === "confirmed") return existing;
  throw new ConflictRequestError("Reservation is cancelled or expired; use a new reservationId");
};

/** Terminal records are retained so retries never decrement or restore stock twice. */
const finishReservation = async (input: ReservationIdentity, status: TerminalStatus, session?: ClientSession) => {
  const identity = parseIdentity(input);
  const existing = await findReservation(identity, session);
  if (!existing || existing.cartId !== identity.cartId) throw new ConflictRequestError("Reservation not found");
  if (isAlreadyFinished(existing.status, status)) return existing;
  if (existing.status !== "active") throw new ConflictRequestError("Reservation is already completed");

  const quantity = validatePositiveSafeInteger(existing.quantity, "reservation quantity");
  const now = new Date();
  // Confirmation must happen before expiry; expiry may only happen after it.
  const expiresAtGuard =
    status === "confirmed" ? { expiresAt: { $gt: now } } : status === "expired" ? { expiresAt: { $lte: now } } : {};
  const restoreStock = status === "confirmed" ? {} : { $inc: { inven_stock: quantity } };

  const result = await InventoryModel.updateOne(
    {
      ...inventoryFilter(identity),
      inven_reservations: {
        $elemMatch: {
          reservationId: identity.reservationId,
          cartId: identity.cartId,
          status: "active",
          quantity,
          ...expiresAtGuard,
        },
      },
    },
    {
      ...restoreStock,
      $set: { "inven_reservations.$.status": status, "inven_reservations.$.completedAt": now },
    },
    { session },
  );
  if (result.modifiedCount === 1) return { ...existing, status, completedAt: now };

  const current = await findReservation(identity, session);
  if (current && isAlreadyFinished(current.status, status)) return current;
  throw new ConflictRequestError("Reservation expired or was completed concurrently");
};

const cancelReservationInventory = (input: ReservationIdentity, session?: ClientSession) =>
  finishReservation(input, "cancelled", session);

const confirmReservationInventory = (input: ReservationIdentity, session?: ClientSession) =>
  finishReservation(input, "confirmed", session);

const expireInventoryReservations = async (): Promise<number> => {
  const now = new Date();
  const inventories = await InventoryModel.find({
    inven_reservations: { $elemMatch: { status: "active", expiresAt: { $lte: now } } },
  })
    .select("inven_productId inven_sellerId inven_reservations")
    .limit(EXPIRE_BATCH_SIZE)
    .lean()
    .exec();

  let expired = 0;
  for (const inventory of inventories) {
    const dueReservations = inventory.inven_reservations.filter(
      (reservation) =>
        reservation.reservationId &&
        reservation.status === "active" &&
        reservation.expiresAt &&
        reservation.expiresAt <= now,
    );
    for (const reservation of dueReservations) {
      try {
        await finishReservation(
          {
            productId: inventory.inven_productId.toString(),
            sellerId: inventory.inven_sellerId.toString(),
            cartId: reservation.cartId,
            reservationId: reservation.reservationId!,
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
  findStock,
  findStocks,
  reserveInventoryStock,
  cancelReservationInventory,
  confirmReservationInventory,
  expireInventoryReservations,
};
