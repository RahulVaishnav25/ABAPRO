import { describe, expect, it, vi } from 'vitest';
import { apiRequest } from './client';
import { clientDirectoryRequest } from './clients';

vi.mock('./client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./client')>()),
  apiRequest: vi.fn().mockResolvedValue({ items: [], total: 0 }),
}));

describe('clientDirectoryRequest', () => {
  it('sends the filters as a query string', async () => {
    await clientDirectoryRequest({ q: 'Avery Sample', pageSize: 50 });
    expect(apiRequest).toHaveBeenCalledWith('/clients?q=Avery+Sample&pageSize=50');
  });
});
