import mongoose, { Schema, type InferSchemaType } from "mongoose";

const itemSchema = new Schema({
  product_id: { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
  quantity: { type: Number, required: true, min: 1 },
}, { _id: false });
const shopSchema = new Schema({
  shop_id: { type: String, required: true },
  discount_id: String,
  items: { type: [itemSchema], required: true },
  total_price: { type: Number, required: true, min: 0 },
  total_discount: { type: Number, required: true, min: 0 },
  total_checkout: { type: Number, required: true, min: 0 },
}, { _id: false });
const totalsSchema = new Schema({
  total_price: { type: Number, required: true, min: 0 },
  fee_shipping: { type: Number, required: true, min: 0 },
  total_discount: { type: Number, required: true, min: 0 },
  total_checkout: { type: Number, required: true, min: 0 },
}, { _id: false });
const orderSchema = new Schema({
  accountId: { type: String, required: true },
  cartId: { type: String, required: true },
  requestId: { type: String, required: true },
  requestHash: { type: String, required: true, select: false },
  status: { type: String, enum: ["pending_payment", "cancelled", "expired"], default: "pending_payment", required: true },
  reservationId: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  cancelledAt: Date,
  checkout_summary: { type: [shopSchema], required: true },
  checkout_order: { type: totalsSchema, required: true },
}, { collection: "orders", timestamps: true });
orderSchema.index({ accountId: 1, requestId: 1 }, { unique: true });
orderSchema.index({ status: 1, expiresAt: 1 });
export type Order = InferSchemaType<typeof orderSchema>;
export const OrderModel = mongoose.model("Order", orderSchema);
