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
}

export class MockNotificationService implements NotificationService {
  async send(api: Api, n: OutgoingNotification, channels: Channel[]): Promise<DeliveryReport[]> {
    const householdId = api.actor.householdId;
    if (!householdId) return [];
    const existing = n.dedupeKey ? await api.list("notifications", { includeDeleted: true }) : [];
    const reports: DeliveryReport[] = [];
    for (const channel of channels) {
      if (n.dedupeKey && existing.some((e) => e.dedupeKey === n.dedupeKey && e.channel === channel)) {
        reports.push({ channel, status: "skipped_duplicate" });
        continue;
      }
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
      reports.push({ channel, status });
    }
    return reports;
  }
}

export const notificationService: NotificationService = new MockNotificationService();
