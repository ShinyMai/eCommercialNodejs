import config from "#/configs/index.js";
import { AccountModel } from "#/models/account.model.js";
import { AuthSessionModel } from "#/models/authSession.model.js";
import { DiscountModel } from "#/models/discount.model.js";
import { InventoryModel } from "#/models/inventory.model.js";
import { ProductModel } from "#/models/product.model.js";
import { UserProfileModel } from "#/models/userProfile.model.js";
import bcrypt from "bcrypt";
import mongoose, { Types } from "mongoose";
import type { RuntimeValue } from "#/types/value.types.js";

const DAY_MS = 24 * 60 * 60 * 1_000;
export const DEFAULT_TEST_PASSWORD = "ChangeMe123!";

const objectId = (value: string) => new Types.ObjectId(value);

export const fixtureIds = {
  accounts: {
    admin: objectId("66f100000000000000000001"),
    techSeller: objectId("66f100000000000000000002"),
    fashionSeller: objectId("66f100000000000000000003"),
    buyer: objectId("66f100000000000000000004"),
  },
  profiles: {
    admin: objectId("66f200000000000000000001"),
    techSeller: objectId("66f200000000000000000002"),
    fashionSeller: objectId("66f200000000000000000003"),
    buyer: objectId("66f200000000000000000004"),
  },
  products: {
    phone: objectId("66f300000000000000000001"),
    headphones: objectId("66f300000000000000000002"),
    laptopDraft: objectId("66f300000000000000000003"),
    tshirt: objectId("66f300000000000000000004"),
    jacketDraft: objectId("66f300000000000000000005"),
  },
  inventories: {
    phone: objectId("66f400000000000000000001"),
    headphones: objectId("66f400000000000000000002"),
    laptopDraft: objectId("66f400000000000000000003"),
    tshirt: objectId("66f400000000000000000004"),
    jacketDraft: objectId("66f400000000000000000005"),
  },
  discounts: {
    percentageAll: objectId("66f500000000000000000001"),
    fixedProducts: objectId("66f500000000000000000002"),
    inactive: objectId("66f500000000000000000003"),
    future: objectId("66f500000000000000000004"),
    expired: objectId("66f500000000000000000005"),
    exhausted: objectId("66f500000000000000000006"),
    alreadyUsed: objectId("66f500000000000000000007"),
    fashion: objectId("66f500000000000000000008"),
  },
} as const;

const assertDevelopmentEnvironment = () => {
  if (config.isProduction) {
    throw new Error("Default test data cannot be seeded in production");
  }
};

const getPassword = () => {
  const password = process.env.SEED_DEFAULT_PASSWORD?.trim() || DEFAULT_TEST_PASSWORD;
  const byteLength = Buffer.byteLength(password, "utf8");
  if (byteLength < 12 || byteLength > 72) {
    throw new Error("SEED_DEFAULT_PASSWORD must contain between 12 and 72 UTF-8 bytes");
  }
  return password;
};

export const seedDefaultData = async () => {
  assertDevelopmentEnvironment();
  const database = mongoose.connection.db;
  if (!database) throw new Error("MongoDB connection is unavailable");

  const now = new Date();
  const nowMs = now.getTime();
  const password = getPassword();
  const passwordHash = await bcrypt.hash(password, config.auth.bcryptSaltRounds);

  const accounts = [
    {
      _id: fixtureIds.accounts.admin,
      email: "admin@example.com",
      password: passwordHash,
      role: "admin",
      status: "active",
      verified: true,
    },
    {
      _id: fixtureIds.accounts.techSeller,
      email: "seller@example.com",
      password: passwordHash,
      role: "seller",
      status: "active",
      verified: true,
    },
    {
      _id: fixtureIds.accounts.fashionSeller,
      email: "seller2@example.com",
      password: passwordHash,
      role: "seller",
      status: "active",
      verified: true,
    },
    {
      _id: fixtureIds.accounts.buyer,
      email: "buyer@example.com",
      password: passwordHash,
      role: "buyer",
      status: "active",
      verified: true,
    },
  ] as const;

  const profiles = [
    {
      _id: fixtureIds.profiles.admin,
      account: fixtureIds.accounts.admin,
      name: "System Admin",
      avatarUrl: "",
      phone: "+84 900 000 001",
    },
    {
      _id: fixtureIds.profiles.techSeller,
      account: fixtureIds.accounts.techSeller,
      name: "Tech Seller",
      avatarUrl: "",
      phone: "+84 900 000 002",
      sellerProfile: {
        storeName: "Tech Store",
        description: "Điện thoại, laptop và phụ kiện công nghệ.",
      },
    },
    {
      _id: fixtureIds.profiles.fashionSeller,
      account: fixtureIds.accounts.fashionSeller,
      name: "Fashion Seller",
      avatarUrl: "",
      phone: "+84 900 000 003",
      sellerProfile: {
        storeName: "Everyday Fashion",
        description: "Thời trang cơ bản cho nhu cầu hằng ngày.",
      },
    },
    {
      _id: fixtureIds.profiles.buyer,
      account: fixtureIds.accounts.buyer,
      name: "Test Buyer",
      avatarUrl: "",
      phone: "+84 900 000 004",
    },
  ] as const;

  const products = [
    {
      _id: fixtureIds.products.phone,
      product_name: "Smartphone Pro 256GB",
      product_thumbnail: "https://placehold.co/800x800?text=Smartphone",
      product_description: "Điện thoại mẫu dùng để kiểm thử luồng mua hàng.",
      product_slug: "smartphone-pro-256gb",
      product_price: 18_990_000,
      product_quantity: 30,
      product_type: "Electronics",
      product_seller: fixtureIds.accounts.techSeller,
      product_attributes: { brand: "DemoTech", storage: "256GB", color: "Black" },
      product_ratingAverage: 4.6,
      product_variations: [],
      isDraft: false,
      isPublished: true,
    },
    {
      _id: fixtureIds.products.headphones,
      product_name: "Wireless Headphones",
      product_thumbnail: "https://placehold.co/800x800?text=Headphones",
      product_description: "Tai nghe không dây mẫu với chống ồn chủ động.",
      product_slug: "wireless-headphones",
      product_price: 2_490_000,
      product_quantity: 80,
      product_type: "Electronics",
      product_seller: fixtureIds.accounts.techSeller,
      product_attributes: { brand: "DemoSound", connectivity: "Bluetooth 5.3" },
      product_ratingAverage: 4.4,
      product_variations: [],
      isDraft: false,
      isPublished: true,
    },
    {
      _id: fixtureIds.products.laptopDraft,
      product_name: "Creator Laptop Draft",
      product_thumbnail: "https://placehold.co/800x800?text=Laptop",
      product_description: "Sản phẩm draft dùng để kiểm thử màn hình quản lý seller.",
      product_slug: "creator-laptop-draft",
      product_price: 32_990_000,
      product_quantity: 12,
      product_type: "Electronics",
      product_seller: fixtureIds.accounts.techSeller,
      product_attributes: { brand: "DemoTech", ram: "32GB", storage: "1TB" },
      product_ratingAverage: 4.2,
      product_variations: [],
      isDraft: true,
      isPublished: false,
    },
    {
      _id: fixtureIds.products.tshirt,
      product_name: "Essential Cotton T-Shirt",
      product_thumbnail: "https://placehold.co/800x800?text=T-Shirt",
      product_description: "Áo thun cotton mẫu cho seller thời trang.",
      product_slug: "essential-cotton-t-shirt",
      product_price: 299_000,
      product_quantity: 150,
      product_type: "Clothing",
      product_seller: fixtureIds.accounts.fashionSeller,
      product_attributes: { material: "Cotton", sizes: ["S", "M", "L", "XL"] },
      product_ratingAverage: 4.5,
      product_variations: [],
      isDraft: false,
      isPublished: true,
    },
    {
      _id: fixtureIds.products.jacketDraft,
      product_name: "Lightweight Jacket Draft",
      product_thumbnail: "https://placehold.co/800x800?text=Jacket",
      product_description: "Áo khoác draft dùng để kiểm thử publish sản phẩm.",
      product_slug: "lightweight-jacket-draft",
      product_price: 899_000,
      product_quantity: 45,
      product_type: "Clothing",
      product_seller: fixtureIds.accounts.fashionSeller,
      product_attributes: { material: "Polyester", sizes: ["M", "L", "XL"] },
      product_ratingAverage: 4.1,
      product_variations: [],
      isDraft: true,
      isPublished: false,
    },
  ] as const;

  const inventories = [
    [fixtureIds.inventories.phone, fixtureIds.products.phone, fixtureIds.accounts.techSeller, 30],
    [fixtureIds.inventories.headphones, fixtureIds.products.headphones, fixtureIds.accounts.techSeller, 80],
    [fixtureIds.inventories.laptopDraft, fixtureIds.products.laptopDraft, fixtureIds.accounts.techSeller, 12],
    [fixtureIds.inventories.tshirt, fixtureIds.products.tshirt, fixtureIds.accounts.fashionSeller, 150],
    [fixtureIds.inventories.jacketDraft, fixtureIds.products.jacketDraft, fixtureIds.accounts.fashionSeller, 45],
  ] as const;

  const activeStart = new Date(nowMs - DAY_MS);
  const activeEnd = new Date(nowMs + 30 * DAY_MS);
  const discounts = [
    {
      _id: fixtureIds.discounts.percentageAll,
      discount_name: "Giảm 10% toàn bộ Tech Store",
      discount_description: "Mã active áp dụng cho mọi sản phẩm của Tech Store.",
      discount_type: "percentage",
      discount_value: 10,
      discount_code: "TECH10",
      discount_start_date: activeStart,
      discount_end_date: activeEnd,
      discount_max_uses: 100,
      discount_used_count: 0,
      discount_used_by_accounts: [],
      discount_minimum_purchase: 500_000,
      discount_sellerId: fixtureIds.accounts.techSeller,
      discount_productIds: [],
      discount_status: true,
      discount_applies_to: "all",
      is_deleted: false,
    },
    {
      _id: fixtureIds.discounts.fixedProducts,
      discount_name: "Giảm 500.000 sản phẩm chỉ định",
      discount_description: "Mã active dành cho điện thoại và tai nghe mẫu.",
      discount_type: "fixed_amount",
      discount_value: 500_000,
      discount_code: "TECH500K",
      discount_start_date: activeStart,
      discount_end_date: activeEnd,
      discount_max_uses: 50,
      discount_used_count: 0,
      discount_used_by_accounts: [],
      discount_minimum_purchase: 2_000_000,
      discount_sellerId: fixtureIds.accounts.techSeller,
      discount_productIds: [fixtureIds.products.phone, fixtureIds.products.headphones],
      discount_status: true,
      discount_applies_to: "specific_products",
      is_deleted: false,
    },
    {
      _id: fixtureIds.discounts.inactive,
      discount_name: "Mã đã tắt",
      discount_description: "Fixture kiểm thử discount inactive.",
      discount_type: "percentage",
      discount_value: 10,
      discount_code: "TEST_INACTIVE",
      discount_start_date: activeStart,
      discount_end_date: activeEnd,
      discount_max_uses: 100,
      discount_used_count: 0,
      discount_used_by_accounts: [],
      discount_minimum_purchase: 0,
      discount_sellerId: fixtureIds.accounts.techSeller,
      discount_productIds: [],
      discount_status: false,
      discount_applies_to: "all",
      is_deleted: false,
    },
    {
      _id: fixtureIds.discounts.future,
      discount_name: "Mã chưa bắt đầu",
      discount_description: "Fixture kiểm thử thời gian bắt đầu.",
      discount_type: "percentage",
      discount_value: 15,
      discount_code: "TEST_FUTURE",
      discount_start_date: new Date(nowMs + 7 * DAY_MS),
      discount_end_date: new Date(nowMs + 37 * DAY_MS),
      discount_max_uses: 100,
      discount_used_count: 0,
      discount_used_by_accounts: [],
      discount_minimum_purchase: 0,
      discount_sellerId: fixtureIds.accounts.techSeller,
      discount_productIds: [],
      discount_status: true,
      discount_applies_to: "all",
      is_deleted: false,
    },
    {
      _id: fixtureIds.discounts.expired,
      discount_name: "Mã đã hết hạn",
      discount_description: "Fixture kiểm thử discount hết hạn.",
      discount_type: "percentage",
      discount_value: 10,
      discount_code: "TEST_EXPIRED",
      discount_start_date: new Date(nowMs - 30 * DAY_MS),
      discount_end_date: new Date(nowMs - DAY_MS),
      discount_max_uses: 100,
      discount_used_count: 0,
      discount_used_by_accounts: [],
      discount_minimum_purchase: 0,
      discount_sellerId: fixtureIds.accounts.techSeller,
      discount_productIds: [],
      discount_status: true,
      discount_applies_to: "all",
      is_deleted: false,
    },
    {
      _id: fixtureIds.discounts.exhausted,
      discount_name: "Mã đã hết lượt",
      discount_description: "Fixture kiểm thử giới hạn lượt sử dụng.",
      discount_type: "percentage",
      discount_value: 10,
      discount_code: "TEST_EXHAUSTED",
      discount_start_date: activeStart,
      discount_end_date: activeEnd,
      discount_max_uses: 2,
      discount_used_count: 2,
      discount_used_by_accounts: [],
      discount_minimum_purchase: 0,
      discount_sellerId: fixtureIds.accounts.techSeller,
      discount_productIds: [],
      discount_status: true,
      discount_applies_to: "all",
      is_deleted: false,
    },
    {
      _id: fixtureIds.discounts.alreadyUsed,
      discount_name: "Mã buyer đã dùng",
      discount_description: "Fixture kiểm thử mỗi buyer chỉ dùng mã một lần.",
      discount_type: "percentage",
      discount_value: 10,
      discount_code: "TEST_ALREADY_USED",
      discount_start_date: activeStart,
      discount_end_date: activeEnd,
      discount_max_uses: 100,
      discount_used_count: 1,
      discount_used_by_accounts: [fixtureIds.accounts.buyer],
      discount_minimum_purchase: 0,
      discount_sellerId: fixtureIds.accounts.techSeller,
      discount_productIds: [],
      discount_status: true,
      discount_applies_to: "all",
      is_deleted: false,
    },
    {
      _id: fixtureIds.discounts.fashion,
      discount_name: "Giảm 15% Everyday Fashion",
      discount_description: "Mã active của seller thời trang.",
      discount_type: "percentage",
      discount_value: 15,
      discount_code: "FASHION15",
      discount_start_date: activeStart,
      discount_end_date: activeEnd,
      discount_max_uses: 100,
      discount_used_count: 0,
      discount_used_by_accounts: [],
      discount_minimum_purchase: 300_000,
      discount_sellerId: fixtureIds.accounts.fashionSeller,
      discount_productIds: [],
      discount_status: true,
      discount_applies_to: "all",
      is_deleted: false,
    },
  ] as const;

  const upsert = (
    collectionName: string,
    fixtures: ReadonlyArray<Record<string, RuntimeValue> & { _id: Types.ObjectId }>,
  ) =>
    database.collection(collectionName).bulkWrite(
      fixtures.map(({ _id, ...fields }) => ({
        updateOne: {
          filter: { _id },
          update: {
            $set: { ...fields, updatedAt: now },
            $setOnInsert: { _id, createdAt: now },
          },
          upsert: true,
        },
      })),
    );

  await upsert("accounts", accounts);
  await upsert("user_profiles", profiles);
  await upsert("products", products);
  await upsert(
    "inventories",
    inventories.map(([id, productId, sellerId, stock]) => ({
      _id: id,
      inven_productId: productId,
      inven_location: "default-warehouse",
      inven_stock: stock,
      inven_sellerId: sellerId,
      inven_reservations: [],
    })),
  );
  await upsert("discounts", discounts);

  await Promise.all([
    AccountModel.createIndexes(),
    UserProfileModel.createIndexes(),
    AuthSessionModel.createIndexes(),
    ProductModel.createIndexes(),
    InventoryModel.createIndexes(),
    DiscountModel.createIndexes(),
  ]);

  return {
    database: database.databaseName,
    counts: {
      accounts: accounts.length,
      userProfiles: profiles.length,
      products: products.length,
      inventories: inventories.length,
      discounts: discounts.length,
      authSessions: 0,
    },
    credentials: {
      password: process.env.SEED_DEFAULT_PASSWORD ? "<SEED_DEFAULT_PASSWORD>" : password,
      accounts: accounts.map(({ _id, email, role }) => ({ _id, email, role })),
    },
  };
};
