import mongoose, { Schema, type InferSchemaType } from "mongoose";

export const DISCOUNT_TYPES = ["percentage", "fixed_amount"] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

export const DISCOUNT_APPLIES_TO = ["all", "specific_products"] as const;
export type DiscountAppliesTo = (typeof DISCOUNT_APPLIES_TO)[number];

const discountSchema = new Schema(
  {
    discount_name: { type: String, required: true, trim: true, maxLength: 200 },
    discount_description: { type: String, required: true, trim: true },
    discount_type: { type: String, enum: DISCOUNT_TYPES, required: true },
    discount_value: { type: Number, required: true, min: 0 },
    discount_code: { type: String, required: true, trim: true, uppercase: true },
    discount_start_date: { type: Date, required: true },
    discount_end_date: { type: Date, required: true },
    discount_max_uses: { type: Number, required: true, min: 1 },
    discount_used_count: { type: Number, default: 0, min: 0 },
    discount_used_by_accounts: { type: [Schema.Types.ObjectId], ref: "Account", default: [] },
    // Minimum order subtotal required to apply the discount.
    discount_minimum_purchase: { type: Number, required: true, min: 0 },
    discount_sellerId: { type: Schema.Types.ObjectId, ref: "Account", required: true },
    discount_productIds: { type: [Schema.Types.ObjectId], ref: "Product", default: [] },
    discount_status: { type: Boolean, default: true },
    discount_applies_to: { type: String, enum: DISCOUNT_APPLIES_TO, required: true },
    is_deleted: { type: Boolean, default: false },
  },
  { timestamps: true, collection: "discounts" },
);

discountSchema.index({ discount_code: 1, discount_sellerId: 1 }, { unique: true });

export type Discount = InferSchemaType<typeof discountSchema>;
export const DiscountModel = mongoose.model("Discount", discountSchema);
