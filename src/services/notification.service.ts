import type { Api } from "@/lib/data/api";
import type { Severity } from "@/types";

export interface OutgoingNotification {
  userId: string | null;
  title: string;
  body: string;
  severity: Severity;
  actionHref?: string | null;
  dedupeKey?: string | null;
}

export type Channel = "in_app" | "email" | "push";

export interface DeliveryReport {
  channel: Channel;
  status: "delivered" | "simulated" | "skipped_duplicate" | "failed";
}

/**
 * Notification contract. In-app delivery is real (stored records). Email and
 * push are MOCKED: they are recorded with status "simulated" and the UI says
 * so — we never claim an external message was sent.
 */
export interface NotificationService {
  send(api: Api, n: OutgoingNotification, channels: Channel[]): Promise<DeliveryReport[]>;
  /** Send several notifications with a single duplicate check. */
  sendMany(api: Api, items: OutgoingNotification[], channels: Channel[]): Promise<DeliveryReport[]>;
}

export class MockNotificationService implements NotificationService {
  async send(api: Api, n: OutgoingNotification, channels: Channel[]): Promise<DeliveryReport[]> {
    return this.sendMany(api, [n], channels);
  }

  async sendMany(api: Api, items: OutgoingNotification[], channels: Channel[]): Promise<DeliveryReport[]> {
    const householdId = api.actor.householdId;
    if (!householdId || !items.length) return [];
    // One lookup for the whole batch instead of one per notification.
    const existing = items.some((n) => n.dedupeKey) ? await api.list("notifications", { includeDeleted: true }) : [];
    const seen = new Set(existing.map((e) => `${e.dedupeKey}|${e.channel}`));
    const jobs: Promise<DeliveryReport>[] = [];
    for (const n of items) {
      for (const channel of channels) {
        const key = `${n.dedupeKey}|${channel}`;
        if (n.dedupeKey && seen.has(key)) {
          jobs.push(Promise.resolve({ channel, status: "skipped_duplicate" }));
          continue;
        }
        if (n.dedupeKey) seen.add(key);
        jobs.push(this.create(api, householdId, n, channel).then(
          (status) => ({ channel, status }),
          () => ({ channel, status: "failed" as const }),
        ));
      }
    }
    return Promise.all(jobs);
  }

  private async create(api: Api, householdId: string, n: OutgoingNotification, channel: Channel): Promise<"delivered" | "simulated"> {
      const status = channel === "in_app" ? "delivered" : "simulated";
      await api.create("notifications", {
        householdId,
        userId: n.userId,
        title: n.title,
        body: n.body,
        severity: n.severity,
        channel,
        deliveryStatus: status,
        actionHref: n.actionHref ?? null,
        dedupeKey: n.dedupeKey ?? null,
        readAt: channel === "in_app" ? null : new Date().toISOString(),
      });
      return status;
  }
}

export const notificationService: NotificationService = new MockNotificationService();
