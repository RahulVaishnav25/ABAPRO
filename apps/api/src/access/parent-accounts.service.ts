import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  PERMISSIONS,
  type AuthUser,
  type ParentAccountCreate,
  type ParentAccountSummary,
  type ParentLinkedClient,
} from '@abapro/shared';
import { asDate, asString, normalizeEmail } from '../common/http';
import type { Queryable } from '../db/database';
import { OrganizationService } from '../organizations/organization.service';
import type { GuardianDto } from './access.dto';
import { AuthorizationService } from './authorization.service';
import { ClientRecordsService } from './client-records.service';

interface ParentRow extends Record<string, unknown> {
  id: string;
  user_id: string;
  name: string;
  email: string;
  status: 'active' | 'revoked';
  created_at: unknown;
  last_active_at: unknown;
  linked: number | string;
}

/**
 * Parent accounts and the clients each is linked to.
 *
 * A link is the client's guardian record with portal access, the same record the client profile's Link Parent
 * Account form writes, so both stay in step. Accounts are created with the organisation's member onboarding.
 * A parent with no linked client is pending and cannot sign in (see AccountService.load).
 */
@Injectable()
export class ParentAccountsService {
  constructor(
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
    @Inject(ClientRecordsService) private readonly guardians: ClientRecordsService,
    @Inject(OrganizationService) private readonly organizations: OrganizationService,
  ) {}

  async list(user: AuthUser): Promise<ParentAccountSummary[]> {
    return this.authorization.withOrganization(user, (tx, organizationId) => parents(tx, organizationId));
  }

  async get(user: AuthUser, parentId: string): Promise<ParentAccountSummary> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const [parent] = await parents(tx, organizationId, parentId);
      if (!parent) throw new NotFoundException('That parent account was not found.');
      return parent;
    });
  }

  async create(user: AuthUser, input: ParentAccountCreate): Promise<ParentAccountSummary> {
    const organizationId = this.authorization.requireOrganization(user);
    const clientIds = [...new Set(input.clientIds ?? [])];
    // Check every client first, so a refused client does not leave an account half set up.
    await this.authorization.withOrganization(user, async (tx) => {
      for (const clientId of clientIds) await this.editableClient(tx, user, organizationId, clientId);
    });
    // Organisation administrators only, as for every team member.
    await this.organizations.createMember(user, organizationId, { name: input.name, email: input.email, password: input.password, role: 'parent' });
    const parentId = await this.authorization.withOrganization(user, async (tx) => {
      const rows = await tx.query<{ user_id: string }>(
        `SELECT m.user_id FROM organization_memberships m JOIN users u ON u.id = m.user_id
         WHERE m.organization_id = $1 AND m.role = 'parent' AND u.email = $2`,
        [organizationId, normalizeEmail(input.email)],
      );
      return asString(rows[0]?.user_id);
    });
    const parent = await this.get(user, parentId);
    for (const clientId of clientIds) await this.link(user, clientId, parent);
    return this.get(user, parentId);
  }

  /** Makes the parent's linked clients exactly these, among the clients the current user can see. */
  async setClients(user: AuthUser, parentId: string, clientIds: string[]): Promise<ParentAccountSummary> {
    const parent = await this.get(user, parentId);
    if (parent.membershipStatus !== 'active') throw new ForbiddenException('That parent account has been revoked.');
    const wanted = new Set(clientIds);
    const current = new Set(parent.linkedClients.map((client) => client.id));
    const adding = [...wanted].filter((id) => !current.has(id));
    const removing = [...current].filter((id) => !wanted.has(id));
    const organizationId = this.authorization.requireOrganization(user);
    await this.authorization.withOrganization(user, async (tx) => {
      for (const clientId of [...adding, ...removing]) await this.editableClient(tx, user, organizationId, clientId);
    });
    for (const clientId of adding) await this.link(user, clientId, parent);
    for (const clientId of removing) await this.unlink(user, clientId, parent.userId);
    return this.get(user, parentId);
  }

  private async editableClient(tx: Queryable, user: AuthUser, organizationId: string, clientId: string): Promise<void> {
    await this.authorization.findAccessibleClient(tx, user, organizationId, clientId, 'write', PERMISSIONS.guardiansManage);
  }

  /** Gives the parent portal access on the client's guardian record for them, adding the record if there is none. */
  private async link(user: AuthUser, clientId: string, parent: ParentAccountSummary): Promise<void> {
    const existing = await this.guardianRecord(user, clientId, parent.userId);
    if (existing) {
      await this.guardians.updateGuardian(user, clientId, existing.id, { ...existing.input, portalAccess: true, linkedUserId: parent.userId });
      return;
    }
    await this.guardians.addGuardian(user, clientId, {
      name: parent.name,
      relationship: 'parent',
      email: parent.email,
      channels: ['portal'],
      emergencyContact: false,
      portalAccess: true,
      linkedUserId: parent.userId,
    } as GuardianDto);
  }

  /** Withdraws portal access but keeps the guardian contact, as unticking portal access on the profile does. */
  private async unlink(user: AuthUser, clientId: string, parentId: string): Promise<void> {
    const existing = await this.guardianRecord(user, clientId, parentId);
    if (existing) {
      await this.guardians.updateGuardian(user, clientId, existing.id, { ...existing.input, portalAccess: false, linkedUserId: parentId });
    }
  }

  private async guardianRecord(user: AuthUser, clientId: string, parentId: string): Promise<{ id: string; input: GuardianDto } | null> {
    return this.authorization.withOrganization(user, async (tx) => {
      const rows = await tx.query<{
        id: string; name: string; relationship: GuardianDto['relationship']; email: string | null; phone: string | null;
        channels: unknown; emergency_contact: boolean;
      }>(
        `SELECT id, name, relationship, email, phone, channels, emergency_contact
         FROM client_guardians
         WHERE client_id = $1 AND linked_user_id = $2 AND ended_at IS NULL
         ORDER BY portal_access DESC, created_at
         LIMIT 1`,
        [clientId, parentId],
      );
      const row = rows[0];
      if (!row) return null;
      const channels = Array.isArray(row.channels) ? row.channels : typeof row.channels === 'string' ? JSON.parse(row.channels) : [];
      return {
        id: asString(row.id),
        input: {
          name: asString(row.name),
          relationship: row.relationship,
          email: row.email ? asString(row.email) : undefined,
          phone: row.phone ? asString(row.phone) : undefined,
          channels,
          emergencyContact: Boolean(row.emergency_contact),
          portalAccess: true,
          linkedUserId: parentId,
        } as GuardianDto,
      };
    });
  }
}

async function parents(tx: Queryable, organizationId: string, parentId?: string): Promise<ParentAccountSummary[]> {
  const rows = await tx.query<ParentRow>(
    `SELECT m.id, m.user_id, u.name, u.email, m.status, m.created_at, m.last_active_at,
            parent_linked_client_count(m.user_id, m.organization_id) AS linked
     FROM organization_memberships m
     JOIN users u ON u.id = m.user_id
     WHERE m.organization_id = $1 AND m.role = 'parent' AND ($2::uuid IS NULL OR m.user_id = $2::uuid)
     ORDER BY u.name`,
    [organizationId, parentId ?? null],
  );
  // Only clients visible to the current user, by organisation and clinic.
  const links = await tx.query<{ user_id: string; id: string; display_name: string; client_code: string }>(
    `SELECT DISTINCT a.user_id, c.id, c.display_name, c.client_code
     FROM client_assignments a
     JOIN clients c ON c.id = a.client_id
     WHERE a.organization_id = $1 AND a.relationship = 'guardian' AND a.ended_at IS NULL
       AND ($2::uuid IS NULL OR a.user_id = $2::uuid)
     ORDER BY c.display_name`,
    [organizationId, parentId ?? null],
  );
  const byParent = new Map<string, ParentLinkedClient[]>();
  for (const link of links) {
    const list = byParent.get(asString(link.user_id)) ?? [];
    list.push({ id: asString(link.id), displayName: asString(link.display_name), clientCode: asString(link.client_code) });
    byParent.set(asString(link.user_id), list);
  }
  return rows.map((row) => ({
    userId: asString(row.user_id),
    membershipId: asString(row.id),
    name: asString(row.name),
    email: asString(row.email),
    portalStatus: Number(row.linked) > 0 ? 'active' : 'pending',
    membershipStatus: row.status,
    linkedClients: byParent.get(asString(row.user_id)) ?? [],
    createdAt: asDate(row.created_at).toISOString(),
    lastActiveAt: row.last_active_at ? asDate(row.last_active_at).toISOString() : null,
  }));
}
