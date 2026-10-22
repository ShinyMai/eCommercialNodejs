import assert from "node:assert/strict";
import { test } from "node:test";
import { Types } from "mongoose";
import { BroadcastNotificationModel } from "#/models/broadcastNotification.model.js";
import { NotificationModel } from "#/models/notification.model.js";
import { BroadcastReadModel, NotificationStateModel } from "#/models/notificationState.model.js";
import NotificationService, { BROADCAST_CHANNEL, personalChannel } from "#/services/notification.service.js";
import { pubSub } from "#/services/redisPubSub.service.js";
import { newId, queryOf } from "../../helpers/fixtures.js";

const accountId = newId();
const buyer = { accountId, role: "buyer" as const };
const at = (minute: number) => new Date(Date.UTC(2026, 9, 1, 0, minute));

const personal = (minute: number, read = false) => ({
  _id: new Types.ObjectId(),
  noti_type: "order_placed",
  noti_title: `personal ${minute}`,
  noti_content: "",
  noti_data: {},
  noti_read_at: read ? at(minute) : null,
  createdAt: at(minute),
});
const broadcast = (minute: number) => ({
  _id: new Types.ObjectId(),
  noti_type: "promotion",
  noti_title: `broadcast ${minute}`,
  noti_content: "",
  noti_data: {},
  publish_at: at(minute),
});

test("push stores the rendered notification and streams it on the recipient's channel", async (t) => {
  const create = t.mock.method(NotificationModel, "create", async ([payload]: [object]) => [
    { ...payload, toObject: () => ({ ...payload, _id: new Types.ObjectId(), createdAt: at(0) }) },
  ]);
  const publish = t.mock.method(pubSub, "publish", async () => 1);

  await NotificationService.push({ type: "order_cancelled", to: accountId, data: { orderId: "A1" } });

  const [stored] = create.mock.calls[0].arguments[0] as [Record<string, unknown>];
  assert.equal(stored.noti_content, "Your order A1 has been cancelled.");
  assert.equal(stored.noti_sender, null);
  assert.equal(publish.mock.calls[0].arguments[0], personalChannel(accountId));
});

test("push still succeeds when realtime delivery fails", async (t) => {
  t.mock.method(NotificationModel, "create", async ([payload]: [object]) => [
    { ...payload, toObject: () => ({ ...payload, _id: new Types.ObjectId(), createdAt: at(0) }) },
  ]);
  t.mock.method(pubSub, "publish", async () => {
    throw new Error("redis down");
  });

  const notification = await NotificationService.push({ type: "order_placed", to: accountId });
  assert.equal((notification as unknown as { noti_title: string }).noti_title, "Order placed");
});

test("inbox merges both sources by time and marks broadcasts read by seen mark or receipt", async (t) => {
  const seenBroadcast = broadcast(10);
  const receiptBroadcast = broadcast(30);
  const unreadBroadcast = broadcast(50);
  t.mock.method(NotificationModel, "find", () => queryOf([personal(40), personal(20, true)]));
  t.mock.method(BroadcastNotificationModel, "find", () => queryOf([unreadBroadcast, receiptBroadcast, seenBroadcast]));
  t.mock.method(NotificationStateModel, "findOne", () => queryOf({ broadcast_seen_at: at(15) }));
  const reads = t.mock.method(BroadcastReadModel, "find", () => queryOf([{ broadcast: receiptBroadcast._id }]));

  const { items, next_cursor } = await NotificationService.getInbox(buyer, { limit: 4 });

  assert.deepEqual(
    items.map(({ title, is_read }) => [title, is_read]),
    [
      ["broadcast 50", false],
      ["personal 40", false],
      ["broadcast 30", true],
      ["personal 20", true],
    ],
  );
  assert.equal(next_cursor, at(20).toISOString());
  // Broadcasts already covered by the seen mark need no receipt lookup.
  const lookedUp = (reads.mock.calls[0].arguments[0] as any).broadcast.$in.map(String);
  assert.deepEqual(lookedUp.sort(), [unreadBroadcast._id, receiptBroadcast._id].map(String).sort());
});

test("a short last page has no next cursor", async (t) => {
  t.mock.method(NotificationModel, "find", () => queryOf([personal(5)]));
  t.mock.method(BroadcastNotificationModel, "find", () => queryOf([]));
  t.mock.method(NotificationStateModel, "findOne", () => queryOf(null));
  t.mock.method(BroadcastReadModel, "find", () => queryOf([]));

  const { items, next_cursor } = await NotificationService.getInbox(buyer, { limit: 20 });
  assert.equal(items.length, 1);
  assert.equal(next_cursor, null);
});

test("unread count adds unread personal notifications to unseen broadcasts without a receipt", async (t) => {
  const ids = [new Types.ObjectId(), new Types.ObjectId(), new Types.ObjectId()];
  t.mock.method(NotificationStateModel, "findOne", () => queryOf({ broadcast_seen_at: at(0) }));
  t.mock.method(NotificationModel, "countDocuments", () => queryOf(4));
  t.mock.method(BroadcastNotificationModel, "find", () => queryOf(ids.map((_id) => ({ _id }))));
  t.mock.method(BroadcastReadModel, "find", () => queryOf([{ broadcast: ids[0] }]));

  assert.deepEqual(await NotificationService.getUnreadCount(buyer), { total: 6, personal: 4, broadcast: 2 });
});

test("mark read falls back to a visible broadcast and 404s for anything else", async (t) => {
  t.mock.method(NotificationModel, "updateOne", async () => ({ modifiedCount: 0 }));
  t.mock.method(NotificationModel, "exists", async () => null);
  const findBroadcast = t.mock.method(BroadcastNotificationModel, "findOne", () => queryOf(broadcast(1)));
  const receipt = t.mock.method(BroadcastReadModel, "updateOne", async () => ({ upsertedCount: 1 }));

  const id = newId();
  assert.deepEqual(await NotificationService.markRead(buyer, id), { id, source: "broadcast" });
  assert.equal(receipt.mock.callCount(), 1);

  findBroadcast.mock.mockImplementation((() => queryOf(null)) as any);
  await assert.rejects(NotificationService.markRead(buyer, newId()), { name: "NotFoundError" });
});

test("mark read on an already-read personal notification still succeeds", async (t) => {
  t.mock.method(NotificationModel, "updateOne", async () => ({ modifiedCount: 0 }));
  t.mock.method(NotificationModel, "exists", async () => ({ _id: newId() }));

  const id = newId();
  assert.deepEqual(await NotificationService.markRead(buyer, id), { id, source: "personal" });
});

test("a broadcast published now signals clients; a scheduled one does not", async (t) => {
  const publish = t.mock.method(pubSub, "publish", async () => 1);
  t.mock.method(BroadcastNotificationModel, "create", async (payload: object) => ({ ...payload, _id: newId() }));
  const body = { noti_type: "promotion", noti_title: "Sale", noti_content: "50% off", noti_audience: ["seller"] };

  await NotificationService.createBroadcast(body, newId());
  assert.equal(publish.mock.calls[0].arguments[0], BROADCAST_CHANNEL);
  assert.deepEqual((publish.mock.calls[0].arguments[1] as any).audience, ["seller"]);

  await NotificationService.createBroadcast({ ...body, publish_at: "2999-01-01T00:00:00Z" }, newId());
  assert.equal(publish.mock.callCount(), 1);
});

test("stream subscription forwards broadcasts only to the targeted roles", async (t) => {
  const handlers = new Map<string, (message: string) => void>();
  t.mock.method(pubSub, "subscribe", async (channel: string, handler: (message: string) => void) => {
    handlers.set(channel, handler);
    return async () => {};
  });
  const sent: unknown[][] = [];

  await NotificationService.subscribe(buyer, (event, data) => sent.push([event, data]));
  handlers.get(BROADCAST_CHANNEL)!(JSON.stringify({ id: "1", audience: ["seller"] }));
  handlers.get(BROADCAST_CHANNEL)!(JSON.stringify({ id: "2", audience: [] }));
  handlers.get(personalChannel(accountId))!(JSON.stringify({ id: "3" }));

  assert.deepEqual(sent, [
    ["broadcast", { id: "2", audience: [] }],
    ["notification", { id: "3" }],
  ]);
});
