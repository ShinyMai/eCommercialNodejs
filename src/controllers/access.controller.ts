"use strict";
import { NextFunction, Request, Response } from "express";
import AccessService from "@/services/access.service.js";
import { SuccessResponse } from "@/core/success.response.js";
import { createApiKey } from "@/services/apiKey.service.js";

class AccessController {
  static async shopSignup(req: Request, res: Response, next: NextFunction) {
    SuccessResponse.created(res, {
      message: "Shop created successfully",
      metadata: await AccessService.signup(req.body),
    });
  }

  static async shopLogin(req: Request, res: Response, next: NextFunction) {
    SuccessResponse.ok(res, {
      message: "Shop logged in successfully",
      metadata: await AccessService.login(req.body),
    });
  }

  static async createApiKey(req: Request, res: Response, next: NextFunction) {
    SuccessResponse.created(res, {
      message: "API key created successfully",
      metadata: await createApiKey(req.body.permissions),
    });
  }
}

export default AccessController;
