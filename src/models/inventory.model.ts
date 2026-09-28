"use strict";

import mongoose, { InferSchemaType, Schema } from "mongoose";

const DOCUMENT_NAME = "Inventory";
const COLLECTION_NAME = "inventories";

const inventorySchema = new Schema(
  {
    inven_productId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    inven_location: {
      type: String,
      trim: true,
      default: "unknown",
    },
    inven_stock: {
      type: Number,
      required: true,
      min: [0, "Inventory stock cannot be negative"],
    },
    inven_shopId: {
      type: Schema.Types.ObjectId,
      ref: "Shop",
      required: true,
    },
    inven_reservations: {
      type: [Schema.Types.Mixed],
      default: [],
    },
  },
  {
    timestamps: true,
    collection: COLLECTION_NAME,
  },
);

inventorySchema.index({ inven_productId: 1, inven_shopId: 1 }, { unique: true });

export type Inventory = InferSchemaType<typeof inventorySchema>;
export default mongoose.model(DOCUMENT_NAME, inventorySchema);
