"use strict";

import mongoose, { Schema, InferSchemaType } from "mongoose";
import slugify from "slugify";

const DOCUMENT_NAME = "Product";
const COLLECTION_NAME = "products";

const productsModel = new Schema(
  {
    product_name: { type: String, required: true, trim: true, maxLength: 200 },
    product_thumbnail: { type: String, required: true, trim: true, maxLength: 2_000 },
    product_description: { type: String, trim: true },
    product_slug: { type: String },
    product_price: { type: Number, required: true, min: 0 },
    product_quantity: { type: Number, required: true, min: 0 },
    product_type: {
      type: String,
      required: true,
      enum: ["Electronics", "Clothing"],
    },
    product_seller: { type: Schema.Types.ObjectId, ref: "Account", required: true },
    product_attributes: { type: Schema.Types.Mixed, required: true },
    product_ratingAverage: {
      type: Number,
      default: 1,
      min: [1, "Rating must be at least 1"],
      max: [5, "Rating must be at most 5"],
      set: (val: number) => Math.round(val * 10) / 10, // Round to 1 decimal place
    },
    product_variations: { type: Array, default: [] },
    isDraft: {
      type: Boolean,
      default: true,
      index: true,
      select: false,
    },
    isPublished: {
      type: Boolean,
      default: false,
      index: true,
      select: false,
    },
  },
  {
    collection: COLLECTION_NAME,
    timestamps: true,
  },
);

productsModel.index({ product_name: "text", product_description: "text" });
productsModel.index({ product_seller: 1, isDraft: 1, createdAt: -1 });
productsModel.index({ product_seller: 1, isPublished: 1, createdAt: -1 });

productsModel.pre("save", function () {
  this.product_slug = slugify(this.product_name, { lower: true });
});

export const ProductModel = mongoose.model(DOCUMENT_NAME, productsModel);
export type Product = InferSchemaType<typeof productsModel>;
