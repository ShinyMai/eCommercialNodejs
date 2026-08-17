"use strict";

import mongoose, { Schema, InferSchemaType } from "mongoose";

const DOCUMENT_NAME = "Product";
const COLLECTION_NAME = "products";

const productsModel = new Schema(
  {
    product_name: { type: String, required: true },
    product_thumbnail: { type: String, required: true },
    product_description: { type: String },
    product_price: { type: Number, required: true },
    product_quantity: { type: Number, required: true },
    product_type: {
      type: String,
      required: true,
      enum: ["Electronics", "Clothing"],
    },
    product_shop: { type: Schema.Types.ObjectId, ref: "shop", required: true },
    product_attributes: { type: Schema.Types.Mixed, required: true },
  },
  {
    collection: COLLECTION_NAME,
    timestamps: true,
  },
);

const clothingModel = new Schema(
  {
    brand: { type: String, required: true },
    size: { type: String, required: true },
    material: { type: String, required: true },
  },
  {
    collection: "clothes",
    timestamps: true,
  },
);

const electronicsModel = new Schema(
  {
    manufacturer: { type: String, required: true },
    model: { type: Number, required: true },
    color: { type: Number, required: true },
  },
  {
    collection: "electronics",
    timestamps: true,
  },
);

export const ProductModel = mongoose.model(DOCUMENT_NAME, productsModel);
export type Product = InferSchemaType<typeof productsModel>;

export const ClothingModel = mongoose.model("Clothing", clothingModel);
export const ElectronicsModel = mongoose.model("Electronics", electronicsModel);
