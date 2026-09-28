"use strict";

import { Types } from "mongoose";
import discountModel, { Discount } from "#/models/discount.model.js";
import { BadRequestError } from "#/core/error.response.js";
import { updateNestedObject } from "#/common/utils/index.js";

class DiscountService {
  static async createDiscountCode(discount: Discount) {
    const now = new Date();

    if (discount.discount_start_date < now) {
      throw new BadRequestError("Discount start date must be after the current date");
    }

    if (discount.discount_end_date <= discount.discount_start_date) {
      throw new BadRequestError("Discount end date must be after the start date");
    }

    const existingDiscount = await discountModel.exists({
      discount_code: discount.discount_code,
      discount_shopId: new Types.ObjectId(discount.discount_shopId),
    });

    if (existingDiscount) {
      throw new BadRequestError("Discount code already exists for this shop");
    }
    return await discountModel.create(discount);
  }

  static async updateDiscountCode(discountId: string, discount: Discount) {
    const now = new Date();

    if (discount.discount_start_date < now) {
      throw new BadRequestError("Discount start date must be after the current date");
    }

    if (discount.discount_end_date <= discount.discount_start_date) {
      throw new BadRequestError("Discount end date must be after the start date");
    }

    const existingDiscount = await discountModel.exists({
      _id: discountId,
      discount_shopId: new Types.ObjectId(discount.discount_shopId),
    });

    if (!existingDiscount) {
      throw new BadRequestError("Discount code does not exist for this shop");
    }
    return await discountModel
      .findByIdAndUpdate(
        { _id: discountId, discount_shopId: new Types.ObjectId(discount.discount_shopId) },
        { $set: updateNestedObject(discount) },
        {
          new: true,
          runValidators: true,
        },
      )
      .exec();
  }

  static async getDiscountCode({
    shopId,
    productId,
    limit,
    page,
  }: {
    shopId?: string;
    productId?: string;
    limit: number;
    page: number;
  }) {
    const filter: Record<string, Types.ObjectId> = {};

    if (productId) {
      filter.discount_productId = new Types.ObjectId(productId);
    }

    if (shopId) {
      filter.discount_shopId = new Types.ObjectId(shopId);
    }

    const skip = (page - 1) * limit;
    const discounts = await discountModel.find(filter).sort({ createdAt: -1 }).limit(limit).skip(skip).lean().exec();

    if (!discounts.length) {
      throw new BadRequestError("No discount codes found");
    }

    return discounts;
  }
}

export default DiscountService;
