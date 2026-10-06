import mongoose, { Schema, type InferSchemaType } from "mongoose";

export const RESERVATION_STATUSES = ["active", "confirmed", "cancelled", "expired"] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

const reservationSchema = new Schema(
  {
    reservationId: { type: String },
    cartId: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    reservedAt: { type: Date, required: true },
    expiresAt: { type: Date },
    status: { type: String, enum: RESERVATION_STATUSES },
    completedAt: { type: Date },
  },
  { _id: false },
);

const inventorySchema = new Schema(
  {
    inven_productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    inven_location: { type: String, trim: true, default: "unknown" },
    inven_stock: { type: Number, required: true, min: [0, "Inventory stock cannot be negative"] },
    inven_sellerId: { type: Schema.Types.ObjectId, ref: "Account", required: true },
    inven_reservations: { type: [reservationSchema], default: [] },
  },
  { timestamps: true, collection: "inventories" },
);

inventorySchema.index({ inven_productId: 1, inven_sellerId: 1 }, { unique: true });
inventorySchema.index({ "inven_reservations.status": 1, "inven_reservations.expiresAt": 1 });

export type Inventory = InferSchemaType<typeof inventorySchema>;
export const InventoryModel = mongoose.model("Inventory", inventorySchema);
