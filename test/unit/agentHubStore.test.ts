import { describe, expect, it } from 'vitest';
import { AgentHubStore } from '../../desktop/agentHubStore';

describe('AgentHubStore', () => {
  it('prioritizes waiting sessions and preserves multiple providers', () => {
    const store = new AgentHubStore();
    store.apply({ version: 1, provider: 'opencode', sessionId: 'open-1', phase: 'running', title: 'OpenCode' }, 10);
    const snapshot = store.apply({ version: 1, provider: 'claude-code', sessionId: 'claude-1', phase: 'waiting', title: 'Claude', message: 'Allow Bash?' }, 20);
    expect(snapshot.sessions).toHaveLength(2);
    expect(snapshot.sessions[0]).toMatchObject({ provider: 'claude-code', phase: 'waiting' });
    expect(snapshot.activeSessionId).toBe('claude-code:claude-1');
  });

  it('updates an existing provider session instead of duplicating it', () => {
    const store = new AgentHubStore();
    store.apply({ version: 1, provider: 'hermes', sessionId: 'one', phase: 'running' }, 10);
    const snapshot = store.apply({ version: 1, provider: 'hermes', sessionId: 'one', phase: 'completed' }, 20);
    expect(snapshot.sessions).toHaveLength(1);
    expect(snapshot.sessions[0].phase).toBe('completed');
    expect(snapshot.revision).toBe(2);
  });

  it('bounds retained sessions while preserving the highest-priority work', () => {
    const store = new AgentHubStore();
    for (let index = 0; index < 70; index += 1) store.apply({ version: 1, provider: 'generic', sessionId: `done-${index}`, phase: 'completed' }, index);
    const snapshot = store.apply({ version: 1, provider: 'codex', sessionId: 'waiting', phase: 'waiting' }, 100);
    expect(snapshot.sessions).toHaveLength(64);
    expect(snapshot.sessions[0]).toMatchObject({ provider: 'codex', sessionId: 'waiting' });
    expect(snapshot.sessions.some(session => session.sessionId === 'done-0')).toBe(false);
  });
});
