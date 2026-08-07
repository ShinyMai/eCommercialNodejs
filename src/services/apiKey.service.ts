"use strict";

import apiKeyModel from "@/models/apiKey.model.js";
import crypto from "crypto";
import log from "@/helpers/logger.js";

const findById = async (key: string) => {
  const objKey = await apiKeyModel.findOne({ key, status: true }).lean();
  return objKey;
};

const createApiKey = async (permissions: string[]) => {
  const newApiKey = new apiKeyModel({
    key: crypto.randomBytes(64).toString("hex"),
    permissions,
  });
  await newApiKey.save();
  log.info("API key created", { permissions });
  return newApiKey;
};

export { findById, createApiKey };
