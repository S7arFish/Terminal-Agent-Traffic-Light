import type { AgentEvent, AgentHubSnapshot, AgentSession } from '../src/contracts/agent';

export class AgentHubStore {
  private readonly sessions = new Map<string, AgentSession>();
  private revision = 0;
  private changedAtEpochMs = Date.now();

  apply(event: AgentEvent, now = Date.now()): AgentHubSnapshot {
    const key = `${event.provider}:${event.sessionId}`;
    this.sessions.set(key, { ...event, occurredAtEpochMs: event.occurredAtEpochMs ?? now, updatedAtEpochMs: now });
    this.prune();
    this.revision += 1;
    this.changedAtEpochMs = now;
    return this.snapshot();
  }

  snapshot(): AgentHubSnapshot {
    const sessions = [...this.sessions.values()].sort(compareSessions);
    return {
      protocol: 'agent-light/1',
      revision: this.revision,
      sessions,
      activeSessionId: sessions[0] ? `${sessions[0].provider}:${sessions[0].sessionId}` : undefined,
      changedAtEpochMs: this.changedAtEpochMs
    };
  }

  get(provider: string, sessionId: string): AgentSession | undefined {
    return this.sessions.get(`${provider}:${sessionId}`);
  }

  private prune(): void {
    const overflow = [...this.sessions.entries()].sort((left, right) => compareSessions(left[1], right[1])).slice(MAX_SESSIONS);
    for (const [key] of overflow) this.sessions.delete(key);
  }
}

const MAX_SESSIONS = 64;
const phasePriority: Record<AgentSession['phase'], number> = { waiting: 6, failed: 5, running: 4, completed: 3, idle: 2, offline: 1 };
function compareSessions(left: AgentSession, right: AgentSession): number {
  return phasePriority[right.phase] - phasePriority[left.phase] || right.updatedAtEpochMs - left.updatedAtEpochMs;
}
