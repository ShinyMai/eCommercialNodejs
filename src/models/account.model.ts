"use strict";

import { ACCOUNT_ROLES } from "#/auth/roles.js";
import mongoose, { InferSchemaType, Schema } from "mongoose";

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
      enum: ["active", "inactive"],
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
