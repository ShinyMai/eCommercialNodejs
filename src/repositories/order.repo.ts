import type { ClientSession } from "mongoose";
import { OrderModel } from "#/models/order.model.js";
import { withSession } from "#/utils/mongo.js";

/** Includes the hidden request hash, which is needed to validate idempotent retries. */
const findOrderByRequestId = (accountId: string, requestId: string, session?: ClientSession) =>
  withSession(OrderModel.findOne({ accountId, requestId }), session).select("+requestHash").exec();

const EXPIRE_BATCH_SIZE = 100;

/**
 * Moves due pending orders to expired one at a time, so the result lists exactly the orders this call
 * transitioned: an order cancelled concurrently no longer matches `pending_payment` and is skipped.
 */
const expirePendingOrders = async (now = new Date()) => {
  const expired: { _id: unknown; accountId: string }[] = [];
  for (;;) {
    const due = await OrderModel.find({ status: "pending_payment", expiresAt: { $lte: now } })
      .select("_id")
      .limit(EXPIRE_BATCH_SIZE)
      .lean()
      .exec();

    for (const { _id } of due) {
      const order = await OrderModel.findOneAndUpdate(
        { _id, status: "pending_payment" },
        { $set: { status: "expired" } },
        { returnDocument: "after" },
      )
        .select("accountId")
        .lean()
        .exec();
      if (order) expired.push(order);
    }
    if (due.length < EXPIRE_BATCH_SIZE) return expired;
  }
};

export { findOrderByRequestId, expirePendingOrders };
