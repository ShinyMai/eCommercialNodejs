"use strict";

import { ProductFactory } from "@/services/products.service.js";
import { SuccessResponse } from "@/core/success.response.js";
import { NextFunction, Request, Response } from "express";

class ProductController {
  static async createProduct(req: Request, res: Response, next: NextFunction) {
    SuccessResponse.created(res, {
      message: "Product created successfully",
      metadata: await ProductFactory.createProduct(
        req.body.product_type,
        req.body,
      ),
    });
  }
}

export default ProductController;
