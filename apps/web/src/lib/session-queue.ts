export interface QueuedSubmission {
  id: string;
  path: string;
  body: unknown;
  label: string;
}

const STORAGE_KEY = 'abapro.sessionQueue.v1';

export function readQueue(storage: Storage = localStorage): QueuedSubmission[] {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || '[]') as QueuedSubmission[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function enqueueSubmission(item: QueuedSubmission, storage: Storage = localStorage): void {
  const next = readQueue(storage).filter((queued) => queued.id !== item.id);
  next.push(item);
  storage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function removeQueuedSubmission(id: string, storage: Storage = localStorage): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(readQueue(storage).filter((item) => item.id !== id)));
}
