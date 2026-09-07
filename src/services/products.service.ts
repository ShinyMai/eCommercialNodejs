"use strict";

import {
  ClothingModel,
  ElectronicsModel,
  Product,
  ProductModel,
} from "@/models/products.model.js";

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
}

// Register product types
ProductFactory.registerProductType("Clothing", ClothingService);
ProductFactory.registerProductType("Electronics", ElectronicsService);

export { ProductFactory };
