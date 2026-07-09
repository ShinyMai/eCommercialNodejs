"use strict";

import mongoose from "mongoose";

const DOCUMENT_NAME = "ApiKey";
const COLLECTION_NAME = "apiKeys";

const apiKeyShema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
    },
    status: {
      type: Boolean,
      default: true,
    },
    permissions: {
      type: [String],
      required: true,
      enum: ["READ", "WRITE", "DELETE"],
    },
  },
  {
    timestamps: true,
    collection: COLLECTION_NAME,
  },
);

export default mongoose.model(DOCUMENT_NAME, apiKeyShema);
