// Parent accounts in an organisation, and the clients each one is linked to. A parent may be linked to several
// clients and a client to several parents. Links are guardian records with portal access on the client.

export type ParentPortalStatus = 'active' | 'pending';

export interface ParentLinkedClient {
  id: string;
  displayName: string;
  clientCode: string;
}

export interface ParentAccountSummary {
  userId: string;
  membershipId: string;
  name: string;
  email: string;
  /** Pending until at least one client is linked; a pending parent cannot sign in. */
  portalStatus: ParentPortalStatus;
  membershipStatus: 'active' | 'revoked';
  /** Linked clients the current user can see. */
  linkedClients: ParentLinkedClient[];
  createdAt: string;
  lastActiveAt: string | null;
}

export interface ParentAccountCreate {
  name: string;
  email: string;
  password: string;
  /** Optional: clients to link now. Without any, the account stays pending. */
  clientIds?: string[];
}

export interface ParentClientLinks {
  clientIds: string[];
}
