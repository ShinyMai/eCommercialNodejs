"use strict";

import { Types } from "mongoose";
import db from "#/dbs/init.mongodb.js";
import { DiscountModel, type Discount } from "#/models/discount.model.js";
import { ProductModel } from "#/models/products.model.js";
import ShopModel from "#/models/shop.model.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const TEST_USER_ID = new Types.ObjectId("66f0000000000000000000ff");

const fixtureIds = {
  percentageAll: new Types.ObjectId("66f000000000000000000001"),
  fixedSpecific: new Types.ObjectId("66f000000000000000000002"),
  inactive: new Types.ObjectId("66f000000000000000000003"),
  future: new Types.ObjectId("66f000000000000000000004"),
  expired: new Types.ObjectId("66f000000000000000000005"),
  exhausted: new Types.ObjectId("66f000000000000000000006"),
  alreadyUsed: new Types.ObjectId("66f000000000000000000007"),
};

const run = async () => {
  await db.connect();

  const firstProduct = await ProductModel.findOne().select("_id product_shop").lean();
  if (!firstProduct) {
    throw new Error("No products found. Create a shop and at least one product before seeding discounts.");
  }

  const shop = await ShopModel.findById(firstProduct.product_shop).select("_id name").lean();
  if (!shop) {
    throw new Error(`Product ${firstProduct._id} references a shop that does not exist.`);
  }

  const products = await ProductModel.find({ product_shop: shop._id })
    .select("_id product_name product_price")
    .sort({ createdAt: 1 })
    .limit(2)
    .lean();

  const now = Date.now();
  const activeStart = new Date(now - DAY_MS);
  const activeEnd = new Date(now + 30 * DAY_MS);
  const productIds = products.map((product) => product._id);

  type DiscountFixture = Omit<
    Discount,
    "createdAt" | "updatedAt" | "is_deleted"
  > & {
    _id: Types.ObjectId;
    is_deleted?: boolean;
  };

  const fixtures: DiscountFixture[] = [
    {
      _id: fixtureIds.percentageAll,
      discount_name: "Test 10% all products",
      discount_description: "Active happy-path fixture for all products",
      discount_type: "percentage",
      discount_value: 10,
      discount_code: "TEST_PERCENT_10",
      discount_start_date: activeStart,
      discount_end_date: activeEnd,
      discount_max_uses: 100,
      discount_used_count: 0,
      discount_used_by: [],
      discount_minimum_purchase: 100_000,
      discount_shopId: shop._id,
      discount_productIds: [],
      discount_status: true,
      discount_applies_to: "all",
    },
    {
      _id: fixtureIds.fixedSpecific,
      discount_name: "Test 50,000 specific products",
      discount_description: "Active fixture restricted to the listed products",
      discount_type: "fixed_amount",
      discount_value: 50_000,
      discount_code: "TEST_FIXED_50000",
      discount_start_date: activeStart,
      discount_end_date: activeEnd,
      discount_max_uses: 100,
      discount_used_count: 0,
      discount_used_by: [],
      discount_minimum_purchase: 0,
      discount_shopId: shop._id,
      discount_productIds: productIds,
      discount_status: true,
      discount_applies_to: "specific_products",
    },
    {
      _id: fixtureIds.inactive,
      discount_name: "Test inactive discount",
      discount_description: "Fixture for the inactive-discount validation",
      discount_type: "percentage",
      discount_value: 10,
      discount_code: "TEST_INACTIVE",
      discount_start_date: activeStart,
      discount_end_date: activeEnd,
      discount_max_uses: 100,
      discount_used_count: 0,
      discount_used_by: [],
      discount_minimum_purchase: 0,
      discount_shopId: shop._id,
      discount_productIds: [],
      discount_status: false,
      discount_applies_to: "all",
    },
    {
      _id: fixtureIds.future,
      discount_name: "Test future discount",
      discount_description: "Fixture for the not-started validation",
      discount_type: "percentage",
      discount_value: 10,
      discount_code: "TEST_FUTURE",
      discount_start_date: new Date(now + 7 * DAY_MS),
      discount_end_date: new Date(now + 37 * DAY_MS),
      discount_max_uses: 100,
      discount_used_count: 0,
      discount_used_by: [],
      discount_minimum_purchase: 0,
      discount_shopId: shop._id,
      discount_productIds: [],
      discount_status: true,
      discount_applies_to: "all",
    },
    {
      _id: fixtureIds.expired,
      discount_name: "Test expired discount",
      discount_description: "Fixture for the expired-discount validation",
      discount_type: "percentage",
      discount_value: 10,
      discount_code: "TEST_EXPIRED",
      discount_start_date: new Date(now - 30 * DAY_MS),
      discount_end_date: new Date(now - DAY_MS),
      discount_max_uses: 100,
      discount_used_count: 0,
      discount_used_by: [],
      discount_minimum_purchase: 0,
      discount_shopId: shop._id,
      discount_productIds: [],
      discount_status: true,
      discount_applies_to: "all",
    },
    {
      _id: fixtureIds.exhausted,
      discount_name: "Test exhausted discount",
      discount_description: "Fixture for the maximum-usage validation",
      discount_type: "percentage",
      discount_value: 10,
      discount_code: "TEST_EXHAUSTED",
      discount_start_date: activeStart,
      discount_end_date: activeEnd,
      discount_max_uses: 2,
      discount_used_count: 2,
      discount_used_by: [],
      discount_minimum_purchase: 0,
      discount_shopId: shop._id,
      discount_productIds: [],
      discount_status: true,
      discount_applies_to: "all",
    },
    {
      _id: fixtureIds.alreadyUsed,
      discount_name: "Test already-used discount",
      discount_description: "Fixture for the per-user usage validation",
      discount_type: "percentage",
      discount_value: 10,
      discount_code: "TEST_ALREADY_USED",
      discount_start_date: activeStart,
      discount_end_date: activeEnd,
      discount_max_uses: 100,
      discount_used_count: 1,
      discount_used_by: [TEST_USER_ID],
      discount_minimum_purchase: 0,
      discount_shopId: shop._id,
      discount_productIds: [],
      discount_status: true,
      discount_applies_to: "all",
    },
  ];

  await DiscountModel.bulkWrite(
    fixtures.map(({ _id, ...fixture }) => ({
      updateOne: {
        filter: { discount_code: fixture.discount_code, discount_shopId: shop._id },
        update: {
          $set: { ...fixture, is_deleted: fixture.is_deleted ?? false },
          $setOnInsert: { _id },
        },
        upsert: true,
      },
    })),
  );

  const seededDiscounts = await DiscountModel.find({
    discount_shopId: shop._id,
    discount_code: { $in: fixtures.map((fixture) => fixture.discount_code) },
  })
    .select("_id discount_code discount_status discount_start_date discount_end_date")
    .sort({ discount_code: 1 })
    .lean();

  console.log(
    JSON.stringify(
      {
        shop,
        products,
        testUserId: TEST_USER_ID,
        discounts: seededDiscounts,
      },
      null,
      2,
    ),
  );
};

try {
  await run();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await db.disconnect().catch(() => undefined);
}
