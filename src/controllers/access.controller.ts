"use strict";
import { NextFunction, Request, Response } from "express";
import AccessService from "@/services/access.service.js";
import { Created } from "@/core/success.response.js";
import { createApiKey } from "@/services/apiKey.service.js";

class AccessController {
  async shopSignup(req: Request, res: Response, next: NextFunction) {
    new Created({
      message: "Shop created successfully",
      metadata: await AccessService.signup(req.body),
    }).send(res);
  }

  async createApiKey(req: Request, res: Response, next: NextFunction) {
    new Created({
      message: "API key created successfully",
      metadata: await createApiKey(req.body.permissions),
    }).send(res);
  }
}

export default new AccessController();
