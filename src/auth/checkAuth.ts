"use strict";

import { findById } from "@/services/apiKey.service.js";
import { NextFunction, Request, Response } from "express";

const HEADER = {
  API_KEY: "x-api-key",
  AUTHORIZATION: "authorization",
};

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
      return res.status(403).json({ message: "Forbidden" });
    }

    //check objKey
    const objKey = await findById(key);
    if (!objKey) {
      return res.status(403).json({ message: "Forbidden" });
    }

    req.objKey = objKey;
    next();
  } catch (error) {
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

const checkPermission = (permissions: string) => {
  return (req: RequestWithObjKey, res: Response, next: NextFunction) => {
    if (!req.objKey?.permissions) {
      return res.status(403).json({ message: "Permission denied" });
    }

    console.log("permissions", req.objKey.permissions);
    const validPermission = req.objKey.permissions.includes(permissions);
    if (!validPermission) {
      return res.status(403).json({ message: "Permission denied" });
    }
    return next();
  };
};

const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

export { apiKey, checkPermission, asyncHandler };
