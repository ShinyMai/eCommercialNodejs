# Inventory reservation lifecycle

`reviewCheckout` only previews prices and availability. At order/payment creation,
validate the authenticated cart owner and product/seller selection, then call:

```ts
import {
  reserveInventory,
  confirmReservationInventory,
  cancelReservationInventory,
} from "#/services/inventoryReservation.service.js";

const input = {
  productId: "<product ID>",
  sellerId: "<seller ID>",
  cartId: "<cart ID>",
  reservationId: "<24-character ID generated once for this checkout attempt>",
  quantity: 2,
};

await reserveInventory(input);
// Save these identities with the order/payment. Reuse them on network retries.
// Confirm only from verified payment/order processing:
await confirmReservationInventory(input);
// On payment failure or cancellation, instead:
await cancelReservationInventory(input);
```

All IDs are strings. A reservation ID is scoped to a product/seller inventory;
the same checkout-attempt ID can be used for its different products. Reusing
an ID with a different cart or quantity is rejected. A cancelled/expired ID
cannot reserve again; a genuinely new attempt needs a new ID.

Stock is decremented together with an active reservation in one MongoDB update.
Retries return the existing reservation and do not extend its lifetime.
Confirmation changes its state without changing stock. Cancellation and expiry
change active to a terminal state and restore stock in the same update. Retain
terminal records to protect idempotency; deleting them allows old retries to
reserve again. Plan archival and an idempotency retention policy before removing
records or allowing very large histories in one inventory document.

New reservations expire after 15 minutes. The server runs cleanup at startup
and every 30 seconds, processing at most 100 inventory documents per pass.
Expiration is persisted in MongoDB, so restart or Redis key expiry does not lose
it. Redis lock TTL is separately 3 seconds; its expiry does not restore stock.
The worker uses conditional atomic updates and can run on multiple servers.
After downtime, expired stock is restored when cleanup resumes. Confirmation
rejects expired holds even before cleanup runs.

The Redis service only acquires/releases locks. The reservation service holds a
product-wide lock around the MongoDB reserve operation and releases in finally.
MongoDB stock and reservation-ID predicates remain the protection against
overselling/duplicate writes when Redis leases expire.

Order creation/lookup/cancellation routes now exist; see docs/orders-api.md. Payment integration is still pending. This service is an internal integration point,
not an unauthenticated HTTP endpoint. For multi-product orders, the future order
flow must cancel successful holds if another product fails, or use a MongoDB
transaction for all-or-nothing reservation and confirmation. Do not treat a
partially confirmed group as a successful payment completion.

Older entries containing only quantity/cartId/reservedAt are preserved. They
have no reliable reservation ID or expiry and are not automatically refunded;
reconcile them explicitly before migrating historical reservations.

Avoid calling setInventoryStock to overwrite available stock while holds exist
without reconciling the held quantities. Inventory stock represents currently
available stock after reservations.

Verification: unit tests use a stateful MongoDB-command stub and mocked Redis.
Run `node --conditions=development --import tsx --test tests/inventoryReservation.test.ts tests/redis.test.ts`.
A real MongoDB/Redis concurrency integration test is still needed before release.


