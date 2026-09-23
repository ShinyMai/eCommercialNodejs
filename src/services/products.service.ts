"use strict";

import {
  ClothingModel,
  ElectronicsModel,
  Product,
  ProductModel,
} from "@/models/products.model.js";
import {
  findAllDraftsForShop,
  findAllPublishedForShop,
  publicationProduct,
  searchProductByUser,
  unPublicationProduct,
} from "@/models/repositories/product.repo.js";

class ProductService {
  constructor(protected product: Product) {}

  async createProduct() {
    return ProductModel.create(this.product);
  }
}

class ClothingService extends ProductService {
  async createProduct() {
    const newClothing = await ClothingModel.create(
      this.product.product_attributes,
    );
    if (!newClothing) {
      throw new Error("Failed to create clothing product attributes");
    }

    const newProduct = await super.createProduct();
    if (!newProduct) {
      throw new Error("Failed to create product");
    }

    return newProduct;
  }
}

class ElectronicsService extends ProductService {
  async createProduct() {
    const newElectronics = await ElectronicsModel.create(
      this.product.product_attributes,
    );
    if (!newElectronics) {
      throw new Error("Failed to create electronics product attributes");
    }

    const newProduct = await super.createProduct();
    if (!newProduct) {
      throw new Error("Failed to create product");
    }

    return newProduct;
  }
}

class ProductFactory {
  static productRegistry: Record<string, typeof ProductService> = {};

  static registerProductType(type: string, classRef: typeof ProductService) {
    ProductFactory.productRegistry[type] = classRef;
  }

  //POST
  static async createProduct(
    productType: Product["product_type"],
    payload: Product,
  ) {
    const productClass = ProductFactory.productRegistry[productType];

    if (!productClass) {
      throw new Error(`Product type ${productType} is not registered.`);
    }

    return new productClass(payload).createProduct();
  }

  //PUT
  static async publicationProduct({
    product_shop,
    product_id,
  }: {
    product_shop: string;
    product_id: string[];
  }) {
    return await publicationProduct({ product_shop, product_id });
  }

  static async unPublicationProduct({
    product_shop,
    product_id,
  }: {
    product_shop: string;
    product_id: string[];
  }) {
    return await unPublicationProduct({ product_shop, product_id });
  }

  //GET
  static async findAllDraftsForShop({
    product_shop,
    limit = 50,
    skip = 0,
  }: {
    product_shop: string;
    limit: number;
    skip: number;
  }) {
    const query = { product_shop, isDraft: true };

    return await findAllDraftsForShop({ query, limit, skip });
  }

  static async findAllPublishedForShop({
    product_shop,
    limit = 50,
    skip = 0,
  }: {
    product_shop: string;
    limit: number;
    skip: number;
  }) {
    const query = { product_shop, isPublished: true };

    return await findAllPublishedForShop({ query, limit, skip });
  }

  static async searchProducts({
    keySearch,
    limit = 50,
    skip = 0,
  }: {
    keySearch: string;
    limit: number;
    skip: number;
  }) {
    return await searchProductByUser({ keySearch, limit, skip });
  }
}

// Register product types
ProductFactory.registerProductType("Clothing", ClothingService);
ProductFactory.registerProductType("Electronics", ElectronicsService);

export { ProductFactory };
