import { describe, expect, it } from 'vitest';
import { ExpansionCoordinator } from '../../desktop/expansionCoordinator';

describe('ExpansionCoordinator', () => {
  it('serializes rapid hover changes and finishes at the latest requested size', async () => {
    const applied: boolean[] = [];
    const rendered: boolean[] = [];
    const coordinator = new ExpansionCoordinator(
      value => new Promise(resolve => setTimeout(() => { applied.push(value); resolve(value); }, value ? 8 : 1)),
      value => rendered.push(value)
    );
    const settling = coordinator.request(true);
    void coordinator.request(false);
    void coordinator.request(true);
    void coordinator.request(false);
    await settling;
    expect(coordinator.isExpanded).toBe(false);
    expect(applied).toEqual([true, false]);
    expect(rendered.at(-1)).toBe(false);
  });

  it('does not issue duplicate resize calls for the current state', async () => {
    let calls = 0;
    const coordinator = new ExpansionCoordinator(async value => { calls += 1; return value; }, () => undefined);
    await coordinator.request(false);
    expect(calls).toBe(0);
  });
});
