import type { ClientDirectoryItem, ParentAccountCreate, ParentAccountSummary } from '@abapro/shared';
import { apiRequest, encodedPath } from './client';
import { clientDirectoryRequest } from './clients';

export function parentsRequest(): Promise<ParentAccountSummary[]> {
  return apiRequest('/parents');
}

export function createParentRequest(body: ParentAccountCreate): Promise<ParentAccountSummary> {
  return apiRequest('/parents', { method: 'POST', body });
}

/** Makes the parent's linked clients exactly these. */
export function setParentClientsRequest(userId: string, clientIds: string[]): Promise<ParentAccountSummary> {
  return apiRequest(encodedPath`/parents/${userId}/clients`, { method: 'PUT', body: { clientIds } });
}

/** Every client the current user can see, a page at a time, for choosing which to link. */
export async function allClientsRequest(): Promise<ClientDirectoryItem[]> {
  const pageSize = 50;
  const items: ClientDirectoryItem[] = [];
  for (let page = 1; ; page += 1) {
    const result = await clientDirectoryRequest({ page, pageSize, sort: 'name' });
    items.push(...result.items);
    if (items.length >= result.total || result.items.length < pageSize) return items;
  }
}
