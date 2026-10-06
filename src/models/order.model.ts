import mongoose, { Schema, type InferSchemaType } from "mongoose";

export const ORDER_STATUSES = ["pending_payment", "cancelled", "expired"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

const orderItemSchema = new Schema(
  {
    product_id: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false },
);

const shopSummarySchema = new Schema(
  {
    shop_id: { type: String, required: true },
    discount_id: String,
    items: { type: [orderItemSchema], required: true },
    total_price: { type: Number, required: true, min: 0 },
    total_discount: { type: Number, required: true, min: 0 },
    total_checkout: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const orderTotalsSchema = new Schema(
  {
    total_price: { type: Number, required: true, min: 0 },
    fee_shipping: { type: Number, required: true, min: 0 },
    total_discount: { type: Number, required: true, min: 0 },
    total_checkout: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const orderSchema = new Schema(
  {
    accountId: { type: String, required: true },
    cartId: { type: String, required: true },
    requestId: { type: String, required: true },
    requestHash: { type: String, required: true, select: false },
    status: { type: String, enum: ORDER_STATUSES, default: "pending_payment", required: true },
    reservationId: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    cancelledAt: Date,
    checkout_summary: { type: [shopSummarySchema], required: true },
    checkout_order: { type: orderTotalsSchema, required: true },
  },
  { collection: "orders", timestamps: true },
);

orderSchema.index({ accountId: 1, requestId: 1 }, { unique: true });
orderSchema.index({ status: 1, expiresAt: 1 });

export type Order = InferSchemaType<typeof orderSchema>;
export const OrderModel = mongoose.model("Order", orderSchema);
