import type { AnalyticsService } from "../../../lib/analytics";
import type { EventBus } from "../../../lib/event-bus";

import { makeWriteEvent } from "./utils";

export function registerGuildSubscribers(
  events: EventBus,
  analytics: AnalyticsService,
): void {
  const write = makeWriteEvent(analytics);

  events.on("guild.created", (p) => {
    write({
      orgId: p.organizationId,
      endUserId: p.endUserId,
      event: "guild.created",
      source: "guild",
      amount: 1,
      eventData: {
        guildId: p.guildId,
        guildName: p.guildName,
        joinMode: p.joinMode,
      },
    });
  });

  events.on("guild.joined", (p) => {
    write({
      orgId: p.organizationId,
      endUserId: p.endUserId,
      event: "guild.joined",
      source: "guild",
      amount: 1,
      eventData: {
        guildId: p.guildId,
        via: p.via,
        approverUserId: p.approverUserId,
      },
    });
  });

  events.on("guild.left", (p) => {
    write({
      orgId: p.organizationId,
      endUserId: p.endUserId,
      event: "guild.left",
      source: "guild",
      amount: 1,
      eventData: {
        guildId: p.guildId,
      },
    });
  });

  events.on("guild.contributed", (p) => {
    write({
      orgId: p.organizationId,
      endUserId: p.endUserId,
      event: "guild.contributed",
      source: "guild",
      amount: p.delta,
      eventData: {
        guildId: p.guildId,
        guildExpDelta: p.guildExpDelta,
        sourceTag: p.source,
      },
    });
  });
}
