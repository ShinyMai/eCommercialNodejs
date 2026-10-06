import { ACCOUNT_ROLES } from "#/auth/roles.js";
import mongoose, { InferSchemaType, Schema } from "mongoose";
import type { RuntimeValue } from "#/types/value.types.js";

export const ACCOUNT_STATUSES = ["pending", "active", "inactive"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const isAccountStatus = (value: RuntimeValue): value is AccountStatus =>
  ACCOUNT_STATUSES.includes(value as AccountStatus);

const accountSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
    },
    password: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: ACCOUNT_ROLES,
      default: "buyer",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ACCOUNT_STATUSES,
      default: "active",
      index: true,
    },
    verified: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    collection: "accounts",
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

accountSchema.virtual("profile", {
  ref: "UserProfile",
  localField: "_id",
  foreignField: "account",
  justOne: true,
});

export type Account = InferSchemaType<typeof accountSchema>;
export const AccountModel = mongoose.model("Account", accountSchema);
