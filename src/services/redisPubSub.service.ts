import { redisClient } from "#/configs/redis.config.js";

type Handler = (message: string, channel: string) => void;

class RedisPubSubService {
  private publisher = redisClient;
  private subscriber = redisClient.duplicate();
  private ready?: Promise<unknown>;
  private handlers = new Map<string, Set<Handler>>();

  constructor() {
    this.subscriber.on("error", (err) => console.error("[redis:sub]", err));
  }

  // connect on first subscribe so importing the module never opens a socket
  private connect() {
    this.ready ??= this.subscriber.connect().catch((err) => {
      this.ready = undefined;
      throw err;
    });
    return this.ready;
  }

  // one router per channel; fans out to all handlers
  private route = (message: string, channel: string) => {
    this.handlers.get(channel)?.forEach((h) => {
      try {
        h(message, channel);
      } catch (err) {
        console.error(`[redis:sub] handler failed on ${channel}`, err);
      }
    });
  };

  publish(channel: string, message: unknown) {
    const payload = typeof message === "string" ? message : JSON.stringify(message);
    return this.publisher.publish(channel, payload);
  }

  async subscribe(channel: string, handler: Handler) {
    let set = this.handlers.get(channel);
    if (!set) {
      set = new Set();
      this.handlers.set(channel, set);
      try {
        await this.connect();
        await this.subscriber.subscribe(channel, this.route);
      } catch (err) {
        this.handlers.delete(channel);
        throw err;
      }
    }
    set.add(handler);
    return () => this.unsubscribe(channel, handler);
  }

  async unsubscribe(channel: string, handler: Handler) {
    const set = this.handlers.get(channel);
    if (!set) return;
    set.delete(handler);
    if (set.size === 0) {
      this.handlers.delete(channel);
      await this.subscriber.unsubscribe(channel);
    }
  }
}

export const pubSub = new RedisPubSubService();
