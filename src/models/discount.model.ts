"use strict";

import mongoose, { InferSchemaType, Schema } from "mongoose";

const DOCUMENT_NAME = "Discount";
const COLLECTION_NAME = "discounts";

const discountSchema = new Schema(
  {
    discount_name: {
      type: String,
      required: true,
      trim: true,
      maxLength: 200,
    },
    discount_description: {
      type: String,
      required: true,
      trim: true,
    },
    discount_type: {
      type: String,
      enum: ["percentage", "fixed_amount"],
      required: true,
    },
    discount_value: {
      type: Number,
      required: true,
      min: 0,
    },
    discount_code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
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
      min: 1,
    },
    discount_used_count: {
      type: Number,
      default: 0,
      min: 0,
    },
    discount_used_by_accounts: {
      type: [Schema.Types.ObjectId],
      ref: "Account",
      default: [],
    },
    discount_minimum_purchase: {
      type: Number,
      required: true,
      min: 0,
    }, // Minimum purchase amount required to apply the discount
    discount_sellerId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
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

discountSchema.index({ discount_code: 1, discount_sellerId: 1 }, { unique: true });

export type Discount = InferSchemaType<typeof discountSchema>;
export const DiscountModel = mongoose.model(DOCUMENT_NAME, discountSchema);
