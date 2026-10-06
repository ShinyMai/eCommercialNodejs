import { Types } from "mongoose";
import { BadRequestError, NotFoundError } from "#/core/error.response.js";
import { ProductModel } from "#/models/product.model.js";
import { insertInventory, setInventoryStock } from "#/repositories/inventory.repo.js";
import {
  findProducts,
  findPublishedProductById,
  findSellerProductType,
  setProductsPublication,
} from "#/repositories/product.repo.js";
import {
  parseCreateProductInput,
  parseUpdateProductInput,
  type CreateProductInput,
  type SellerProductStatus,
} from "#/validators/product.validator.js";

const PUBLIC_LIST_FIELDS = ["product_name", "product_price", "product_thumbnail", "product_slug", "product_seller"];

const SELLER_STATUS_FILTERS: Record<SellerProductStatus, object> = {
  all: {},
  published: { isPublished: true },
  draft: { isDraft: true },
};

const assertObjectIds = (message: string, ...ids: string[]) => {
  if (ids.some((id) => !Types.ObjectId.isValid(id))) throw new BadRequestError(message);
};

class ProductService {
  static async createProduct(input: CreateProductInput, sellerId: string) {
    assertObjectIds("Invalid seller ID", sellerId);
    const payload = parseCreateProductInput(input);
    const product = await ProductModel.create({ ...payload, product_seller: sellerId });

    try {
      await insertInventory({
        inven_productId: product._id,
        inven_location: "default",
        inven_stock: payload.product_quantity,
        inven_sellerId: new Types.ObjectId(sellerId),
      });
      return product;
    } catch (error) {
      // Compensate: a product without inventory must not be left behind.
      await ProductModel.deleteOne({ _id: product._id }).catch(() => undefined);
      throw error;
    }
  }

  static async updateProduct(productId: string, sellerId: string, input: Partial<CreateProductInput>) {
    assertObjectIds("Invalid seller or product ID", productId, sellerId);
    const existing = await findSellerProductType(productId, sellerId);
    if (!existing) throw new NotFoundError("Product not found");

    const update = parseUpdateProductInput(input, existing.product_type);
    const product = await ProductModel.findOneAndUpdate(
      { _id: productId, product_seller: sellerId },
      { $set: update },
      { new: true, runValidators: true },
    ).exec();
    if (!product) throw new NotFoundError("Product not found");

    if (typeof update.product_quantity === "number") {
      await setInventoryStock(productId, sellerId, update.product_quantity);
    }
    return product;
  }

  static async setPublication({
    sellerId,
    productIds,
    isPublished,
  }: {
    sellerId: string;
    productIds: string[];
    isPublished: boolean;
  }) {
    if (!productIds.length) throw new BadRequestError("Invalid seller or product ID");
    assertObjectIds("Invalid seller or product ID", sellerId, ...productIds);

    const result = await setProductsPublication({ sellerId, productIds: [...new Set(productIds)], isPublished });
    if (result.matchedCount === 0) throw new NotFoundError("No matching products found for this seller");
    return result;
  }

  static listSellerProducts({
    sellerId,
    status,
    limit,
    skip,
  }: {
    sellerId: string;
    status: SellerProductStatus;
    limit: number;
    skip: number;
  }) {
    assertObjectIds("Invalid seller ID", sellerId);
    return findProducts({
      filter: { product_seller: new Types.ObjectId(sellerId), ...SELLER_STATUS_FILTERS[status] },
      limit,
      skip,
    });
  }

  static listPublishedProducts({
    search,
    limit,
    skip,
    sort = "newest",
  }: {
    search?: string;
    limit: number;
    skip: number;
    sort?: "newest" | "oldest";
  }) {
    return findProducts({ filter: { isPublished: true }, search, limit, skip, sort, select: PUBLIC_LIST_FIELDS });
  }

  static async getPublishedProduct(productId: string) {
    const product = await findPublishedProductById(productId);
    if (!product) throw new NotFoundError("Product not found");
    return product;
  }
}

export { ProductService };
