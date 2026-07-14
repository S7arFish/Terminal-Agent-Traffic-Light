export type AgentProvider = 'terminal' | 'claude-code' | 'opencode' | 'cursor' | 'codex' | 'hermes' | 'generic';
export type AgentPhase = 'idle' | 'running' | 'waiting' | 'completed' | 'failed' | 'offline';

export interface AgentAction {
  id: string;
  label: string;
  kind?: 'primary' | 'secondary' | 'destructive';
}

export interface AgentEvent {
  version: 1;
  provider: AgentProvider;
  sessionId: string;
  requestId?: string;
  phase: AgentPhase;
  title?: string;
  message?: string;
  workspace?: string;
  actions?: AgentAction[];
  occurredAtEpochMs?: number;
}

export interface AgentSession extends AgentEvent {
  updatedAtEpochMs: number;
}

export interface AgentHubSnapshot {
  protocol: 'agent-light/1';
  revision: number;
  sessions: AgentSession[];
  activeSessionId?: string;
  changedAtEpochMs: number;
}

export function isAgentEvent(value: unknown): value is AgentEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Record<string, unknown>;
  return event.version === 1
    && providers.includes(String(event.provider) as AgentProvider)
    && typeof event.sessionId === 'string'
    && event.sessionId.length > 0
    && event.sessionId.length <= 200
    && optionalString(event.requestId, 300)
    && phases.includes(String(event.phase) as AgentPhase)
    && optionalString(event.title, 300)
    && optionalString(event.message, 20_000)
    && optionalString(event.workspace, 2_000)
    && optionalFiniteNumber(event.occurredAtEpochMs)
    && (event.actions === undefined || isActions(event.actions));
}

const providers: AgentProvider[] = ['terminal', 'claude-code', 'opencode', 'cursor', 'codex', 'hermes', 'generic'];
const phases: AgentPhase[] = ['idle', 'running', 'waiting', 'completed', 'failed', 'offline'];
function optionalString(value: unknown, limit: number): boolean { return value === undefined || (typeof value === 'string' && value.length <= limit); }
function optionalFiniteNumber(value: unknown): boolean { return value === undefined || (typeof value === 'number' && Number.isFinite(value)); }
function isActions(value: unknown): boolean {
  return Array.isArray(value) && value.length <= 8 && value.every(action => {
    if (!action || typeof action !== 'object') return false;
    const item = action as Record<string, unknown>;
    return typeof item.id === 'string' && item.id.length > 0 && item.id.length <= 100
      && typeof item.label === 'string' && item.label.length > 0 && item.label.length <= 300
      && (item.kind === undefined || ['primary', 'secondary', 'destructive'].includes(String(item.kind)));
  });
}
