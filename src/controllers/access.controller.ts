"use strict";
import { NextFunction, Request, Response } from "express";
import AccessService from "@/services/access.service.js";

class AccessController {
  async shopSignup(req: Request, res: Response, next: NextFunction) {
    return res.status(201).json(await AccessService.signup(req.body));
  }
}

export default new AccessController();
