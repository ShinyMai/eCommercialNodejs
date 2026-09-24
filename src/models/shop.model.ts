"use strict";

import mongoose from "mongoose";

const { Schema, model } = mongoose;
const DOCUMENT_NAME = "Shop";
const COLLECTION_NAME = "shops";

const shopSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxLength: 150,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
      trim: true,
      select: false,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "inactive",
    },
    verified: {
      type: Schema.Types.Boolean,
      default: false,
    },
    role: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
    collection: COLLECTION_NAME,
  },
);

export default model(DOCUMENT_NAME, shopSchema);
