"use strict";

import { ProductFactory } from "@/services/products.service.js";
import { SuccessResponse } from "@/core/success.response.js";
import { Request, Response } from "express";
import {HEADER} from "@/common/constants/header.js";

class ProductController {
  static async createProduct(req: Request, res: Response) {
    SuccessResponse.created(res, {
      message: "Product created successfully",
      metadata: await ProductFactory.createProduct(
        req.body.product_type,
        req.body,
      ),
    });
  }

  static async publishProduct(req: Request, res: Response) {
    SuccessResponse.created(res, {
      message: "Product published successfully",
      metadata: await ProductFactory.publicationProduct({
        product_shop: req.header(HEADER.CLIENT_ID) as string,
        product_id: req.body.product_id
      }),
    });
  }

  static async unPublishProduct(req: Request, res: Response) {
    SuccessResponse.created(res, {
      message: "Product unpublished successfully",
      metadata: await ProductFactory.unPublicationProduct({
        product_shop: req.header(HEADER.CLIENT_ID) as string,
        product_id: req.body.product_id
      }),
    });
  }

  static async findAllDraftsForShop(req: Request, res: Response) {
    const { limit, skip } = req.query;
    const product_shop = req.header(HEADER.CLIENT_ID) as string;

    const drafts = await ProductFactory.findAllDraftsForShop({
      product_shop,
      limit: Number(limit) || 10,
      skip: Number(skip) || 0,
    });

    SuccessResponse.ok(res, {
      message: "Draft products retrieved successfully",
      metadata: drafts,
    });
  }

  static async findAllPublishedForShop(req: Request, res: Response) {
    const { limit, skip } = req.query;
    const product_shop = req.header(HEADER.CLIENT_ID) as string;

    const drafts = await ProductFactory.findAllPublishedForShop({
      product_shop,
      limit: Number(limit) || 10,
      skip: Number(skip) || 0,
    });

    SuccessResponse.ok(res, {
      message: "Published products retrieved successfully",
      metadata: drafts,
    });
  }
}

export default ProductController;
