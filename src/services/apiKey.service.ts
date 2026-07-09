"use strict";

import apiKeyModel from "@/models/apiKey.model.js";

const findById = async (key: string) => {
  const objKey = await apiKeyModel.findOne({ key, status: true }).lean();
  return objKey;
};

const createApiKey = async (key: string, permission: string[]) => {
  const nrewApiKey = new apiKeyModel({ key, permission });
  await nrewApiKey.save();
  return nrewApiKey;
};

export { findById };
