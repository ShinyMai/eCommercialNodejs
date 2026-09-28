"use strict";

import { Types } from "mongoose";
import { Discount, DiscountModel } from "#/models/discount.model.js";
import { BadRequestError, ConflictRequestError, NotFoundError } from "#/core/error.response.js";
import { updateNestedObject, validateObjectId } from "#/common/utils/index.js";
import { ProductModel } from "#/models/products.model.js";

class DiscountService {
  static async createDiscountCode(discount: Discount) {
    const now = new Date();
    const startDate = new Date(discount.discount_start_date);
    const endDate = new Date(discount.discount_end_date);
    const shopId = validateObjectId(String(discount.discount_shopId), "discount_shopId");

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      throw new BadRequestError("Discount start and end dates must be valid");
    }

    if (startDate < now) {
      throw new BadRequestError("Discount start date must be after the current date");
    }

    if (endDate <= startDate) {
      throw new BadRequestError("Discount end date must be after the start date");
    }

    if (
      discount.discount_applies_to === "specific_products" &&
      (!discount.discount_productIds || discount.discount_productIds.length === 0)
    ) {
      throw new BadRequestError(
        "Discount must apply to at least one product when 'discount_applies_to' is 'specific_products'",
      );
    }
    const existingDiscount = await DiscountModel.exists({
      discount_code: discount.discount_code,
      discount_shopId: shopId,
    });

    if (existingDiscount) {
      throw new ConflictRequestError("Discount code already exists for this shop");
    }

    return DiscountModel.create({
      ...discount,
      discount_start_date: startDate,
      discount_end_date: endDate,
      discount_shopId: shopId,
    });
  }

  static async updateDiscountCode(discountId: string, discount: Partial<Discount> & Pick<Discount, "discount_shopId">) {
    const now = new Date();
    const discountObjectId = validateObjectId(discountId, "discountId");
    const shopId = validateObjectId(String(discount.discount_shopId), "discount_shopId");
    const existingDiscount = await DiscountModel.findOne({
      _id: discountObjectId,
      discount_shopId: shopId,
      is_deleted: false,
    })
      .select("discount_start_date discount_end_date")
      .lean();

    if (!existingDiscount) {
      throw new NotFoundError("Discount code does not exist for this shop");
    }

    const startDate = discount.discount_start_date
      ? new Date(discount.discount_start_date)
      : existingDiscount.discount_start_date;
    const endDate = discount.discount_end_date
      ? new Date(discount.discount_end_date)
      : existingDiscount.discount_end_date;

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      throw new BadRequestError("Discount start and end dates must be valid");
    }

    if (discount.discount_start_date && startDate < now) {
      throw new BadRequestError("Discount start date must be after the current date");
    }

    if (endDate <= startDate) {
      throw new BadRequestError("Discount end date must be after the start date");
    }

    if (
      discount.discount_applies_to === "specific_products" &&
      (!discount.discount_productIds || discount.discount_productIds.length === 0)
    ) {
      throw new BadRequestError(
        "Discount must apply to at least one product when 'discount_applies_to' is 'specific_products'",
      );
    }

    const updateData: Record<string, unknown> = { ...discount };
    // discount_shopId identifies the owner in the query and must never be updated.
    delete updateData.discount_shopId;
    if (discount.discount_start_date) {
      updateData.discount_start_date = startDate;
    }
    if (discount.discount_end_date) {
      updateData.discount_end_date = endDate;
    }

    return DiscountModel.findOneAndUpdate(
      {
        _id: discountObjectId,
        discount_shopId: shopId,
        is_deleted: false,
      },
      {
        $set: updateNestedObject(updateData),
      },
      {
        new: true,
        runValidators: true,
      },
    ).exec();
  }

  static async getListDiscountCode({
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
    const filter: Record<string, unknown> = { is_deleted: false };

    if (productId) {
      filter.discount_productIds = validateObjectId(productId, "productId");
    }

    if (shopId) {
      filter.discount_shopId = validateObjectId(shopId, "shopId");
    }

    const skip = (page - 1) * limit;
    return DiscountModel.find(filter).sort({ createdAt: -1 }).limit(limit).skip(skip).lean().exec();
  }

  static async getDiscountAmount(
    discountId: string,
    products: {
      productId: string;
      quantity: number;
    }[],
    shopId: string,
    userId: string,
  ) {
    if (!products.length) {
      throw new BadRequestError("Products cannot be empty");
    }

    const discountObjectId = validateObjectId(discountId, "discountId");
    const shopObjectId = validateObjectId(shopId, "shopId");
    const userObjectId = validateObjectId(userId, "userId");

    products.forEach((product, index) => {
      if (!product || typeof product.productId !== "string") {
        throw new BadRequestError(`products[${index}].productId must be a string`);
      }
      validateObjectId(product.productId, `products[${index}].productId`);

      if (!Number.isInteger(product.quantity) || product.quantity <= 0) {
        throw new BadRequestError(`products[${index}].quantity must be a positive integer`);
      }
    });
    const productObjectIds = products.map((product) => new Types.ObjectId(product.productId));

    // 1. Get discount
    const discount = await DiscountModel.findOne({
      _id: discountObjectId,
      discount_shopId: shopObjectId,
      is_deleted: false,
    })
      .select({
        discount_type: 1,
        discount_value: 1,
        discount_minimum_purchase: 1,

        discount_used_count: 1,
        discount_max_uses: 1,
        discount_used_by: 1,

        discount_start_date: 1,
        discount_end_date: 1,

        discount_status: 1,

        discount_applies_to: 1,
        discount_productIds: 1,
      })
      .lean();

    if (!discount) {
      throw new NotFoundError("Discount code does not exist for this shop");
    }

    // 2. Validate discount
    const now = new Date();

    if (!discount.discount_status) {
      throw new BadRequestError("Discount code is inactive");
    }

    if (now < discount.discount_start_date) {
      throw new BadRequestError("Discount code has not started yet");
    }

    if (now > discount.discount_end_date) {
      throw new BadRequestError("Discount code has expired");
    }

    if (discount.discount_used_count >= discount.discount_max_uses) {
      throw new BadRequestError("Discount code has reached its maximum usage limit");
    }

    const hasUsedDiscount = discount.discount_used_by.some((id) => id.equals(userObjectId));

    if (hasUsedDiscount) {
      throw new BadRequestError("User has already used this discount code");
    }

    // 3. Get products
    const productsData = await ProductModel.find({
      _id: {
        $in: productObjectIds,
      },

      // Make sure all products belong to this shop
      product_shop: shopObjectId,
    })
      .select({
        _id: 1,
        product_price: 1,
      })
      .lean();

    if (productsData.length !== productObjectIds.length) {
      throw new BadRequestError("One or more products do not exist in this shop");
    }

    // 4. Map quantity
    const quantityMap = new Map(products.map((item) => [item.productId, item.quantity]));

    // 5. Calculate cart total
    const totalPrice = productsData.reduce((total, product) => {
      const quantity = quantityMap.get(product._id.toString()) ?? 0;

      return total + product.product_price * quantity;
    }, 0);

    // 6. Check minimum purchase
    if (discount.discount_minimum_purchase > 0 && totalPrice < discount.discount_minimum_purchase) {
      throw new BadRequestError(`Minimum purchase amount is ${discount.discount_minimum_purchase}`);
    }

    // 7. Determine eligible products
    let eligibleProducts = productsData;

    if (discount.discount_applies_to === "specific_products") {
      const eligibleProductIds = new Set(discount.discount_productIds.map((id) => id.toString()));

      eligibleProducts = productsData.filter((product) => eligibleProductIds.has(product._id.toString()));

      if (!eligibleProducts.length) {
        throw new BadRequestError("Discount does not apply to any selected product");
      }
    }

    // 8. Calculate price eligible for discount
    const eligibleTotalPrice = eligibleProducts.reduce((total, product) => {
      const quantity = quantityMap.get(product._id.toString()) ?? 0;

      return total + product.product_price * quantity;
    }, 0);

    // 9. Calculate discount
    let discountAmount = 0;

    switch (discount.discount_type) {
      case "percentage":
        discountAmount = (discount.discount_value / 100) * eligibleTotalPrice;
        break;

      case "fixed_amount":
        discountAmount = discount.discount_value;
        break;

      default:
        throw new BadRequestError("Invalid discount type");
    }

    // Discount cannot exceed eligible product value
    discountAmount = Math.min(discountAmount, eligibleTotalPrice);

    const finalPrice = Math.max(totalPrice - discountAmount, 0);

    return {
      totalPrice,
      eligibleTotalPrice,
      discountAmount,
      finalPrice,
    };
  }

  static async deleteDiscountCode(discountId: string, shopId: string) {
    const discountObjectId = validateObjectId(discountId, "discountId");
    const shopObjectId = validateObjectId(shopId, "shopId");

    const softDeleteResult = await DiscountModel.findOneAndUpdate(
      {
        _id: discountObjectId,
        discount_shopId: shopObjectId,
        is_deleted: false,
      },
      {
        $set: { is_deleted: true },
      },
      {
        new: true,
      },
    ).lean();

    if (!softDeleteResult) {
      throw new NotFoundError("Discount code does not exist for this shop");
    }

    return softDeleteResult;
  }

  static async cancelDiscountCode(discountId: string, shopId: string) {
    const discountObjectId = validateObjectId(discountId, "discountId");
    const shopObjectId = validateObjectId(shopId, "shopId");

    const cancelResult = await DiscountModel.findOneAndUpdate(
      {
        _id: discountObjectId,
        discount_shopId: shopObjectId,
        is_deleted: false,
      },
      {
        $set: { discount_status: false },
      },
      {
        new: true,
      },
    ).lean();

    if (!cancelResult) {
      throw new NotFoundError("Discount code does not exist for this shop");
    }

    return cancelResult;
  }
}

export default DiscountService;
