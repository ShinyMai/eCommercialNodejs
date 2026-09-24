"use strict";

import apiKeyModel from "#/models/apiKey.model.js";
import crypto from "crypto";
import log from "#/helpers/logger.js";
import { BadRequestError } from "#/core/error.response.js";

const ALLOWED_PERMISSIONS = ["READ", "WRITE", "DELETE"] as const;
type ApiPermission = (typeof ALLOWED_PERMISSIONS)[number];

const findById = async (key: string) => {
  const objKey = await apiKeyModel.findOne({ key, status: true }).lean();
  return objKey;
};

const createApiKey = async (permissions: string[]) => {
  if (
    !Array.isArray(permissions) ||
    permissions.length === 0 ||
    permissions.some(
      (permission) => !ALLOWED_PERMISSIONS.includes(permission as ApiPermission),
    )
  ) {
    throw new BadRequestError(
      `permissions must contain: ${ALLOWED_PERMISSIONS.join(", ")}`,
    );
  }

  const newApiKey = new apiKeyModel({
    key: crypto.randomBytes(64).toString("hex"),
    permissions: [...new Set(permissions)],
  });
  await newApiKey.save();
  log.info("API key created", { permissions });
  return newApiKey;
};

export { findById, createApiKey };
