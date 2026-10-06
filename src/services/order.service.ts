import mongoose, { Types } from "mongoose";
import { ConflictRequestError, NotFoundError } from "#/core/error.response.js";
import { validateIdString } from "#/common/utils/validation.js";
import { OrderModel } from "#/models/order.model.js";
import { ProductModel } from "#/models/products.model.js";
import { AccountModel } from "#/models/account.model.js";
import { validateCreateOrderPayload } from "#/models/repositories/order.repo.js";
import { reservationInventory, cancelReservationInventory, RESERVATION_TTL_MS } from "#/models/repositories/inventory.repo.js";
import CheckoutService from "#/services/checkout.service.js";
import { acquireLock, releaseLock, type RedisLock } from "#/services/redis.service.js";
import log from "#/helpers/logger.js";

class OrderService {
  static async createOrder(value: unknown, authenticatedAccountId: string) {
    const { checkout, requestId, requestHash } = validateCreateOrderPayload(value, authenticatedAccountId);
    const accountId = checkout.accountId;
    await OrderModel.init(); // Ensure the idempotency unique index exists before accepting orders.
    const previous = await OrderModel.findOne({ accountId, requestId }).select("+requestHash").exec();
    const checkPrevious = (order: NonNullable<typeof previous>) => {
      if (order.requestHash !== requestHash) throw new ConflictRequestError("requestId was already used with different checkout data");
      const { requestHash: _hash, ...result } = order.toObject();
      return result;
    };
    if (previous) return checkPrevious(previous);
    const reservationId = new Types.ObjectId().toHexString();
    const selected = checkout.shop_ids.flatMap((shop) => shop.items.map((item) => ({
      productId: item.product_id, sellerId: shop.shop_id, cartId: checkout.cartId,
      reservationId, quantity: item.quantity,
    }))).sort((a, b) => a.productId.localeCompare(b.productId));
    const locks: RedisLock[] = [];
    try {
      for (const item of selected) {
        const lock = await acquireLock(item.productId, item.quantity, item.cartId);
        if (!lock) throw new ConflictRequestError("Product is being reserved; please retry with the same requestId");
        locks.push(lock);
      }
      const session = await mongoose.startSession();
      try {
        const order = await session.withTransaction(async () => {
          const existing = await OrderModel.findOne({ accountId, requestId }).select("+requestHash").session(session).exec();
          if (existing) return checkPrevious(existing);
          const available = await ProductModel.countDocuments({
            _id: { $in: selected.map((item) => item.productId) }, isDraft: false, isPublished: true,
          }).session(session).exec();
          if (available !== selected.length) throw new ConflictRequestError("One or more products are not available for purchase");
          const sellerIds = [...new Set(selected.map((item) => item.sellerId))];
          const activeSellers = await AccountModel.countDocuments({
            _id: { $in: sellerIds }, role: { $in: ["seller", "admin"] }, status: "active",
          }).session(session).exec();
          if (activeSellers !== sellerIds.length) throw new ConflictRequestError("One or more sellers are not active");
          const review = await CheckoutService.reviewCheckout(checkout, accountId, session);
          if (Object.values(review.checkout_order).some((amount) => !Number.isFinite(amount) || amount < 0)) {
            throw new ConflictRequestError("Invalid order totals");
          }
          if (review.checkout_summary.some((shop) => shop.items.some((item) => !Number.isFinite(item.price) || item.price < 0))) {
            throw new ConflictRequestError("Invalid product price");
          }
          const expiresAt = new Date(Date.now() + RESERVATION_TTL_MS);
          for (const item of selected) await reservationInventory(item, session, expiresAt);
          const [created] = await OrderModel.create([{
            accountId, cartId: checkout.cartId, requestId, requestHash, reservationId,
            status: "pending_payment", expiresAt, ...review,
          }], { session });
          const { requestHash: _hash, ...result } = created.toObject();
          return result;
        }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });
        return order;
      } finally { await session.endSession(); }
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === 11000) {
        const existing = await OrderModel.findOne({ accountId, requestId }).select("+requestHash").exec();
        if (existing) return checkPrevious(existing);
      }
      throw error;
    } finally {
      for (const lock of locks.reverse()) {
        try { await releaseLock(lock); } catch (error) { log.error("Order unlock", error); }
      }
    }
  }

  static async getOrder(id: string, authenticatedAccountId: string) {
    const order = await OrderModel.findOne({
      _id: validateIdString(id, "orderId"), accountId: validateIdString(authenticatedAccountId, "accountId"),
    }).lean().exec();
    if (!order) throw new NotFoundError("Order not found");
    // Persisted status is updated by cleanup; expose expiration immediately to the customer.
    return order.status === "pending_payment" && order.expiresAt <= new Date() ? { ...order, status: "expired" } : order;
  }

  static async cancelOrder(id: string, authenticatedAccountId: string) {
    const orderId = validateIdString(id, "orderId");
    const accountId = validateIdString(authenticatedAccountId, "accountId");
    const session = await mongoose.startSession();
    try {
      return await session.withTransaction(async () => {
        const order = await OrderModel.findOne({ _id: orderId, accountId }).session(session).exec();
        if (!order) throw new NotFoundError("Order not found");
        if (order.status === "cancelled") return order.toObject();
        const status = order.expiresAt <= new Date() ? "expired" : "cancelled";
        for (const shop of order.checkout_summary) {
          for (const item of shop.items) await cancelReservationInventory({
            productId: item.product_id, sellerId: shop.shop_id, cartId: order.cartId,
            reservationId: order.reservationId,
          }, session);
        }
        order.status = status;
        order.cancelledAt = new Date();
        await order.save({ session });
        return order.toObject();
      }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });
    } finally { await session.endSession(); }
  }
}
export default OrderService;
