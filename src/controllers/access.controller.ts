"use strict";
import { NextFunction, Request, Response } from "express";
import AccessService from "@/services/access.service.js";

class AccessController {
  async shopSignup(req: Request, res: Response, next: NextFunction) {
    try {
      console.log("shopSignup", req.body);
      return res.status(201).json(await AccessService.signup(req.body));
    } catch (e) {
      next(e);
    }
  }
}

export default new AccessController();
