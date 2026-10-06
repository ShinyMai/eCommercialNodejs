# Orders API

All routes use the configured API prefix (default `/v1/api`), Bearer authentication,
and minimum role `buyer`. Ownership is always taken from `req.auth.accountId`.

- `POST /orders`: create a pending-payment order and reserve all selected products.
- `GET /orders/:orderId`: read your own order, including price/discount snapshots.
- `POST /orders/:orderId/cancel`: cancel your order and restore its held stock.

## Create request

```json
{
  "requestId": "507f1f77bcf86cd799439010",
  "cartId": "507f1f77bcf86cd799439011",
  "shop_ids": [
    {
      "shop_id": "507f1f77bcf86cd799439012",
      "items": [
        { "product_id": "507f1f77bcf86cd799439013", "quantity": 2 }
      ],
      "discount_id": "507f1f77bcf86cd799439015"
    }
  ]
}
```

Replace the IDs with real data. `requestId` is a new random 24-character hex ID
created once per checkout attempt. On retries, send the same requestId and same
checkout data. Reordered shops/items are equivalent. Different data under the
same account/requestId returns 409. A new attempt after cancellation/expiration
must use a new requestId. `discount_id` is optional. Prices and accountId are not
accepted from the customer as authoritative values.

The current contract supports selection of products/quantities from a cart via
shop_ids; it has not been changed to the proposed cart-only request contract.

## Behavior

Create returns the common response envelope with HTTP 201 and an order containing
`_id`, `accountId`, `cartId`, `requestId`, `reservationId`, `status`, `expiresAt`,
`checkout_summary` and `checkout_order`. Internal requestHash is omitted.

Published/non-draft products, active sellers, cart ownership/membership, current
prices, coupon eligibility, and inventory are checked before creation. The
customer-selected quantity is used, as in reviewCheckout. Prices and discounts
are read in the transaction and copied into the order. A unique account/requestId
index protects against duplicate orders; retries return the previous order even
if available stock has since changed.

Redis locks are acquired in product ID order and released in finally. MongoDB
transactions commit all inventory reservations and the order together. Failure
on any product or order insert aborts all holds. Cancellation also changes order
status and restores all holds in one transaction, with repeat cancellation safe.
Cart contents are retained while payment is pending.

New orders use `pending_payment`. Reservations/order expire after 15 minutes;
the existing worker restores stock and marks pending orders expired at startup
and every 30 seconds. GET reports elapsed expiration immediately, even if worker
cleanup has not finished. Terminal orders remain available for lookup/retries.

## Runtime requirements and current limits

MongoDB must run as a replica set or sharded cluster to support transactions.
Standalone MongoDB does not support this create/cancel flow. Configure an existing
replica set/Atlas connection with `MONGODB_URI`; this change does not reconfigure
the database. Redis must also be reachable through REDIS_URL.

This is order creation, lookup and cancellation; there is no payment provider
or verified payment webhook yet. The order is not marked paid. Coupon usage is
not consumed until a future verified payment flow, which must atomically check
coupon limits, confirm every reservation and update the order. Never call the
per-product confirm helper alone to complete a multi-product order.

Shipping retains the reviewCheckout placeholder of 5 per product line. Actual
shipping rates, delivery address, tax, currency/rounding policy, fulfillment and
payment integrations require separate implementation before production use.

Tests cover HTTP authentication and service behavior using stateful MongoDB
command/session stubs and mocked Redis; they do not replace a real replica-set
transaction/concurrency integration test.
