export type OnlineStats = {
  totalConnections: number;
  authenticatedUsers: number;
  guestConnections: number;
  updatedAt: string;
};

type Clock = () => Date;

export class OnlinePresenceTracker {
  private readonly connections = new Map<string, number | null>();
  private updatedAt: string;

  constructor(private readonly clock: Clock = () => new Date()) {
    this.updatedAt = this.clock().toISOString();
  }

  connect(socketId: string, userId: number | null) {
    this.connections.set(socketId, userId);
    this.touch();
  }

  disconnect(socketId: string) {
    if (this.connections.delete(socketId)) this.touch();
  }

  snapshot(): OnlineStats {
    const authenticatedUsers = new Set<number>();
    let guestConnections = 0;
    for (const userId of this.connections.values()) {
      if (userId === null) guestConnections += 1;
      else authenticatedUsers.add(userId);
    }

    return {
      totalConnections: this.connections.size,
      authenticatedUsers: authenticatedUsers.size,
      guestConnections,
      updatedAt: this.updatedAt,
    };
  }

  private touch() {
    this.updatedAt = this.clock().toISOString();
  }
}

export function isInternalStatsRequestAuthorized(
  header: string | string[] | undefined,
  secret: string,
) {
  return typeof header === "string" && header === secret;
}
