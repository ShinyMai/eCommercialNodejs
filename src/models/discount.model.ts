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
    }, // Minimum purchase amount required to apply the discount
    discount_shopId: {
      type: Schema.Types.ObjectId,
      ref: "Shop",
      required: true,
    },
    discount_productIds: {
      type: [Schema.Types.ObjectId],
      ref: "Product",
      default: [],
    },
    discount_status: {
      type: Boolean,
      default: true,
    },
    discount_applies_to: {
      type: String,
      enum: ["all", "specific_products"],
      required: true,
    },
    is_deleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    collection: COLLECTION_NAME,
  },
);

discountSchema.index({ discount_code: 1, discount_shopId: 1 }, { unique: true });

export type Discount = InferSchemaType<typeof discountSchema>;
export const DiscountModel = mongoose.model(DOCUMENT_NAME, discountSchema);
