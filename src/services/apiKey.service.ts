"use strict";

import apiKeyModel from "@/models/apiKey.model.js";
import crypto from "crypto";

const findById = async (key: string) => {
  const objKey = await apiKeyModel.findOne({ key, status: true }).lean();
  return objKey;
};

const createApiKey = async (permissions: string[]) => {
  console.log("permission", permissions);
  const nrewApiKey = new apiKeyModel({
    key: crypto.randomBytes(64).toString("hex"),
    permissions,
  });
  await nrewApiKey.save();
  return nrewApiKey;
};

export { findById, createApiKey };
