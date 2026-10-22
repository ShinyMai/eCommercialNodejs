"use strict";

import type { AccountRole } from "#/auth/roles.js";
import { NotFoundError } from "#/core/error.response.js";
import log from "#/helpers/logger.js";
import type { NotificationType } from "#/models/notification.model.js";
import {
  countUnreadNotifications,
  findBroadcasts,
  findBroadcastSeenAt,
  findNotifications,
  findReadBroadcastIds,
  findUnseenBroadcastIds,
  findVisibleBroadcast,
  insertBroadcast,
  insertNotification,
  markAllNotificationsRead,
  markBroadcastRead,
  markNotificationRead,
  setBroadcastSeenAt,
} from "#/repositories/notification.repo.js";
import { pubSub } from "#/services/redisPubSub.service.js";
import {
  validateCreateBroadcastPayload,
  validateInboxCursor,
  validateNotificationId,
  type NotificationData,
} from "#/validators/notification.validator.js";
import { validateIdString } from "#/utils/validation.js";

type Auth = { accountId: string; role: AccountRole };

export type InboxItem = {
  id: string;
  source: "personal" | "broadcast";
  type: string;
  title: string;
  content: string;
  data: NotificationData;
  sender: string | null;
  created_at: Date;
  is_read: boolean;
};

export type BroadcastSignal = { id: string; audience: AccountRole[] };

export type PushInput = {
  type: NotificationType;
  to: string;
  sender?: string | null;
  data?: NotificationData;
};

export const personalChannel = (accountId: string) => `noti:account:${accountId}`;
export const BROADCAST_CHANNEL = "noti:broadcast";

const text = (value: unknown, fallback: string) => (typeof value === "string" && value ? value : fallback);
const order = (data: NotificationData) => (typeof data.orderId === "string" ? `order ${data.orderId}` : "order");

/** Title and body per personal type; `data` carries the ids and names the message refers to. */
const TEMPLATES: Record<NotificationType, (data: NotificationData) => { title: string; content: string }> = {
  order_placed: (data) => ({
    title: "Order placed",
    content: `Your ${order(data)} has been placed and is awaiting payment.`,
  }),
  order_cancelled: (data) => ({
    title: "Order cancelled",
    content: `Your ${order(data)} has been cancelled.`,
  }),
  order_expired: (data) => ({
    title: "Order expired",
    content: `Your ${order(data)} expired before payment and its items were released.`,
  }),
  shop_new_order: (data) => ({
    title: "New order",
    content: `Your shop received a new ${order(data)}.`,
  }),
  comment_reply: (data) => ({
    title: "New reply",
    content: `${text(data.senderName, "Someone")} replied to your comment.`,
  }),
  product_back_in_stock: (data) => ({
    title: "Back in stock",
    content: `${text(data.productName, "A product you follow")} is back in stock.`,
  }),
  promotion: (data) => ({
    title: text(data.title, "New promotion"),
    content: text(data.content, "A shop you follow has a new promotion."),
  }),
};

const toPersonalItem = (doc: {
  _id: unknown;
  noti_type: string;
  noti_title: string;
  noti_content: string;
  noti_data?: unknown;
  noti_sender?: unknown;
  noti_read_at?: Date | null;
  createdAt: Date;
}): InboxItem => ({
  id: String(doc._id),
  source: "personal",
  type: doc.noti_type,
  title: doc.noti_title,
  content: doc.noti_content,
  data: (doc.noti_data ?? {}) as NotificationData,
  sender: doc.noti_sender ? String(doc.noti_sender) : null,
  created_at: doc.createdAt,
  is_read: Boolean(doc.noti_read_at),
});

const toBroadcastItem = (
  doc: { _id: unknown; noti_type: string; noti_title: string; noti_content: string; noti_data?: unknown; publish_at: Date },
  isRead: boolean,
): InboxItem => ({
  id: String(doc._id),
  source: "broadcast",
  type: doc.noti_type,
  title: doc.noti_title,
  content: doc.noti_content,
  data: (doc.noti_data ?? {}) as NotificationData,
  sender: null,
  created_at: doc.publish_at,
  is_read: isRead,
});

/** Realtime delivery is best effort: the inbox in Mongo stays the source of truth. */
const publishSafely = async (channel: string, message: unknown) => {
  try {
    await pubSub.publish(channel, message);
  } catch (error) {
    log.error(`Notification publish on ${channel}`, error);
  }
};

class NotificationService {
  /** Push: stores one notification for `to` and streams it to that account's open connections. */
  static async push({ type, to, sender = null, data = {} }: PushInput) {
    const { title, content } = TEMPLATES[type](data);
    const notification = await insertNotification({
      noti_type: type,
      noti_to: validateIdString(to, "noti_to"),
      noti_sender: sender && validateIdString(sender, "noti_sender"),
      noti_title: title,
      noti_content: content,
      noti_data: data,
    });
    await publishSafely(personalChannel(to), toPersonalItem(notification.toObject()));
    return notification;
  }

  /**
   * Best-effort fan-out for business flows: call it after the transaction commits.
   * A failed notification is logged and never fails the order or comment that caused it.
   */
  static async notify(inputs: PushInput[]) {
    const results = await Promise.allSettled(inputs.map((input) => NotificationService.push(input)));
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        const { type, to } = inputs[index];
        log.error("Notification push", result.reason, { type, to });
      }
    });
  }

  /** Pull: stores one broadcast for everyone; clients only get a signal to refetch. */
  static async createBroadcast(value: unknown, adminId: string) {
    const payload = validateCreateBroadcastPayload(value);
    const broadcast = await insertBroadcast({ ...payload, noti_sender: adminId });
    // Scheduled broadcasts show up when clients next fetch the inbox after publish_at.
    if (payload.publish_at <= new Date()) {
      const signal: BroadcastSignal = { id: String(broadcast._id), audience: payload.noti_audience };
      await publishSafely(BROADCAST_CHANNEL, signal);
    }
    return broadcast;
  }

  /**
   * Merges personal notifications and visible broadcasts by time. Each source contributes at most `limit`
   * items older than the cursor, so the merged page is exact; `next_cursor` is the oldest returned time.
   */
  static async getInbox(auth: Auth, query: { cursor?: unknown; limit: number }) {
    const before = validateInboxCursor(query.cursor);
    const [personal, broadcasts, seenAt] = await Promise.all([
      findNotifications(auth.accountId, before, query.limit),
      findBroadcasts(auth.role, before, query.limit),
      findBroadcastSeenAt(auth.accountId),
    ]);
    const readIds = await findReadBroadcastIds(
      auth.accountId,
      broadcasts.filter((b) => !seenAt || b.publish_at > seenAt).map((b) => b._id),
    );

    const items = [
      ...personal.map(toPersonalItem),
      ...broadcasts.map((b) =>
        toBroadcastItem(b, Boolean(seenAt && b.publish_at <= seenAt) || readIds.has(String(b._id))),
      ),
    ]
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
      .slice(0, query.limit);

    const last = items[items.length - 1];
    return { items, next_cursor: items.length === query.limit && last ? last.created_at.toISOString() : null };
  }

  static async getUnreadCount(auth: Auth) {
    const seenAt = await findBroadcastSeenAt(auth.accountId);
    const [personal, unseenIds] = await Promise.all([
      countUnreadNotifications(auth.accountId),
      findUnseenBroadcastIds(auth.role, seenAt),
    ]);
    const readIds = await findReadBroadcastIds(auth.accountId, unseenIds);
    const broadcast = unseenIds.length - readIds.size;
    return { total: personal + broadcast, personal, broadcast };
  }

  /** The id may be a personal notification or a broadcast; personal is checked first. */
  static async markRead(auth: Auth, notificationId: string) {
    const id = validateNotificationId(notificationId);
    if (await markNotificationRead(auth.accountId, id, new Date())) return { id, source: "personal" as const };

    if (!(await findVisibleBroadcast(auth.role, id))) throw new NotFoundError("Notification not found");
    await markBroadcastRead(auth.accountId, id);
    return { id, source: "broadcast" as const };
  }

  static async markAllRead(auth: Auth) {
    const now = new Date();
    const [personal] = await Promise.all([
      markAllNotificationsRead(auth.accountId, now),
      setBroadcastSeenAt(auth.accountId, now),
    ]);
    return { personal_marked: personal, broadcast_seen_at: now };
  }

  /**
   * Subscribes one SSE connection to the account's channel and to the broadcast channel.
   * Returns an async function that removes both subscriptions.
   */
  static async subscribe(auth: Auth, send: (event: "notification" | "broadcast", data: unknown) => void) {
    const unsubscribers: Array<() => Promise<void>> = [];
    const unsubscribe = async () => {
      await Promise.all(unsubscribers.map((stop) => stop()));
    };

    try {
      unsubscribers.push(
        await pubSub.subscribe(personalChannel(auth.accountId), (message) => send("notification", JSON.parse(message))),
      );
      unsubscribers.push(
        await pubSub.subscribe(BROADCAST_CHANNEL, (message) => {
          const signal = JSON.parse(message) as BroadcastSignal;
          if (!signal.audience.length || signal.audience.includes(auth.role)) send("broadcast", signal);
        }),
      );
    } catch (error) {
      await unsubscribe();
      throw error;
    }
    return unsubscribe;
  }
}

export default NotificationService;
