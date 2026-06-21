"use strict";

import mongoose from "mongoose";

const { Schema, model } = mongoose;
const DOCUMENT_NAME = "shop";
const COLLECTION_NAME = "shops";

const shopSchema = new Schema(
  {
    name: {
      type: String,
      trim: true,
      maxLength: 150,
    },
    email: {
      type: String,
      trim: true,
      unique: true,
    },
    password: {
      type: String,
      trim: true,
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
      type: Array,
      default: [],
    },
  },
  {
    timestamps: true,
    collection: COLLECTION_NAME,
  }
);

export default model(DOCUMENT_NAME, shopSchema);
