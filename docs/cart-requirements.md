# Cart feature requirements

Status: Proposed requirements for implementation and review.

## Purpose and scope

Allow a signed-in customer to save products, view current prices and availability,
change quantities, remove products, and clear their cart before checkout.
The current `src/services/cart.service.ts` is a placeholder; no cart routes or
cart model exist yet. This document describes intended behavior, not shipped APIs.

Version 1 includes authenticated carts for buyer, seller, and admin accounts,
consistent with the existing role hierarchy. Guest carts, variant selection,
saved-for-later lists, checkout, orders, payments, shipping, taxes, and stored
coupon selection are outside this scope. A product ID identifies a cart line.

## Functional requirements

| ID | Requirement |
| --- | --- |
| CART-01 | Use the authenticated Account ID as the owner. Never accept cart ownership from a request body or query. Every account may access only its own cart, including admins. |
| CART-02 | Persist at most one cart per account in MongoDB. It survives logout, login, and server restarts and is shared across the account's sessions. |
| CART-03 | Return an empty cart when the account has no cart. Reading an empty cart does not need to create a database record. |
| CART-04 | Add a product with a positive integer quantity. Adding an existing product increases that line's quantity; it never creates a duplicate line. |
| CART-05 | Set an existing line to an absolute positive integer quantity. Quantity zero is invalid; removing a line uses the delete endpoint. |
| CART-06 | Remove a product or clear all products. Both operations succeed when the target is already absent, returning the resulting cart. |
| CART-07 | Before adding or setting quantity, require an existing published, non-draft product and an active seller account. Derive seller identity and price from stored data. |
| CART-08 | Validate the resulting quantity against current `Inventory.inven_stock` for that product and seller. Missing inventory makes the product unavailable. Reject the entire mutation if the result exceeds stock. |
| CART-09 | Cart actions never reserve or decrement inventory. Availability is a snapshot; checkout must revalidate stock and prices independently. |
| CART-10 | Resolve product names, thumbnails, sellers, prices, and availability on every read and successful mutation response. Client-supplied prices and totals must never influence the result. |
| CART-11 | Retain lines if a product is deleted, unpublished, loses its active seller, has missing inventory, or becomes short of stock. Mark them unavailable with a reason so the customer can remove or correct them. Never silently reduce quantities or delete lines. |
| CART-12 | Return total quantity across all saved lines, distinct line count, and subtotal across available lines only. Unavailable lines have a null payable line total and do not contribute to subtotal. An empty cart has zero counts and subtotal. |
| CART-13 | Support products from multiple sellers and return each line's seller ID so clients can group them and use the existing seller-scoped discount calculation API. Cart subtotal is before discounts. |

## Proposed API contract

Paths are relative to the configured API prefix, which defaults to `/v1/api`.
All endpoints require existing authentication and minimum role `buyer`.

| Method | Path | Request body | Success |
| --- | --- | --- | --- |
| GET | `/cart` | None | 200, current cart |
| POST | `/cart/items` | `{ "productId": "<id>", "quantity": 2 }` | 200, cart after increment |
| PATCH | `/cart/items/:productId` | `{ "quantity": 3 }` | 200, cart after setting quantity |
| DELETE | `/cart/items/:productId` | None | 200, cart after removal |
| DELETE | `/cart` | None | 200, empty cart |

Use the existing envelope: `statusCode`, `message`, `metadata.items`, `requestId`,
and `timestamp`. `metadata.items` contains one cart object:

```json
{
  "items": [
    {
      "productId": "<product id>",
      "sellerId": "<seller account id>",
      "name": "Example product",
      "thumbnail": "https://example.com/product.jpg",
      "quantity": 2,
      "unitPrice": 100,
      "lineTotal": 200,
      "availableStock": 5,
      "isAvailable": true,
      "unavailableReason": null
    }
  ],
  "distinctItemCount": 1,
  "totalQuantity": 2,
  "subtotal": 200
}
```

Unavailable reasons: `product_deleted`, `product_unpublished`,
`seller_inactive`, `inventory_missing`, or `insufficient_stock`, in that priority
order when multiple conditions apply. For deleted products, seller, name,
thumbnail, and unit price may be null; retain the product ID and quantity.
Unavailable lines always have `lineTotal: null`; unavailable stock is null when
inventory cannot be resolved. Return lines in the order first added.

## Validation and errors

- Return 400 for malformed ObjectIds, invalid body shapes, unsupported body
  fields, or quantities that are strings, fractional, zero, negative, or unsafe
  integers. Missing required fields also return 400.
- Return 401 for absent or invalid authentication; apply existing account/session
  checks and their established error behavior for blocked or inactive accounts.
- Return 404 when adding a nonexistent product or updating an absent cart line.
- Return 409 for an unavailable product, insufficient stock, or exceeding the
  proposed limit of 100 distinct lines. Existing-line increments remain allowed
  at the distinct-line limit if stock and quantity validation pass.
- Failed validation must leave the cart unchanged. Errors follow the existing
  envelope with `metadata.items: null` and matching HTTP and payload status codes.

## Data and consistency requirements

- Store an owner Account reference, product references and quantities, and
  creation/update timestamps in a `carts` collection. Enforce a unique owner index.
- Persist only identity and quantity as cart business data; calculate display
  fields and prices from current products and inventory.
- Enforce unique product lines and the line limit during concurrent writes.
  Concurrent first additions must still create exactly one cart.
- Concurrent increments must not lose quantities. Set, remove, and clear operations
  must apply atomically in database commit order; a rejected concurrent update
  must not silently report success. A conflict retry must repeat validation.
- Validate stock against the resulting quantity at mutation time. Stock can change
  afterward because a cart does not reserve inventory.
- Batch product, inventory, and seller reads rather than performing one query per
  line. Follow the existing route/controller/service/model separation and central
  error handling. Do not expose account credentials or session data.
- Monetary arithmetic must use a documented precision policy aligned with product
  prices and discount calculations. Currency and rounding policy require a project
  decision before implementation; do not assume a currency or silently round prices.

## Acceptance criteria

1. A signed-in account with no saved cart receives empty items and zero totals.
2. Adding quantity 2 and then quantity 3 for the same in-stock product produces
   one line with quantity 5. Setting quantity 1 changes it to exactly 1.
3. Invalid quantities, unavailable products, and insufficient stock return the
   specified errors without changing saved items.
4. Removing the same line twice and clearing an empty cart both succeed.
5. Different accounts receive separate carts; ownership supplied by a client is
   rejected. Seller and admin accounts can manage their own carts.
6. Saved items remain after logout/login and are visible in another session.
7. Product price changes affect the next response. Deleted, unpublished, inactive
   seller, missing inventory, and short-stock lines remain with the defined reason
   and are excluded from subtotal. Reducing a short-stock line to an available
   quantity makes it available again.
8. Multiple sellers' products coexist with correct seller identities and totals.
   Reading and mutating carts never change inventory or discount usage counters.
9. Concurrent additions create one cart and one line per product, preserve valid
   increments, and enforce stock and distinct-line limits.
10. Authenticated API tests verify the endpoint behavior and response envelope;
    meaningful database integration tests verify persistence and concurrent writes.

## Proposed defaults and decisions

Authenticated carts only, 100 distinct lines, retained unavailable products,
and no automatic expiry are proposed version 1 defaults. Confirm the currency
and monetary precision policy before implementing totals. Variant-level inventory
and guest-cart merging require separate requirements if added later.
