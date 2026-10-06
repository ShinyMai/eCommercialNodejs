import mongoose, { Schema, type InferSchemaType } from "mongoose";
import slugify from "slugify";

export const PRODUCT_TYPES = ["Electronics", "Clothing"] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

export const toProductSlug = (name: string) => slugify(name, { lower: true });

const productSchema = new Schema(
  {
    product_name: { type: String, required: true, trim: true, maxLength: 200 },
    product_thumbnail: { type: String, required: true, trim: true, maxLength: 2_000 },
    product_description: { type: String, trim: true },
    product_slug: { type: String },
    product_price: { type: Number, required: true, min: 0 },
    product_quantity: { type: Number, required: true, min: 0 },
    product_type: { type: String, required: true, enum: PRODUCT_TYPES },
    product_seller: { type: Schema.Types.ObjectId, ref: "Account", required: true },
    product_attributes: { type: Schema.Types.Mixed, required: true },
    product_ratingAverage: {
      type: Number,
      default: 1,
      min: [1, "Rating must be at least 1"],
      max: [5, "Rating must be at most 5"],
      set: (value: number) => Math.round(value * 10) / 10,
    },
    product_variations: { type: Array, default: [] },
    isDraft: { type: Boolean, default: true, index: true, select: false },
    isPublished: { type: Boolean, default: false, index: true, select: false },
  },
  { collection: "products", timestamps: true },
);

productSchema.index({ product_name: "text", product_description: "text" });
productSchema.index({ product_seller: 1, isDraft: 1, createdAt: -1 });
productSchema.index({ product_seller: 1, isPublished: 1, createdAt: -1 });

productSchema.pre("save", function () {
  this.product_slug = toProductSlug(this.product_name);
});

export type Product = InferSchemaType<typeof productSchema>;
export const ProductModel = mongoose.model("Product", productSchema);
