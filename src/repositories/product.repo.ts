import type { ClientSession, QueryFilter, SortOrder } from "mongoose";
import { Types } from "mongoose";
import { BadRequestError } from "#/core/error.response.js";
import { ProductModel, type Product } from "#/models/product.model.js";
import { getSelectData } from "#/utils/index.js";
import { withSession } from "#/utils/mongo.js";

export interface FindProductsParams {
  filter?: QueryFilter<Product>;
  search?: string;
  limit: number;
  skip: number;
  sort?: "newest" | "oldest";
  select?: string[];
}

const sellerPopulation = {
  path: "product_seller",
  select: "role",
  populate: { path: "profile", select: "name sellerProfile.storeName" },
};

const findProducts = ({ filter = {}, search, limit, skip, sort = "newest", select }: FindProductsParams) => {
  const query = search ? { ...filter, $text: { $search: search } } : filter;
  const sortBy: Record<string, SortOrder | { $meta: "textScore" }> = search
    ? { score: { $meta: "textScore" } }
    : { createdAt: sort === "newest" ? -1 : 1 };
  const projection = search ? { score: { $meta: "textScore" } } : undefined;

  return ProductModel.find(query, projection)
    .populate(sellerPopulation)
    .sort(sortBy)
    .skip(skip)
    .limit(limit)
    .select(getSelectData(select))
    .lean()
    .exec();
};

const findPublishedProductById = (productId: string) => {
  if (!Types.ObjectId.isValid(productId)) throw new BadRequestError("Invalid product ID");

  return ProductModel.findOne({ _id: productId, isPublished: true }).populate(sellerPopulation).lean().exec();
};

const findSellerProductType = (productId: string, sellerId: string) =>
  ProductModel.findOne({ _id: productId, product_seller: sellerId }).select("product_type").lean().exec();

const countPurchasableProducts = (productIds: string[], session?: ClientSession) =>
  withSession(ProductModel.countDocuments({ _id: { $in: productIds }, isDraft: false, isPublished: true }), session).exec();

/** Includes the hidden publication flags needed to check purchasability. */
const findProductAvailability = (productId: Types.ObjectId) =>
  ProductModel.findById(productId).select("product_seller +isDraft +isPublished").lean().exec();

const findProductPrices = (productIds: Types.ObjectId[]) =>
  ProductModel.find({ _id: { $in: productIds } }).select("_id product_price").lean().exec();

/** Price and owner of each product, used to price a checkout. */
const findProductsForCheckout = (productIds: string[], session?: ClientSession) =>
  withSession(ProductModel.find({ _id: { $in: productIds } }), session)
    .select("product_price product_seller")
    .lean()
    .exec();

/** Only returns products owned by `sellerId`, so a short result means foreign or missing products. */
const findSellerProductPrices = (productIds: Types.ObjectId[], sellerId: Types.ObjectId, session?: ClientSession) =>
  withSession(ProductModel.find({ _id: { $in: productIds }, product_seller: sellerId }), session)
    .select("_id product_price")
    .lean();

const countSellerProducts = (productIds: string[], sellerId: Types.ObjectId) =>
  ProductModel.countDocuments({
    _id: { $in: productIds.map((id) => new Types.ObjectId(id)) },
    product_seller: sellerId,
  });

const setProductsPublication = async ({
  productIds,
  sellerId,
  isPublished,
}: {
  productIds: string[];
  sellerId: string;
  isPublished: boolean;
}) => {
  const { matchedCount, modifiedCount } = await ProductModel.updateMany(
    {
      product_seller: new Types.ObjectId(sellerId),
      _id: { $in: productIds.map((id) => new Types.ObjectId(id)) },
    },
    { $set: { isDraft: !isPublished, isPublished } },
  ).exec();

  return { matchedCount, modifiedCount };
};

export {
  findProducts,
  findPublishedProductById,
  findSellerProductType,
  countPurchasableProducts,
  findProductAvailability,
  findProductPrices,
  findProductsForCheckout,
  findSellerProductPrices,
  countSellerProducts,
  setProductsPublication,
};
