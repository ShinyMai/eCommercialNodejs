import mongoose, { InferSchemaType, Schema } from "mongoose";

const cartItemSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    quantity: {
      type: Number,
      required: true,
      default: 1,
      validate: {
        validator: (value: number) => Number.isSafeInteger(value) && value > 0,
        message: "Cart quantity must be a positive safe integer",
      },
    },
  },
  { _id: false },
);

const cartSchema = new Schema(
  {
    cart_account: { type: Schema.Types.ObjectId, ref: "Account", required: true, index: true, unique: true },
    cart_items: {
      type: [cartItemSchema],
      default: [],
      validate: [
        {
          validator: (items: { product: mongoose.Types.ObjectId }[]) => items.length <= 100,
          message: "Cart cannot contain more than 100 distinct products",
        },
        {
          validator: (items: { product: mongoose.Types.ObjectId }[]) =>
            new Set(items.map((item) => item.product?.toString())).size === items.length,
          message: "Cart cannot contain duplicate products",
        },
      ],
    },
  },
  {
    collection: "carts",
    timestamps: true,
    optimisticConcurrency: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

cartSchema.virtual("cart_count_products").get(function () {
  return this.cart_items.length;
});

cartSchema.virtual("cart_total_quantity").get(function () {
  return this.cart_items.reduce((total, item) => total + item.quantity, 0);
});

export type Cart = InferSchemaType<typeof cartSchema>;
export const CartModel = mongoose.model("Cart", cartSchema);
