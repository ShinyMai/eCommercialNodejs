"use strict";

import { findById } from "@/services/apiKey.service.js";
import { NextFunction, Request, Response } from "express";
import { ForbiddenError } from "@/core/error.response.js";
import log from "@/helpers/logger.js";
import { HEADER } from "@/common/constants/header.js";

interface RequestWithObjKey extends Request {
  objKey?: {
    key: string;
    status: boolean;
    permissions: string[];
  };
}

const apiKey = async (
  req: RequestWithObjKey,
  res: Response,
  next: NextFunction,
) => {
  try {
    const key = req.headers[HEADER.API_KEY]?.toString();
    if (!key) {
      throw new ForbiddenError("Missing x-api-key header");
    }

    //check objKey
    const objKey = await findById(key);
    if (!objKey) {
      throw new ForbiddenError("Invalid API key");
    }

    req.objKey = objKey;
    next();
  } catch (error) {
    next(error);
  }
};

const checkPermission = (permissions: string) => {
  return (req: RequestWithObjKey, res: Response, next: NextFunction) => {
    if (!req.objKey?.permissions) {
      return next(new ForbiddenError("Permission denied"));
    }

    const validPermission = req.objKey.permissions.includes(permissions);
    if (!validPermission) {
      log.warn("Permission denied", {
        required: permissions,
        has: req.objKey.permissions,
      });
      return next(new ForbiddenError("Permission denied"));
    }
    return next();
  };
};

export { apiKey, checkPermission };
