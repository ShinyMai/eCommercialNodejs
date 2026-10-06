"use strict";

import { Types } from "mongoose";
import { DiscountModel } from "#/models/discount.model.js";
import { BadRequestError, ConflictRequestError, NotFoundError } from "#/core/error.response.js";
import { validateObjectId } from "#/common/utils/index.js";
import { ProductModel } from "#/models/products.model.js";
import type { Discount } from "#/models/discount.model.js";
import type { QueryFilter } from "mongoose";

type DiscountType = "percentage" | "fixed_amount";
type DiscountAppliesTo = "all" | "specific_products";

export interface DiscountInput {
  discount_name: string;
  discount_description: string;
  discount_type: DiscountType;
  discount_value: number;
  discount_code: string;
  discount_start_date: Date | string;
  discount_end_date: Date | string;
  discount_max_uses: number;
  discount_minimum_purchase: number;
  discount_applies_to: DiscountAppliesTo;
  discount_productIds: string[];
}

export interface DiscountCartItemInput {
  productId: string;
  quantity: number;
}

export interface CalculateDiscountInput {
  products: DiscountCartItemInput[];
  sellerId: string;
}

const DISCOUNT_FIELDS: readonly (keyof DiscountInput)[] = [
  "discount_name",
  "discount_description",
  "discount_type",
  "discount_value",
  "discount_code",
  "discount_start_date",
  "discount_end_date",
  "discount_max_uses",
  "discount_minimum_purchase",
  "discount_applies_to",
  "discount_productIds",
];

const parseDiscountInput = (
  value: DiscountInput | Partial<DiscountInput>,
  partial: boolean,
): Partial<DiscountInput> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BadRequestError("Discount payload must be an object");
  }
  const source = value;
  const result: Partial<DiscountInput> = {};
  for (const field of DISCOUNT_FIELDS) {
    if (source[field] !== undefined) Object.assign(result, { [field]: source[field] });
  }

  if (!partial) {
    const required = DISCOUNT_FIELDS.filter((field) => field !== "discount_productIds");
    if (required.some((field) => result[field] === undefined)) {
      throw new BadRequestError("Missing required discount fields");
    }
    result.discount_productIds ??= [];
  } else if (!Object.keys(result).length) {
    throw new BadRequestError("No supported discount fields to update");
  }

  for (const field of ["discount_name", "discount_description", "discount_code"] as const) {
    if (result[field] !== undefined) {
      if (typeof result[field] !== "string" || !(result[field] as string).trim()) {
        throw new BadRequestError(`${field} must be a non-empty string`);
      }
      result[field] = (result[field] as string).trim();
    }
  }
  if (typeof result.discount_code === "string") {
    result.discount_code = result.discount_code.toUpperCase();
  }
  if (result.discount_type !== undefined && !["percentage", "fixed_amount"].includes(String(result.discount_type))) {
    throw new BadRequestError("discount_type must be percentage or fixed_amount");
  }
  if (result.discount_applies_to !== undefined && !["all", "specific_products"].includes(String(result.discount_applies_to))) {
    throw new BadRequestError("discount_applies_to must be all or specific_products");
  }
  for (const field of ["discount_value", "discount_minimum_purchase"] as const) {
    if (result[field] !== undefined &&
      (typeof result[field] !== "number" || !Number.isFinite(result[field]) || (result[field] as number) < 0)) {
      throw new BadRequestError(`${field} must be a non-negative number`);
    }
  }
  if (result.discount_max_uses !== undefined &&
    (typeof result.discount_max_uses !== "number" || !Number.isInteger(result.discount_max_uses) || result.discount_max_uses <= 0)) {
    throw new BadRequestError("discount_max_uses must be a positive integer");
  }
  if (result.discount_type === "percentage" && Number(result.discount_value) > 100) {
    throw new BadRequestError("Percentage discount cannot exceed 100");
  }
  if (result.discount_productIds !== undefined) {
    if (!Array.isArray(result.discount_productIds) || result.discount_productIds.some((id) => typeof id !== "string")) {
      throw new BadRequestError("discount_productIds must be an array of IDs");
    }
    result.discount_productIds = [...new Set(result.discount_productIds as string[])];
    (result.discount_productIds as string[]).forEach((id) => validateObjectId(id, "discount_productIds"));
  }
  return result;
};

const assertProductsBelongToSeller = async (
  sellerId: Types.ObjectId,
  productIds: string[],
) => {
  if (!productIds.length) return;
  const count = await ProductModel.countDocuments({
    _id: { $in: productIds.map((id) => new Types.ObjectId(id)) },
    product_seller: sellerId,
  });
  if (count !== productIds.length) {
    throw new BadRequestError("One or more discount products do not belong to this seller");
  }
};

class DiscountService {
  static async createDiscountCode(input: DiscountInput, sellerIdInput: string) {
    const discount = parseDiscountInput(input, false) as DiscountInput;
    const now = new Date();
    const startDate = new Date(discount.discount_start_date);
    const endDate = new Date(discount.discount_end_date);
    const sellerId = validateObjectId(sellerIdInput, "discount_sellerId");

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
    await assertProductsBelongToSeller(sellerId, discount.discount_productIds);
    const existingDiscount = await DiscountModel.exists({
      discount_code: discount.discount_code,
      discount_sellerId: sellerId,
    });

    if (existingDiscount) {
      throw new ConflictRequestError("Discount code already exists for this seller");
    }

    return DiscountModel.create({
      ...discount,
      discount_start_date: startDate,
      discount_end_date: endDate,
      discount_sellerId: sellerId,
    });
  }

  static async updateDiscountCode(
    discountId: string,
    input: Partial<DiscountInput>,
    sellerIdInput: string,
  ) {
    const discount = parseDiscountInput(input, true);
    const now = new Date();
    const discountObjectId = validateObjectId(discountId, "discountId");
    const sellerId = validateObjectId(sellerIdInput, "discount_sellerId");
    const existingDiscount = await DiscountModel.findOne({
      _id: discountObjectId,
      discount_sellerId: sellerId,
      is_deleted: false,
    })
      .select(
        "discount_start_date discount_end_date discount_type discount_value " +
        "discount_applies_to discount_productIds",
      )
      .lean();

    if (!existingDiscount) {
      throw new NotFoundError("Discount code does not exist for this seller");
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

    const effectiveType = discount.discount_type ?? existingDiscount.discount_type;
    const effectiveValue = discount.discount_value ?? existingDiscount.discount_value;
    if (effectiveType === "percentage" && effectiveValue > 100) {
      throw new BadRequestError("Percentage discount cannot exceed 100");
    }
    const effectiveAppliesTo = discount.discount_applies_to ?? existingDiscount.discount_applies_to;
    const effectiveProductIds = discount.discount_productIds ??
      existingDiscount.discount_productIds.map((id) => id.toString());
    if (
      effectiveAppliesTo === "specific_products" &&
      effectiveProductIds.length === 0
    ) {
      throw new BadRequestError(
        "Discount must apply to at least one product when 'discount_applies_to' is 'specific_products'",
      );
    }
    await assertProductsBelongToSeller(sellerId, effectiveProductIds);

    const updateData: Partial<DiscountInput> = { ...discount };
    if (discount.discount_start_date) {
      updateData.discount_start_date = startDate;
    }
    if (discount.discount_end_date) {
      updateData.discount_end_date = endDate;
    }

    return DiscountModel.findOneAndUpdate(
      {
        _id: discountObjectId,
        discount_sellerId: sellerId,
        is_deleted: false,
      },
      {
        $set: updateData,
      },
      {
        new: true,
        runValidators: true,
      },
    ).exec();
  }

  static async getListDiscountCode({
    sellerId,
    productId,
    limit,
    page,
  }: {
    sellerId?: string;
    productId?: string;
    limit: number;
    page: number;
  }) {
    const now = new Date();
    const filter: QueryFilter<Discount> = {
      is_deleted: false,
      discount_status: true,
      discount_start_date: { $lte: now },
      discount_end_date: { $gte: now },
    };

    if (productId) {
      filter.discount_productIds = validateObjectId(productId, "productId");
    }

    if (sellerId) {
      filter.discount_sellerId = validateObjectId(sellerId, "sellerId");
    }

    const skip = (page - 1) * limit;
    return DiscountModel.find(filter).sort({ createdAt: -1 }).limit(limit).skip(skip).lean().exec();
  }

  static async getDiscountAmount(
    discountId: string,
    products: DiscountCartItemInput[],
    sellerId: string,
    buyerAccountId: string,
    session?: import("mongoose").ClientSession,
  ) {
    if (!products.length) {
      throw new BadRequestError("Products cannot be empty");
    }

    const discountObjectId = validateObjectId(discountId, "discountId");
    const sellerObjectId = validateObjectId(sellerId, "sellerId");
    const buyerAccountObjectId = validateObjectId(buyerAccountId, "buyerAccountId");

    products.forEach((product, index) => {
      if (!product || typeof product.productId !== "string") {
        throw new BadRequestError(`products[${index}].productId must be a string`);
      }
      validateObjectId(product.productId, `products[${index}].productId`);

      if (!Number.isInteger(product.quantity) || product.quantity <= 0) {
        throw new BadRequestError(`products[${index}].quantity must be a positive integer`);
      }
    });
    if (new Set(products.map((product) => product.productId)).size !== products.length) {
      throw new BadRequestError("Products must not contain duplicate productId values");
    }
    const productObjectIds = products.map((product) => new Types.ObjectId(product.productId));

    // 1. Get discount
    const discountQuery = DiscountModel.findOne({
      _id: discountObjectId,
      discount_sellerId: sellerObjectId,
      is_deleted: false,
    });
    if (session) discountQuery.session(session);
    const discount = await discountQuery.select({
        discount_type: 1,
        discount_value: 1,
        discount_minimum_purchase: 1,

        discount_used_count: 1,
        discount_max_uses: 1,
        discount_used_by_accounts: 1,

        discount_start_date: 1,
        discount_end_date: 1,

        discount_status: 1,

        discount_applies_to: 1,
        discount_productIds: 1,
      })
      .lean();

    if (!discount) {
      throw new NotFoundError("Discount code does not exist for this seller");
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

    const hasUsedDiscount = discount.discount_used_by_accounts.some((id) =>
      id.equals(buyerAccountObjectId),
    );

    if (hasUsedDiscount) {
      throw new BadRequestError("User has already used this discount code");
    }

    // 3. Get products
    const productsQuery = ProductModel.find({
      _id: {
        $in: productObjectIds,
      },

      // Make sure all products belong to this seller.
      product_seller: sellerObjectId,
    });
    if (session) productsQuery.session(session);
    const productsData = await productsQuery.select({
        _id: 1,
        product_price: 1,
      })
      .lean();

    if (productsData.length !== productObjectIds.length) {
      throw new BadRequestError("One or more products do not exist for this seller");
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

  static async deleteDiscountCode(discountId: string, sellerId: string) {
    const discountObjectId = validateObjectId(discountId, "discountId");
    const sellerObjectId = validateObjectId(sellerId, "sellerId");

    const softDeleteResult = await DiscountModel.findOneAndUpdate(
      {
        _id: discountObjectId,
        discount_sellerId: sellerObjectId,
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
      throw new NotFoundError("Discount code does not exist for this seller");
    }

    return softDeleteResult;
  }

  static async cancelDiscountCode(discountId: string, sellerId: string) {
    const discountObjectId = validateObjectId(discountId, "discountId");
    const sellerObjectId = validateObjectId(sellerId, "sellerId");

    const cancelResult = await DiscountModel.findOneAndUpdate(
      {
        _id: discountObjectId,
        discount_sellerId: sellerObjectId,
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
      throw new NotFoundError("Discount code does not exist for this seller");
    }

    return cancelResult;
  }
}

export default DiscountService;
