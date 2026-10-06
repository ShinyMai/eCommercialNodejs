import { Types, type ClientSession, type QueryFilter } from "mongoose";
import { BadRequestError, ConflictRequestError, NotFoundError } from "#/core/error.response.js";
import type { Discount } from "#/models/discount.model.js";
import {
  createDiscount,
  discountCodeExists,
  findApplicableDiscount,
  findDiscountRules,
  findDiscounts,
  sellerDiscountFilter,
  updateSellerDiscount,
} from "#/repositories/discount.repo.js";
import { countSellerProducts, findSellerProductPrices } from "#/repositories/product.repo.js";
import { sum, validateObjectId } from "#/utils/index.js";
import {
  parseDiscountInput,
  validateDiscountCartItems,
  validateDiscountRules,
  type DiscountCartItemInput,
  type DiscountInput,
} from "#/validators/discount.validator.js";

export type { CalculateDiscountInput, DiscountInput } from "#/validators/discount.validator.js";

type PricedProduct = { _id: Types.ObjectId; product_price: number };
type ApplicableDiscount = Pick<
  Discount,
  | "discount_type"
  | "discount_value"
  | "discount_minimum_purchase"
  | "discount_used_count"
  | "discount_max_uses"
  | "discount_used_by_accounts"
  | "discount_start_date"
  | "discount_end_date"
  | "discount_status"
  | "discount_applies_to"
  | "discount_productIds"
>;

const NOT_FOUND_MESSAGE = "Discount code does not exist for this seller";

const assertProductsBelongToSeller = async (sellerId: Types.ObjectId, productIds: string[]) => {
  if (!productIds.length) return;
  if ((await countSellerProducts(productIds, sellerId)) !== productIds.length) {
    throw new BadRequestError("One or more discount products do not belong to this seller");
  }
};

const assertDiscountUsable = (discount: ApplicableDiscount, buyerId: Types.ObjectId, now = new Date()) => {
  if (!discount.discount_status) throw new BadRequestError("Discount code is inactive");
  if (now < discount.discount_start_date) throw new BadRequestError("Discount code has not started yet");
  if (now > discount.discount_end_date) throw new BadRequestError("Discount code has expired");
  if (discount.discount_used_count >= discount.discount_max_uses) {
    throw new BadRequestError("Discount code has reached its maximum usage limit");
  }
  if (discount.discount_used_by_accounts.some((id) => id.equals(buyerId))) {
    throw new BadRequestError("User has already used this discount code");
  }
};

/** Pure pricing logic: the discount never exceeds the value of the eligible products. */
const calculateDiscount = (
  discount: ApplicableDiscount,
  products: PricedProduct[],
  quantityByProductId: Map<string, number>,
) => {
  const lineTotal = (product: PricedProduct) =>
    product.product_price * (quantityByProductId.get(product._id.toString()) ?? 0);
  const totalPrice = sum(products, lineTotal);

  if (discount.discount_minimum_purchase > 0 && totalPrice < discount.discount_minimum_purchase) {
    throw new BadRequestError(`Minimum purchase amount is ${discount.discount_minimum_purchase}`);
  }

  let eligibleProducts = products;
  if (discount.discount_applies_to === "specific_products") {
    const eligibleIds = new Set(discount.discount_productIds.map((id) => id.toString()));
    eligibleProducts = products.filter((product) => eligibleIds.has(product._id.toString()));
    if (!eligibleProducts.length) throw new BadRequestError("Discount does not apply to any selected product");
  }
  const eligibleTotalPrice = sum(eligibleProducts, lineTotal);

  let rawDiscount: number;
  switch (discount.discount_type) {
    case "percentage":
      rawDiscount = (discount.discount_value / 100) * eligibleTotalPrice;
      break;
    case "fixed_amount":
      rawDiscount = discount.discount_value;
      break;
    default:
      throw new BadRequestError("Invalid discount type");
  }

  const discountAmount = Math.min(rawDiscount, eligibleTotalPrice);
  return {
    totalPrice,
    eligibleTotalPrice,
    discountAmount,
    finalPrice: Math.max(totalPrice - discountAmount, 0),
  };
};

class DiscountService {
  static async createDiscountCode(input: DiscountInput, sellerIdInput: string) {
    const discount = parseDiscountInput(input, false) as DiscountInput;
    const sellerId = validateObjectId(sellerIdInput, "discount_sellerId");
    const startDate = new Date(discount.discount_start_date);
    const endDate = new Date(discount.discount_end_date);

    validateDiscountRules({
      startDate,
      endDate,
      startDateChanged: true,
      type: discount.discount_type,
      value: discount.discount_value,
      appliesTo: discount.discount_applies_to,
      productIds: discount.discount_productIds,
    });
    await assertProductsBelongToSeller(sellerId, discount.discount_productIds);

    if (await discountCodeExists(discount.discount_code, sellerId)) {
      throw new ConflictRequestError("Discount code already exists for this seller");
    }

    return createDiscount({
      ...discount,
      discount_productIds: discount.discount_productIds.map((id) => new Types.ObjectId(id)),
      discount_start_date: startDate,
      discount_end_date: endDate,
      discount_sellerId: sellerId,
    });
  }

  static async updateDiscountCode(discountId: string, input: Partial<DiscountInput>, sellerIdInput: string) {
    const changes = parseDiscountInput(input, true);
    const filter = sellerDiscountFilter(
      validateObjectId(discountId, "discountId"),
      validateObjectId(sellerIdInput, "discount_sellerId"),
    );

    const existing = await findDiscountRules(filter);
    if (!existing) throw new NotFoundError(NOT_FOUND_MESSAGE);

    const startDate = changes.discount_start_date
      ? new Date(changes.discount_start_date)
      : existing.discount_start_date;
    const endDate = changes.discount_end_date ? new Date(changes.discount_end_date) : existing.discount_end_date;
    const productIds = changes.discount_productIds ?? existing.discount_productIds.map((id) => id.toString());

    validateDiscountRules({
      startDate,
      endDate,
      startDateChanged: Boolean(changes.discount_start_date),
      type: changes.discount_type ?? existing.discount_type,
      value: changes.discount_value ?? existing.discount_value,
      appliesTo: changes.discount_applies_to ?? existing.discount_applies_to,
      productIds,
    });
    await assertProductsBelongToSeller(filter.discount_sellerId, productIds);

    const update: Partial<DiscountInput> = { ...changes };
    if (changes.discount_start_date) update.discount_start_date = startDate;
    if (changes.discount_end_date) update.discount_end_date = endDate;

    return updateSellerDiscount(filter, update, { runValidators: true }).exec();
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
    if (productId) filter.discount_productIds = validateObjectId(productId, "productId");
    if (sellerId) filter.discount_sellerId = validateObjectId(sellerId, "sellerId");

    return findDiscounts(filter, { skip: (page - 1) * limit, limit });
  }

  static async getDiscountAmount(
    discountId: string,
    products: DiscountCartItemInput[],
    sellerId: string,
    buyerAccountId: string,
    session?: ClientSession,
  ) {
    validateDiscountCartItems(products);
    const discountObjectId = validateObjectId(discountId, "discountId");
    const sellerObjectId = validateObjectId(sellerId, "sellerId");
    const buyerObjectId = validateObjectId(buyerAccountId, "buyerAccountId");

    const discount = await findApplicableDiscount(sellerDiscountFilter(discountObjectId, sellerObjectId), session);
    if (!discount) throw new NotFoundError(NOT_FOUND_MESSAGE);
    assertDiscountUsable(discount, buyerObjectId);

    // Every product must exist and belong to the discount's seller.
    const pricedProducts = await findSellerProductPrices(
      products.map((product) => new Types.ObjectId(product.productId)),
      sellerObjectId,
      session,
    );
    if (pricedProducts.length !== products.length) {
      throw new BadRequestError("One or more products do not exist for this seller");
    }

    const quantityByProductId = new Map(products.map((item) => [item.productId, item.quantity]));
    return calculateDiscount(discount, pricedProducts, quantityByProductId);
  }

  static deleteDiscountCode(discountId: string, sellerId: string) {
    return DiscountService.updateSellerDiscount(discountId, sellerId, { is_deleted: true });
  }

  static cancelDiscountCode(discountId: string, sellerId: string) {
    return DiscountService.updateSellerDiscount(discountId, sellerId, { discount_status: false });
  }

  private static async updateSellerDiscount(discountId: string, sellerId: string, update: Partial<Discount>) {
    const filter = sellerDiscountFilter(
      validateObjectId(discountId, "discountId"),
      validateObjectId(sellerId, "sellerId"),
    );
    const discount = await updateSellerDiscount(filter, update).lean();
    if (!discount) throw new NotFoundError(NOT_FOUND_MESSAGE);
    return discount;
  }
}

export default DiscountService;
