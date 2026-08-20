import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isNewItem, isStaleItem } from './itemLabels';

describe('itemLabels', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-20T12:00:00-04:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is new within the last 24 hours', () => {
    expect(isNewItem({ captured: '2026-08-20T06:00:00-04:00' })).toBe(true);
    expect(isNewItem({ captured: '2026-08-19T11:00:00-04:00' })).toBe(false);
  });

  it('is stale after 7 days with no action', () => {
    expect(isStaleItem({ captured: '2026-08-10T12:00:00-04:00' })).toBe(true);
    expect(isStaleItem({ captured: '2026-08-14T12:00:00-04:00' })).toBe(false);
  });

  it('is neither new nor stale in between', () => {
    const item = { captured: '2026-08-18T12:00:00-04:00' };
    expect(isNewItem(item)).toBe(false);
    expect(isStaleItem(item)).toBe(false);
  });
});
