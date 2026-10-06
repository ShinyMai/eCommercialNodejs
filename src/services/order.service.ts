import mongoose, { Types, type ClientSession } from "mongoose";
import { ConflictRequestError, NotFoundError } from "#/core/error.response.js";
import { OrderModel } from "#/models/order.model.js";
import { countActiveSellers } from "#/repositories/account.repo.js";
import {
  cancelReservationInventory,
  reserveInventoryStock,
  RESERVATION_TTL_MS,
  type ReservationInput,
} from "#/repositories/inventory.repo.js";
import { findOrderByRequestId } from "#/repositories/order.repo.js";
import { countPurchasableProducts } from "#/repositories/product.repo.js";
import CheckoutService from "#/services/checkout.service.js";
import { withLocks } from "#/services/redis.service.js";
import { isDuplicateKeyError, TRANSACTION_OPTIONS } from "#/utils/mongo.js";
import { validateIdString } from "#/utils/validation.js";
import type { ReviewCheckoutPayload } from "#/validators/checkout.validator.js";
import { validateCreateOrderPayload } from "#/validators/order.validator.js";

type OrderDocument = NonNullable<Awaited<ReturnType<typeof findOrderByRequestId>>>;
type CheckoutReview = Awaited<ReturnType<typeof CheckoutService.reviewCheckout>>;

const isInvalidAmount = (amount: number) => !Number.isFinite(amount) || amount < 0;

/** Strips the internal idempotency hash before returning an order to the client. */
const toOrderResult = (order: OrderDocument) => {
  const { requestHash: _hash, ...result } = order.toObject();
  return result;
};

/** A retried request must carry the same checkout content as the original one. */
const toIdempotentResult = (order: OrderDocument, requestHash: string) => {
  if (order.requestHash !== requestHash) {
    throw new ConflictRequestError("requestId was already used with different checkout data");
  }
  return toOrderResult(order);
};

/** Sorted by product ID so concurrent orders acquire locks in the same order (no deadlocks). */
const toReservationItems = (checkout: ReviewCheckoutPayload, reservationId: string): ReservationInput[] =>
  checkout.shop_ids
    .flatMap((shop) =>
      shop.items.map((item) => ({
        productId: item.product_id,
        sellerId: shop.shop_id,
        cartId: checkout.cartId,
        reservationId,
        quantity: item.quantity,
      })),
    )
    .sort((a, b) => a.productId.localeCompare(b.productId));

const assertItemsPurchasable = async (items: ReservationInput[], session: ClientSession) => {
  const available = await countPurchasableProducts(
    items.map((item) => item.productId),
    session,
  );
  if (available !== items.length) {
    throw new ConflictRequestError("One or more products are not available for purchase");
  }

  const sellerIds = [...new Set(items.map((item) => item.sellerId))];
  if ((await countActiveSellers(sellerIds, session)) !== sellerIds.length) {
    throw new ConflictRequestError("One or more sellers are not active");
  }
};

const assertValidTotals = ({ checkout_order, checkout_summary }: CheckoutReview) => {
  if (Object.values(checkout_order).some(isInvalidAmount)) {
    throw new ConflictRequestError("Invalid order totals");
  }
  if (checkout_summary.some((shop) => shop.items.some((item) => isInvalidAmount(item.price)))) {
    throw new ConflictRequestError("Invalid product price");
  }
};

const runInTransaction = async <T>(work: (session: ClientSession) => Promise<T>): Promise<T> => {
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(() => work(session), TRANSACTION_OPTIONS);
  } finally {
    await session.endSession();
  }
};

class OrderService {
  static async createOrder(value: unknown, authenticatedAccountId: string) {
    const { checkout, requestId, requestHash } = validateCreateOrderPayload(value, authenticatedAccountId);
    const { accountId, cartId } = checkout;

    await OrderModel.init(); // Ensure the idempotency unique index exists before accepting orders.
    const previous = await findOrderByRequestId(accountId, requestId);
    if (previous) return toIdempotentResult(previous, requestHash);

    const reservationId = new Types.ObjectId().toHexString();
    const items = toReservationItems(checkout, reservationId);

    try {
      return await withLocks(items, "Product is being reserved; please retry with the same requestId", () =>
        runInTransaction(async (session) => {
          const existing = await findOrderByRequestId(accountId, requestId, session);
          if (existing) return toIdempotentResult(existing, requestHash);

          await assertItemsPurchasable(items, session);
          const review = await CheckoutService.reviewCheckout(checkout, accountId, session);
          assertValidTotals(review);

          const expiresAt = new Date(Date.now() + RESERVATION_TTL_MS);
          for (const item of items) await reserveInventoryStock(item, session, expiresAt);

          const [created] = await OrderModel.create(
            [{ accountId, cartId, requestId, requestHash, reservationId, status: "pending_payment", expiresAt, ...review }],
            { session },
          );
          return toOrderResult(created);
        }),
      );
    } catch (error) {
      // A concurrent request with the same requestId won the unique index race.
      if (isDuplicateKeyError(error)) {
        const existing = await findOrderByRequestId(accountId, requestId);
        if (existing) return toIdempotentResult(existing, requestHash);
      }
      throw error;
    }
  }

  static async getOrder(id: string, authenticatedAccountId: string) {
    const order = await OrderModel.findOne({
      _id: validateIdString(id, "orderId"),
      accountId: validateIdString(authenticatedAccountId, "accountId"),
    })
      .lean()
      .exec();
    if (!order) throw new NotFoundError("Order not found");

    // Persisted status is updated by the cleanup job; expose expiration to the customer immediately.
    const isExpired = order.status === "pending_payment" && order.expiresAt <= new Date();
    return isExpired ? { ...order, status: "expired" } : order;
  }

  static async cancelOrder(id: string, authenticatedAccountId: string) {
    const orderId = validateIdString(id, "orderId");
    const accountId = validateIdString(authenticatedAccountId, "accountId");

    return runInTransaction(async (session) => {
      const order = await OrderModel.findOne({ _id: orderId, accountId }).session(session).exec();
      if (!order) throw new NotFoundError("Order not found");
      if (order.status === "cancelled") return order.toObject();
      const status = order.expiresAt <= new Date() ? "expired" : "cancelled";

      for (const shop of order.checkout_summary) {
        for (const item of shop.items) {
          await cancelReservationInventory(
            {
              productId: item.product_id,
              sellerId: shop.shop_id,
              cartId: order.cartId,
              reservationId: order.reservationId,
            },
            session,
          );
        }
      }

      order.status = status;
      order.cancelledAt = new Date();
      await order.save({ session });
      return order.toObject();
    });
  }
}

export default OrderService;
