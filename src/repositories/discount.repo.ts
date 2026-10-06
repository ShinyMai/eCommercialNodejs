import type { ClientSession, QueryFilter, Types } from "mongoose";
import { DiscountModel, type Discount } from "#/models/discount.model.js";
import { withSession } from "#/utils/mongo.js";

/** Fields needed to check whether a discount can be applied and to price it. */
const APPLICABLE_DISCOUNT_FIELDS =
  "discount_type discount_value discount_minimum_purchase discount_used_count discount_max_uses " +
  "discount_used_by_accounts discount_start_date discount_end_date discount_status " +
  "discount_applies_to discount_productIds";

/** Fields needed to re-validate cross-field rules on update. */
const RULE_FIELDS =
  "discount_start_date discount_end_date discount_type discount_value discount_applies_to discount_productIds";

export const sellerDiscountFilter = (discountId: Types.ObjectId, sellerId: Types.ObjectId) => ({
  _id: discountId,
  discount_sellerId: sellerId,
  is_deleted: false,
});

type SellerDiscountFilter = ReturnType<typeof sellerDiscountFilter>;

const discountCodeExists = (code: string, sellerId: Types.ObjectId) =>
  DiscountModel.exists({ discount_code: code, discount_sellerId: sellerId });

const createDiscount = (payload: Partial<Discount>) => DiscountModel.create(payload);

const findDiscountRules = (filter: SellerDiscountFilter) => DiscountModel.findOne(filter).select(RULE_FIELDS).lean();

const findApplicableDiscount = (filter: SellerDiscountFilter, session?: ClientSession) =>
  withSession(DiscountModel.findOne(filter), session).select(APPLICABLE_DISCOUNT_FIELDS).lean();

const findDiscounts = (filter: QueryFilter<Discount>, { skip, limit }: { skip: number; limit: number }) =>
  DiscountModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean().exec();

/** Updates a seller-owned discount; `runValidators` is enabled for user-supplied changes. */
const updateSellerDiscount = (
  filter: SellerDiscountFilter,
  update: Partial<Discount> | Record<string, unknown>,
  { runValidators = false } = {},
) => DiscountModel.findOneAndUpdate(filter, { $set: update }, { new: true, runValidators });

export {
  discountCodeExists,
  createDiscount,
  findDiscountRules,
  findApplicableDiscount,
  findDiscounts,
  updateSellerDiscount,
};
