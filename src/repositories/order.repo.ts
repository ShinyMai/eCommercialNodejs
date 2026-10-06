import type { ClientSession } from "mongoose";
import { OrderModel } from "#/models/order.model.js";
import { withSession } from "#/utils/mongo.js";

/** Includes the hidden request hash, which is needed to validate idempotent retries. */
const findOrderByRequestId = (accountId: string, requestId: string, session?: ClientSession) =>
  withSession(OrderModel.findOne({ accountId, requestId }), session).select("+requestHash").exec();

const expirePendingOrders = (now = new Date()) =>
  OrderModel.updateMany({ status: "pending_payment", expiresAt: { $lte: now } }, { $set: { status: "expired" } });

export { findOrderByRequestId, expirePendingOrders };
