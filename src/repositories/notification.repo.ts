import type { ClientSession, Types } from "mongoose";
import type { AccountRole } from "#/auth/roles.js";
import { BroadcastNotificationModel } from "#/models/broadcastNotification.model.js";
import { NotificationModel } from "#/models/notification.model.js";
import { BroadcastReadModel, NotificationStateModel } from "#/models/notificationState.model.js";
import type { BroadcastPayload, PushPayload } from "#/validators/notification.validator.js";

/* ---------- personal (push) ---------- */

const insertNotification = async (payload: PushPayload, session?: ClientSession) => {
  const [notification] = await NotificationModel.create([payload], { session });
  return notification;
};

/** One recipient's notifications created strictly before `before`, newest first. */
const findNotifications = (accountId: string, before: Date, limit: number) =>
  NotificationModel.find({ noti_to: accountId, createdAt: { $lt: before } })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean()
    .exec();

const countUnreadNotifications = (accountId: string) =>
  NotificationModel.countDocuments({ noti_to: accountId, noti_read_at: null }).exec();

/** False when the notification does not exist or belongs to someone else; marking twice keeps the first read time. */
const markNotificationRead = async (accountId: string, notificationId: string, readAt: Date) => {
  const filter = { _id: notificationId, noti_to: accountId };
  const { modifiedCount } = await NotificationModel.updateOne(
    { ...filter, noti_read_at: null },
    { $set: { noti_read_at: readAt } },
  );
  return modifiedCount > 0 || Boolean(await NotificationModel.exists(filter));
};

const markAllNotificationsRead = async (accountId: string, readAt: Date) => {
  const { modifiedCount } = await NotificationModel.updateMany(
    { noti_to: accountId, noti_read_at: null },
    { $set: { noti_read_at: readAt } },
  );
  return modifiedCount;
};

/* ---------- broadcast (pull) ---------- */

/** Published, not expired, and addressed to every role or to this one. */
const visibleBroadcastFilter = (role: AccountRole, now: Date) => ({
  publish_at: { $lte: now },
  $and: [
    { $or: [{ expire_at: null }, { expire_at: { $gt: now } }] },
    { $or: [{ noti_audience: { $size: 0 } }, { noti_audience: role }] },
  ],
});

const insertBroadcast = (payload: BroadcastPayload & { noti_sender: string }) =>
  BroadcastNotificationModel.create(payload);

const findBroadcasts = (role: AccountRole, before: Date, limit: number, now = new Date()) =>
  BroadcastNotificationModel.find({
    ...visibleBroadcastFilter(role, now),
    publish_at: { $lte: now, $lt: before },
  })
    .sort({ publish_at: -1 })
    .limit(limit)
    .lean()
    .exec();

const findVisibleBroadcast = (role: AccountRole, broadcastId: string, now = new Date()) =>
  BroadcastNotificationModel.findOne({ _id: broadcastId, ...visibleBroadcastFilter(role, now) })
    .lean()
    .exec();

/** Broadcasts are few, so ids published after the seen mark are fetched and capped instead of joined. */
const MAX_UNSEEN_BROADCASTS = 500;
const findUnseenBroadcastIds = async (role: AccountRole, seenAt: Date | null, now = new Date()) => {
  const filter = visibleBroadcastFilter(role, now);
  const docs = await BroadcastNotificationModel.find(
    seenAt ? { ...filter, publish_at: { $lte: now, $gt: seenAt } } : filter,
  )
    .select("_id")
    .limit(MAX_UNSEEN_BROADCASTS)
    .lean()
    .exec();
  return docs.map((doc) => doc._id);
};

/* ---------- broadcast read state ---------- */

const findBroadcastSeenAt = async (accountId: string): Promise<Date | null> => {
  const state = await NotificationStateModel.findOne({ account: accountId }).select("broadcast_seen_at").lean().exec();
  return state?.broadcast_seen_at ?? null;
};

const setBroadcastSeenAt = (accountId: string, seenAt: Date) =>
  NotificationStateModel.updateOne({ account: accountId }, { $set: { broadcast_seen_at: seenAt } }, { upsert: true });

const findReadBroadcastIds = async (accountId: string, broadcastIds: Types.ObjectId[]) => {
  if (!broadcastIds.length) return new Set<string>();
  const reads = await BroadcastReadModel.find({ account: accountId, broadcast: { $in: broadcastIds } })
    .select("broadcast")
    .lean()
    .exec();
  return new Set(reads.map((read) => String(read.broadcast)));
};

const markBroadcastRead = (accountId: string, broadcastId: string) =>
  BroadcastReadModel.updateOne(
    { account: accountId, broadcast: broadcastId },
    { $setOnInsert: { account: accountId, broadcast: broadcastId } },
    { upsert: true },
  );

export {
  insertNotification,
  findNotifications,
  countUnreadNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  insertBroadcast,
  findBroadcasts,
  findVisibleBroadcast,
  findUnseenBroadcastIds,
  findBroadcastSeenAt,
  setBroadcastSeenAt,
  findReadBroadcastIds,
  markBroadcastRead,
};
