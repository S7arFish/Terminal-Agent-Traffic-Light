import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeferredBoundsSaver } from '../../desktop/deferredBoundsSaver';

describe('DeferredBoundsSaver', () => {
  afterEach(() => vi.useRealTimers());
  it('does not overwrite collapsed bounds when a pending save fires during expansion', () => {
    vi.useFakeTimers(); let expanded = false; const saved: string[] = [];
    const saver = new DeferredBoundsSaver(() => expanded, () => 'expanded-bounds', value => saved.push(value), 250);
    saver.schedule(); expanded = true; vi.advanceTimersByTime(300);
    expect(saved).toEqual([]);
  });
});
