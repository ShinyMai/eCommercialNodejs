"use strict";

import mongoose, { InferSchemaType, Schema } from "mongoose";

const sellerProfileSchema = new Schema(
  {
    storeName: { type: String, required: true, trim: true, maxLength: 150 },
    description: { type: String, trim: true, maxLength: 2_000, default: "" },
  },
  { _id: false },
);

const userProfileSchema = new Schema(
  {
    account: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      unique: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxLength: 150 },
    avatarUrl: { type: String, trim: true, maxLength: 2_000, default: "" },
    phone: { type: String, trim: true, maxLength: 30, default: "" },
    sellerProfile: { type: sellerProfileSchema, default: undefined },
  },
  { timestamps: true, collection: "user_profiles" },
);

export type UserProfile = InferSchemaType<typeof userProfileSchema>;
export const UserProfileModel = mongoose.model("UserProfile", userProfileSchema);
