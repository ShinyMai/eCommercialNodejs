"use strict";

import mongoose, { InferSchemaType, Schema } from "mongoose";

const DOCUMENT_NAME = "Discount";
const COLLECTION_NAME = "discounts";

const discountSchema = new Schema(
  {
    discount_name: {
      type: String,
      required: true,
    },
    discount_description: {
      type: String,
      required: true,
    },
    discount_type: {
      type: String,
      enum: ["percentage", "fixed_amount"],
      required: true,
    },
    discount_value: {
      type: Number,
      required: true,
    },
    discount_code: {
      type: String,
      required: true,
      unique: true,
    },
    discount_start_date: {
      type: Date,
      required: true,
    },
    discount_end_date: {
      type: Date,
      required: true,
    },
    discount_max_uses: {
      type: Number,
      required: true,
    },
    discount_used_count: {
      type: Number,
      default: 0,
    },
    discount_used_by: {
      type: [Schema.Types.ObjectId],
      ref: "User",
      default: [],
    },
    discount_minimum_purchase: {
      type: Number,
      required: true,
    },
    discount_shopId: {
      type: Schema.Types.ObjectId,
      ref: "Shop",
      required: true,
    },
    discount_productId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    discount_status: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    collection: COLLECTION_NAME,
  },
);

discountSchema.index({ discount_productId: 1, inven_shopId: 1 }, { unique: true });

export type Discount = InferSchemaType<typeof discountSchema>;
export default mongoose.model(DOCUMENT_NAME, discountSchema);
