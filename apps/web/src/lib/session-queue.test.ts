import { describe, expect, it } from 'vitest';
import { classifySubmission } from '@abapro/shared';
import { enqueueSubmission, readQueue, removeQueuedSubmission, type QueuedSubmission } from './session-queue';

describe('session submission status', () => {
  it('treats only a successful response as saved', () => {
    expect(classifySubmission(200)).toBe('saved');
    expect(classifySubmission(201)).toBe('saved');
    expect(classifySubmission(400)).toBe('failed');
    expect(classifySubmission(403)).toBe('failed');
    expect(classifySubmission(409)).toBe('conflict');
    expect(classifySubmission(null)).toBe('queued');
    expect(classifySubmission(500)).toBe('failed');
  });

  it('keeps an unsent observation until it is removed', () => {
    const memory = new MemoryStorage();
    const item: QueuedSubmission = { id: 'obs-1', path: '/sessions/s/observations', body: { idempotencyKey: 'abc12345' }, label: 'Trial 1' };
    enqueueSubmission(item, memory);
    expect(readQueue(memory)).toEqual([item]);
    removeQueuedSubmission(item.id, memory);
    expect(readQueue(memory)).toEqual([]);
  });
});

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}
