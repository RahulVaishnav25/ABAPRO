import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  INVITABLE_ROLES,
  LOCALES,
  ROLE_LABELS,
  type AuthUser,
  type ClinicDraft,
  type CreateOrganizationRequest,
  type InvitationCreated,
  type InvitationDraft,
  type InvitableRole,
  type OrganizationDirectoryClinic,
  type OrganizationDirectoryItem,
  type OrganizationDirectoryPage,
  type OrganizationMemberAccess,
  type OrganizationSettingsView,
  type Role,
  type UpdateOrganizationRequest,
} from '@abapro/shared';
import type { AppConfig } from '../config/app-config';
import { APP_CONFIG } from '../config/app-config.module';
import { recordAudit } from '../common/audit';
import { asBoolean, asBytes, asDate, asNullableString, asString, normalizeEmail, randomToken, sha256 } from '../common/http';
import { DATABASE } from '../db/database.module';
import type { Database, Queryable } from '../db/database';
import { AccountService } from '../auth/account.service';
import { registerIdentity } from '../identity/directory';
import { PLATFORM_ADMIN_EMAIL } from '../identity/platform-admin';
import { SessionService } from '../auth/session.service';

const LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_LOGO_BYTES = 512 * 1024;
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class OrganizationService {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(AccountService) private readonly accounts: AccountService,
    @Inject(SessionService) private readonly sessions: SessionService,
  ) {}

  async list(user: AuthUser, search = '', country = '', page = '1', pageSize = '10'): Promise<OrganizationDirectoryPage> {
    this.requirePlatformAdmin(user);
    const term = search.trim();
    const countryCode = country.trim().toUpperCase();
    const currentPage = positiveInteger(page, 1);
    const size = Math.min(positiveInteger(pageSize, 10), 50);
    const pattern = term ? `%${term.replace(/[\\%_]/g, '\\$&')}%` : '';
    const filters = `WHERE ($1 = '' OR o.country = $1)
         AND (
           $2 = ''
           OR o.name ILIKE $2
           OR o.contact_email ILIKE $2
           OR EXISTS (
             SELECT 1 FROM clinics c
             WHERE c.organization_id = o.id AND (c.name ILIKE $2 OR c.location ILIKE $2)
           )
         )`;
    const params = [countryCode, pattern];
    const counted = await this.database.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM organizations o ${filters}`,
      params,
    );
    const total = Number(counted[0]?.total ?? 0);
    const pageCount = Math.max(1, Math.ceil(total / size));
    const safePage = Math.min(currentPage, pageCount);
    const rows = await this.database.query(
      `SELECT o.id, o.name, o.contact_email, o.contact_phone, o.country, o.address,
              o.company_identification_number, o.tax_number, o.timezone, o.created_at,
              EXISTS (
                SELECT 1 FROM organization_memberships m
                WHERE m.organization_id = o.id AND m.user_id = $3 AND m.status = 'active'
              ) AS member
       FROM organizations o
       ${filters}
       ORDER BY o.name
       LIMIT $4 OFFSET $5`,
      [...params, user.id, size, (safePage - 1) * size],
    );
    const countries = await this.database.query<{ country: string }>(
      `SELECT DISTINCT country FROM organizations WHERE country <> '' ORDER BY country`,
    );
    const items = await Promise.all(rows.map((row) => this.directoryItem(row, user.id, false)));
    return { items, total, page: safePage, pageSize: size, countries: countries.map((row) => asString(row.country)) };
  }

  async detail(user: AuthUser, organizationId: string): Promise<OrganizationDirectoryItem> {
    await this.assertCanEnter(user, organizationId);
    return this.loadDirectory(organizationId, user.id, true);
  }

  async createMember(
    user: AuthUser,
    organizationId: string,
    input: { name: string; email: string; password: string; role: InvitableRole },
  ): Promise<OrganizationDirectoryItem> {
    await this.assertCanManage(user, organizationId);
    const email = normalizeEmail(input.email);
    const name = input.name.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Enter a valid email address.');
    }
    await this.assertNotMember(organizationId, email);
    const existingAccount = await this.database.query(`SELECT id FROM identity_accounts WHERE email = $1`, [email]);
    if (existingAccount.length > 0) {
      throw new ConflictException('An account with that email already exists.');
    }
    const registered = await registerIdentity(this.database, { name, email, password: input.password });
    if (!registered.ok) {
      throw new BadRequestException(registered.message);
    }
    const memberId = await this.accounts.upsertFromClaims(this.database, {
      issuer: this.config.oidcIssuer,
      subject: registered.account.id,
      email: registered.account.email,
      name: registered.account.name,
      emailVerified: true,
    });
    await this.database.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO organization_memberships (organization_id, user_id, role, status)
         VALUES ($1, $2, $3, 'active')`,
        [organizationId, memberId, input.role],
      );
      if (input.role !== 'organization_admin') {
        await tx.query(
          `INSERT INTO clinic_access (organization_id, clinic_id, user_id)
           SELECT $1, id, $2 FROM clinics WHERE organization_id = $1
           ON CONFLICT (clinic_id, user_id) DO NOTHING`,
          [organizationId, memberId],
        );
      }
      await recordAudit(tx, {
        organizationId,
        actorUserId: user.id,
        action: 'member.created',
        targetType: 'user',
        targetId: memberId,
        metadata: { email, role: input.role },
      });
    });
    return this.loadDirectory(organizationId, user.id, true);
  }

  async create(user: AuthUser, sessionId: string, input: CreateOrganizationRequest): Promise<AuthUser> {
    this.requirePlatformAdmin(user);
    const organization = this.validateOrganization(input);
    const invites = this.validateInvites(input.invites);
    if (invites.some((invite) => invite.email === user.email)) {
      throw new ConflictException('That person is already a member of this organization.');
    }

    let created: { id: string; clinicId: string | null };
    try {
      created = await this.database.transaction(async (tx) => {
      const inserted = await tx.query<{ id: string }>(
        `INSERT INTO organizations (
           name, contact_email, contact_phone, country, timezone, locale, address, company_identification_number, tax_number
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [
          organization.name,
          organization.contactEmail,
          organization.contactPhone,
          organization.country,
          organization.timezone,
          organization.locale,
          organization.address,
          organization.companyIdentificationNumber,
          organization.taxNumber,
        ],
      );
      const id = asString(inserted[0]?.id);
      await tx.query(
        `INSERT INTO organization_settings (organization_id, display_name, primary_color, logo_content_type, logo_bytes)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, organization.name, organization.primaryColor, organization.logoContentType, organization.logoBytes],
      );
      if (normalizeEmail(user.email) !== PLATFORM_ADMIN_EMAIL) {
        await tx.query(
          `INSERT INTO organization_memberships (organization_id, user_id, role) VALUES ($1, $2, 'organization_admin')`,
          [id, user.id],
        );
      }
      const clinics = this.clinicDrafts(input.clinics, organization.name, organization.country, organization.contactEmail);
      let firstClinicId: string | null = null;
      for (const clinic of clinics) {
        const insertedClinic = await tx.query<{ id: string }>(
          `INSERT INTO clinics (organization_id, name, location, address, contact_email, contact_phone)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [id, clinic.name, clinic.location, clinic.address, clinic.contactEmail, clinic.contactPhone],
        );
        firstClinicId ??= asString(insertedClinic[0]?.id);
      }
      await this.sessions.setClinic(tx, sessionId, firstClinicId);
      for (const invite of invites) {
        await this.insertInvitation(tx, id, user.id, invite);
      }
      await this.sessions.setOrganization(tx, sessionId, id);
      await recordAudit(tx, {
        organizationId: id,
        actorUserId: user.id,
        action: 'organization.created',
        targetType: 'organization',
        targetId: id,
        metadata: { inviteCount: invites.length },
      });
      return { id, clinicId: firstClinicId };
    });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('An organisation or clinic with those details already exists.');
      }
      throw error;
    }
    return this.accounts.load(user.id, created.id, created.clinicId);
  }

  async switchOrganization(user: AuthUser, sessionId: string, organizationId: string, clinicId?: string): Promise<AuthUser> {
    await this.assertCanEnter(user, organizationId);
    const clinic = await this.selectableClinic(user, organizationId, clinicId);
    await this.database.transaction(async (tx) => {
      await this.sessions.setOrganization(tx, sessionId, organizationId);
      await this.sessions.setClinic(tx, sessionId, clinic);
      await recordAudit(tx, {
        organizationId,
        actorUserId: user.id,
        action: 'organization.switched',
        targetType: 'organization',
        targetId: organizationId,
      });
    });
    return this.accounts.load(user.id, organizationId, clinic);
  }

  async switchClinic(user: AuthUser, sessionId: string, clinicId: string): Promise<AuthUser> {
    if (!user.organization) {
      throw new ForbiddenException('Choose an organisation before choosing a clinic.');
    }
    const clinic = await this.selectableClinic(user, user.organization.id, clinicId);
    if (!clinic) {
      throw new ForbiddenException('You do not have access to that clinic.');
    }
    await this.sessions.setClinic(this.database, sessionId, clinic);
    await recordAudit(this.database, {
      organizationId: user.organization.id,
      actorUserId: user.id,
      action: 'clinic.switched',
      targetType: 'clinic',
      targetId: clinic,
    });
    return this.accounts.load(user.id, user.organization.id, clinic);
  }

  async update(user: AuthUser, organizationId: string, input: UpdateOrganizationRequest): Promise<OrganizationDirectoryItem> {
    await this.assertCanManage(user, organizationId);
    const profile = this.validateProfile(input);
    await this.database.transaction(async (tx) => {
      const updated = await tx.query(
        `UPDATE organizations
         SET name = $2, contact_email = $3, contact_phone = $4, country = $5, address = $6,
             company_identification_number = $7, tax_number = $8, updated_at = now()
         WHERE id = $1
         RETURNING id`,
        [
          organizationId,
          profile.name,
          profile.contactEmail,
          profile.contactPhone,
          profile.country,
          profile.address,
          profile.companyIdentificationNumber,
          profile.taxNumber,
        ],
      );
      if (updated.length === 0) {
        throw new NotFoundException('That organisation was not found.');
      }
      await tx.query(
        `UPDATE organization_settings SET display_name = $2, updated_at = now() WHERE organization_id = $1`,
        [organizationId, profile.name],
      );
      await recordAudit(tx, {
        organizationId,
        actorUserId: user.id,
        action: 'organization.updated',
        targetType: 'organization',
        targetId: organizationId,
      });
    });
    return this.loadDirectory(organizationId, user.id, true);
  }

  async updateClinic(user: AuthUser, clinicId: string, input: ClinicDraft): Promise<void> {
    const existing = await this.database.query(`SELECT organization_id FROM clinics WHERE id = $1`, [clinicId]);
    const organizationId = existing[0] ? asString(existing[0].organization_id) : '';
    if (!organizationId) {
      throw new NotFoundException('That clinic was not found.');
    }
    await this.assertCanManage(user, organizationId);
    const [clinic] = this.clinicDrafts([input], input.name, input.location, input.contactEmail ?? '');
    if (!clinic) {
      throw new BadRequestException('Enter the clinic name and location.');
    }
    try {
      const updated = await this.database.query(
        `UPDATE clinics
         SET name = $3, location = $4, address = $5, contact_email = $6, contact_phone = $7, updated_at = now()
         WHERE id = $1 AND organization_id = $2
         RETURNING id`,
        [clinicId, organizationId, clinic.name, clinic.location, clinic.address, clinic.contactEmail, clinic.contactPhone],
      );
      if (updated.length === 0) {
        throw new NotFoundException('That clinic was not found.');
      }
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      if (isUniqueViolation(error)) {
        throw new ConflictException('That clinic name is already used in this organisation.');
      }
      throw error;
    }
    await recordAudit(this.database, {
      organizationId,
      actorUserId: user.id,
      action: 'clinic.updated',
      targetType: 'clinic',
      targetId: clinicId,
    });
  }

  async addClinic(user: AuthUser, organizationId: string, input: ClinicDraft): Promise<OrganizationDirectoryItem> {
    await this.assertCanManage(user, organizationId);
    const [clinic] = this.clinicDrafts([input], input.name, '', input.contactEmail ?? '');
    if (!clinic) {
      throw new BadRequestException('Enter the clinic name and location.');
    }
    try {
      await this.database.query(
        `INSERT INTO clinics (organization_id, name, location, address, contact_email, contact_phone)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [organizationId, clinic.name, clinic.location, clinic.address, clinic.contactEmail, clinic.contactPhone],
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('That clinic name is already used in this organisation.');
      }
      throw error;
    }
    return this.loadDirectory(organizationId, user.id, true);
  }

  async grantClinicAccess(user: AuthUser, organizationId: string, clinicId: string, userId: string): Promise<OrganizationDirectoryItem> {
    await this.assertCanManage(user, organizationId);
    const clinic = await this.database.query(`SELECT id FROM clinics WHERE id = $1 AND organization_id = $2`, [clinicId, organizationId]);
    if (clinic.length === 0) {
      throw new BadRequestException('That clinic was not found.');
    }
    const member = await this.database.query(
      `SELECT role FROM organization_memberships WHERE organization_id = $1 AND user_id = $2 AND status = 'active'`,
      [organizationId, userId],
    );
    if (member.length === 0) {
      throw new BadRequestException('That person is not an active member of this organisation.');
    }
    await this.database.query(
      `INSERT INTO clinic_access (organization_id, clinic_id, user_id) VALUES ($1, $2, $3)
       ON CONFLICT (clinic_id, user_id) DO NOTHING`,
      [organizationId, clinicId, userId],
    );
    return this.loadDirectory(organizationId, user.id, true);
  }

  async settings(user: AuthUser): Promise<OrganizationSettingsView> {
    const organizationId = this.requireOrganization(user);
    const rows = await this.database.query(
      `SELECT o.id, o.contact_email, o.contact_phone, o.country, o.timezone, o.locale,
              s.display_name, s.primary_color, s.logo_content_type
       FROM organizations o
       JOIN organization_settings s ON s.organization_id = o.id
       WHERE o.id = $1`,
      [organizationId],
    );
    const row = rows[0];
    if (!row) {
      throw new ForbiddenException('You are not a member of that organization.');
    }
    return {
      organizationId: asString(row.id),
      displayName: asString(row.display_name),
      contactEmail: asString(row.contact_email),
      contactPhone: asNullableString(row.contact_phone),
      country: asString(row.country).trim(),
      timezone: asString(row.timezone),
      locale: asString(row.locale),
      primaryColor: asString(row.primary_color),
      hasLogo: row.logo_content_type != null,
    };
  }

  async logo(user: AuthUser): Promise<{ contentType: string; bytes: Buffer } | null> {
    const organizationId = this.requireOrganization(user);
    const rows = await this.database.query(
      `SELECT logo_content_type, logo_bytes FROM organization_settings WHERE organization_id = $1`,
      [organizationId],
    );
    const row = rows[0];
    const bytes = asBytes(row?.logo_bytes);
    const contentType = asNullableString(row?.logo_content_type);
    if (!row || !bytes || !contentType) {
      return null;
    }
    return { contentType, bytes };
  }

  async invite(user: AuthUser, draft: InvitationDraft): Promise<InvitationCreated> {
    const organizationId = this.requireOrganization(user);
    const [invite] = this.validateInvites([draft]);
    if (!invite) {
      throw new BadRequestException('Enter an email address and a role.');
    }
    await this.assertNotMember(organizationId, invite.email);
    try {
      await this.database.transaction(async (tx) => {
        await this.insertInvitation(tx, organizationId, user.id, invite);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        await recordAudit(this.database, {
          organizationId,
          actorUserId: user.id,
          action: 'invitation.duplicate_rejected',
          targetType: 'invitation',
          metadata: { email: invite.email },
        });
        throw new ConflictException('An invitation is already pending for that email.');
      }
      throw error;
    }
    return {
      status: 'invitation_sent',
      delivery: this.config.nodeEnv === 'production' ? 'not-configured' : 'development-mailbox',
    };
  }

  async listInvitations(user: AuthUser): Promise<Array<{ id: string; email: string; role: string; expiresAt: string }>> {
    const organizationId = this.requireOrganization(user);
    const rows = await this.database.query(
      `SELECT id, email, role, expires_at
       FROM invitations
       WHERE organization_id = $1 AND accepted_at IS NULL AND revoked_at IS NULL
       ORDER BY created_at DESC`,
      [organizationId],
    );
    return rows.map((row) => ({
      id: asString(row.id),
      email: asString(row.email),
      role: asString(row.role),
      expiresAt: asDate(row.expires_at).toISOString(),
    }));
  }

  async accept(user: AuthUser, sessionId: string, token: string): Promise<AuthUser> {
    const tokenHash = sha256(token);
    const rows = await this.database.query(
      `SELECT id, organization_id, email, role, expires_at, accepted_at, revoked_at
       FROM invitations WHERE token_hash = $1`,
      [tokenHash],
    );
    const invitation = rows[0];
    if (!invitation || invitation.accepted_at || invitation.revoked_at || asDate(invitation.expires_at).getTime() <= Date.now()) {
      throw new BadRequestException('This invitation is no longer valid.');
    }
    if (normalizeEmail(asString(invitation.email)) !== normalizeEmail(user.email)) {
      throw new ForbiddenException('This invitation cannot be accepted with the signed-in account.');
    }
    const organizationId = asString(invitation.organization_id);
    const clinicId = await this.database.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO organization_memberships (organization_id, user_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (organization_id, user_id) DO NOTHING`,
        [organizationId, user.id, invitation.role],
      );
      const updated = await tx.query(
        `UPDATE invitations SET accepted_at = now()
         WHERE id = $1 AND accepted_at IS NULL AND revoked_at IS NULL
         RETURNING id`,
        [invitation.id],
      );
      if (updated.length === 0) {
        throw new BadRequestException('This invitation is no longer valid.');
      }
      const clinicId = await this.grantAcceptedClinics(tx, organizationId, user.id, asString(invitation.role));
      await this.sessions.setOrganization(tx, sessionId, organizationId);
      await this.sessions.setClinic(tx, sessionId, clinicId);
      await recordAudit(tx, {
        organizationId,
        actorUserId: user.id,
        action: 'invitation.accepted',
        targetType: 'invitation',
        targetId: asString(invitation.id),
      });
      return clinicId;
    });
    return this.accounts.load(user.id, organizationId, clinicId);
  }

  private async insertInvitation(
    db: Queryable,
    organizationId: string,
    invitedBy: string,
    invite: { email: string; role: InvitableRole },
  ): Promise<void> {
    await this.assertNotMember(organizationId, invite.email, db);
    const token = randomToken();
    const organization = await db.query<{ name: string }>(`SELECT name FROM organizations WHERE id = $1`, [organizationId]);
    const organizationName = asString(organization[0]?.name ?? 'an organization');
    const inserted = await db.query<{ id: string }>(
      `INSERT INTO invitations (organization_id, email, role, token_hash, expires_at, invited_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [organizationId, invite.email, invite.role, sha256(token), new Date(Date.now() + INVITE_TTL_MS), invitedBy],
    );
    await this.deliver(
      db,
      invite.email,
      `Invitation to ${organizationName}`,
      `You have been invited to join ${organizationName}.\n${this.config.webOrigin}/invitations/accept?token=${token}`,
    );
    await recordAudit(db, {
      organizationId,
      actorUserId: invitedBy,
      action: 'invitation.created',
      targetType: 'invitation',
      targetId: asString(inserted[0]?.id),
      metadata: { email: invite.email, role: invite.role },
    });
  }

  private async deliver(db: Queryable, recipient: string, subject: string, body: string): Promise<void> {
    if (this.config.nodeEnv === 'production') {
      return;
    }
    await db.query(`INSERT INTO identity_outbound_messages (recipient, subject, body) VALUES ($1, $2, $3)`, [
      recipient,
      subject,
      body,
    ]);
  }

  private async assertNotMember(organizationId: string, email: string, db: Queryable = this.database): Promise<void> {
    const rows = await db.query(
      `SELECT 1 FROM organization_memberships m
       JOIN users u ON u.id = m.user_id
       WHERE m.organization_id = $1 AND lower(u.email) = $2`,
      [organizationId, email],
    );
    if (rows.length > 0) {
      throw new ConflictException('That person is already a member of this organization.');
    }
  }

  private async loadDirectory(organizationId: string, userId: string, includeRecords: boolean): Promise<OrganizationDirectoryItem> {
    const rows = await this.database.query(
      `SELECT o.id, o.name, o.contact_email, o.contact_phone, o.country, o.address,
              o.company_identification_number, o.tax_number, o.timezone, o.created_at,
              EXISTS (
                SELECT 1 FROM organization_memberships m
                WHERE m.organization_id = o.id AND m.user_id = $2 AND m.status = 'active'
              ) AS member
       FROM organizations o
       WHERE o.id = $1`,
      [organizationId, userId],
    );
    const row = rows[0];
    if (!row) {
      throw new BadRequestException('That organisation was not found.');
    }
    return this.directoryItem(row, userId, includeRecords);
  }

  private async directoryItem(row: Record<string, unknown>, userId: string, includeRecords: boolean): Promise<OrganizationDirectoryItem> {
    const organizationId = asString(row.id);
    const clinics = await this.database.query(
      `SELECT id, name, location, address, contact_email, contact_phone,
              (SELECT count(*)::int FROM clients WHERE clinic_id = clinics.id) AS client_count
       FROM clinics
       WHERE organization_id = $1
       ORDER BY name`,
      [organizationId],
    );
    const clients = includeRecords
      ? await this.database.query(
          `SELECT id, clinic_id, display_name, client_code, status
           FROM clients WHERE organization_id = $1 ORDER BY display_name`,
          [organizationId],
        )
      : [];
    const members = includeRecords
      ? await this.database.query(
          `SELECT m.user_id, u.name, u.email, m.role
           FROM organization_memberships m
           JOIN users u ON u.id = m.user_id
           WHERE m.organization_id = $1 AND m.status = 'active'
           ORDER BY u.name`,
          [organizationId],
        )
      : [];
    const access = includeRecords
      ? await this.database.query(`SELECT clinic_id, user_id FROM clinic_access WHERE organization_id = $1`, [organizationId])
      : [];
    const clinicItems: OrganizationDirectoryClinic[] = clinics.map((clinic) => {
      const clinicId = asString(clinic.id);
      const clinicClients = clients.filter((client) => asString(client.clinic_id) === clinicId);
      const clinicUsers = members.filter((member) => {
        const role = asString(member.role);
        if (role === 'organization_admin') return true;
        return access.some((entry) => asString(entry.clinic_id) === clinicId && asString(entry.user_id) === asString(member.user_id));
      });
      return {
        id: clinicId,
        name: asString(clinic.name),
        location: asString(clinic.location),
        address: asNullableString(clinic.address),
        contactEmail: asNullableString(clinic.contact_email),
        contactPhone: asNullableString(clinic.contact_phone),
        clientCount: Number(clinic.client_count ?? clinicClients.length),
        clients: clinicClients.map((client) => ({
          id: asString(client.id),
          displayName: asString(client.display_name),
          clientCode: asString(client.client_code),
          status: asString(client.status),
        })),
        users: clinicUsers.map((member) => ({
          userId: asString(member.user_id),
          name: asString(member.name),
          email: asString(member.email),
          role: asString(member.role),
          roleLabel: ROLE_LABELS[asString(member.role) as Role] ?? asString(member.role),
        })),
      };
    });
    return {
      id: organizationId,
      name: asString(row.name),
      contactEmail: asString(row.contact_email),
      contactPhone: asNullableString(row.contact_phone),
      country: asString(row.country).trim(),
      address: asNullableString(row.address),
      companyIdentificationNumber: asNullableString(row.company_identification_number),
      taxNumber: asNullableString(row.tax_number),
      timezone: asString(row.timezone),
      createdAt: asDate(row.created_at).toISOString(),
      member: asBoolean(row.member),
      clinics: clinicItems,
      members: members.map((member) => {
        const role = asString(member.role);
        const userId = asString(member.user_id);
        const assigned = access.filter((entry) => asString(entry.user_id) === userId).map((entry) => asString(entry.clinic_id));
        const clinicIds = role === 'organization_admin' ? clinics.map((clinic) => asString(clinic.id)) : assigned;
        const person: OrganizationMemberAccess = {
          userId,
          name: asString(member.name),
          email: asString(member.email),
          role,
          roleLabel: ROLE_LABELS[role as Role] ?? role,
          clinicIds,
        };
        return person;
      }),
    };
  }

  private async assertCanEnter(user: AuthUser, organizationId: string): Promise<void> {
    const rows = await this.database.query(`SELECT id FROM organizations WHERE id = $1`, [organizationId]);
    if (rows.length === 0) {
      throw new ForbiddenException('You are not a member of that organization.');
    }
    if (user.platformAdmin) return;
    const membership = await this.database.query(
      `SELECT 1 AS present FROM organization_memberships
       WHERE user_id = $1 AND organization_id = $2 AND status = 'active'`,
      [user.id, organizationId],
    );
    if (membership.length === 0) {
      throw new ForbiddenException('You are not a member of that organization.');
    }
  }

  private async assertCanManage(user: AuthUser, organizationId: string): Promise<void> {
    await this.assertCanEnter(user, organizationId);
    if (user.platformAdmin) return;
    const membership = await this.database.query(
      `SELECT role FROM organization_memberships
       WHERE user_id = $1 AND organization_id = $2 AND status = 'active'`,
      [user.id, organizationId],
    );
    if (asString(membership[0]?.role) !== 'organization_admin') {
      throw new ForbiddenException('Only a platform administrator can manage organizations.');
    }
  }

  private async selectableClinic(user: AuthUser, organizationId: string, clinicId?: string): Promise<string | null> {
    const rows = await this.database.query(
      `SELECT c.id FROM clinics c
       WHERE c.organization_id = $1
         AND ($2::uuid IS NULL OR c.id = $2::uuid)
         AND (
           $3::boolean
           OR EXISTS (
             SELECT 1 FROM organization_memberships m
             WHERE m.organization_id = c.organization_id AND m.user_id = $4
               AND m.role = 'organization_admin' AND m.status = 'active'
           )
           OR EXISTS (SELECT 1 FROM clinic_access access WHERE access.clinic_id = c.id AND access.user_id = $4)
         )
       ORDER BY c.name
       LIMIT 1`,
      [organizationId, clinicId ?? null, user.platformAdmin, user.id],
    );
    if (clinicId && rows.length === 0) {
      throw new ForbiddenException('You do not have access to that clinic.');
    }
    return rows[0] ? asString(rows[0].id) : null;
  }

  private async grantAcceptedClinics(db: Queryable, organizationId: string, userId: string, role: string): Promise<string | null> {
    const clinics = await db.query<{ id: string }>(
      `SELECT id FROM clinics WHERE organization_id = $1 ORDER BY name`,
      [organizationId],
    );
    if (role === 'organization_admin') {
      return clinics[0] ? asString(clinics[0].id) : null;
    }
    if (clinics.length !== 1) {
      return null;
    }
    await db.query(
      `INSERT INTO clinic_access (organization_id, clinic_id, user_id) VALUES ($1, $2, $3)
       ON CONFLICT (clinic_id, user_id) DO NOTHING`,
      [organizationId, clinics[0]?.id, userId],
    );
    return asString(clinics[0]?.id);
  }

  private clinicDrafts(clinics: ClinicDraft[] | undefined, fallbackName: string, fallbackLocation: string, fallbackEmail: string): Array<{
    name: string;
    location: string;
    address: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
  }> {
    const source = clinics && clinics.length > 0
      ? clinics
      : [{ name: fallbackName, location: fallbackLocation || 'Primary location', contactEmail: fallbackEmail }];
    const seen = new Set<string>();
    return source.map((clinic) => {
      const name = clinic.name.trim();
      const location = clinic.location.trim();
      if (name.length < 2 || name.length > 120) {
        throw new BadRequestException('Enter a clinic name between 2 and 120 characters.');
      }
      if (location.length < 2 || location.length > 160) {
        throw new BadRequestException('Enter a clinic location.');
      }
      if (clinic.address && clinic.address.trim().length > 500) {
        throw new BadRequestException('The clinic address is too long.');
      }
      const key = name.toLowerCase();
      if (seen.has(key)) {
        throw new BadRequestException('Each clinic needs a different name.');
      }
      seen.add(key);
      const email = clinic.contactEmail?.trim() ? normalizeEmail(clinic.contactEmail) : null;
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new BadRequestException('Enter a valid clinic contact email.');
      }
      return {
        name,
        location,
        address: clinic.address?.trim() || null,
        contactEmail: email,
        contactPhone: clinic.contactPhone?.trim() || null,
      };
    });
  }

  private requirePlatformAdmin(user: AuthUser): void {
    if (!user.platformAdmin) {
      throw new ForbiddenException('Only a platform administrator can manage organizations.');
    }
  }

  private requireOrganization(user: AuthUser): string {
    if (!user.organization) {
      throw new ForbiddenException('Create or choose an organization first.');
    }
    return user.organization.id;
  }

  private validateProfile(input: UpdateOrganizationRequest): {
    name: string;
    contactEmail: string;
    contactPhone: string;
    country: string;
    address: string | null;
    companyIdentificationNumber: string | null;
    taxNumber: string | null;
  } {
    const name = input.name.trim();
    if (name.length < 2 || name.length > 120) {
      throw new BadRequestException('Enter an organisation name between 2 and 120 characters.');
    }
    const contactEmail = normalizeEmail(input.contactEmail);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
      throw new BadRequestException('Enter a valid contact email.');
    }
    const contactPhone = input.contactPhone.trim();
    if (contactPhone.length < 3 || contactPhone.length > 30) {
      throw new BadRequestException('Enter a contact phone number.');
    }
    const country = input.country.toUpperCase();
    if (!isCountry(country)) {
      throw new BadRequestException('Choose a valid country.');
    }
    return {
      name,
      contactEmail,
      contactPhone,
      country,
      address: optionalText(input.address, 500),
      companyIdentificationNumber: optionalText(input.companyIdentificationNumber, 40),
      taxNumber: optionalText(input.taxNumber, 40),
    };
  }

  private validateOrganization(input: CreateOrganizationRequest): {
    name: string;
    contactEmail: string;
    contactPhone: string | null;
    country: string;
    address: string | null;
    companyIdentificationNumber: string | null;
    taxNumber: string | null;
    timezone: string;
    locale: string;
    primaryColor: string;
    logoContentType: string | null;
    logoBytes: Buffer | null;
  } {
    const country = input.country.toUpperCase();
    if (!isCountry(country)) {
      throw new BadRequestException('Choose a valid country.');
    }
    if (!isTimezone(input.timezone)) {
      throw new BadRequestException('Choose a valid time zone.');
    }
    if (!LOCALES.includes(input.locale)) {
      throw new BadRequestException('Choose a supported locale.');
    }
    const logo = decodeLogo(input.logoContentType, input.logoBase64);
    return {
      name: input.name.trim(),
      contactEmail: normalizeEmail(input.contactEmail),
      contactPhone: input.contactPhone?.trim() ? input.contactPhone.trim() : null,
      country,
      address: optionalText(input.address, 500),
      companyIdentificationNumber: optionalText(input.companyIdentificationNumber, 40),
      taxNumber: optionalText(input.taxNumber, 40),
      timezone: input.timezone,
      locale: input.locale,
      primaryColor: input.primaryColor.toLowerCase(),
      logoContentType: logo?.contentType ?? null,
      logoBytes: logo?.bytes ?? null,
    };
  }

  private validateInvites(invites: InvitationDraft[]): Array<{ email: string; role: InvitableRole }> {
    const seen = new Set<string>();
    return invites.map((invite) => {
      const email = normalizeEmail(invite.email);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new BadRequestException('Enter a valid email address for each invitation.');
      }
      if (!INVITABLE_ROLES.includes(invite.role)) {
        throw new BadRequestException('Choose a role that can be invited.');
      }
      if (seen.has(email)) {
        throw new BadRequestException('Each invitation needs a different email address.');
      }
      seen.add(email);
      return { email, role: invite.role };
    });
  }
}

function decodeLogo(contentType: string | undefined, base64: string | undefined): { contentType: string; bytes: Buffer } | null {
  if (!contentType && !base64) {
    return null;
  }
  if (!contentType || !base64 || !LOGO_TYPES.has(contentType)) {
    throw new BadRequestException('Upload a PNG, JPEG, or WebP logo up to 512 KB.');
  }
  const encoded = base64.includes(',') ? base64.slice(base64.indexOf(',') + 1) : base64;
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length === 0 || bytes.length > MAX_LOGO_BYTES) {
    throw new BadRequestException('Upload a PNG, JPEG, or WebP logo up to 512 KB.');
  }
  return { contentType, bytes };
}

function optionalText(value: string | undefined, maxLength: number): string | null {
  const text = value?.trim() ?? '';
  if (!text) return null;
  if (text.length > maxLength) {
    throw new BadRequestException('One of the optional organisation details is too long.');
  }
  return text;
}

function positiveInteger(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function isCountry(code: string): boolean {
  if (!/^[A-Z]{2}$/.test(code)) {
    return false;
  }
  const name = new Intl.DisplayNames(['en'], { type: 'region' }).of(code);
  return Boolean(name) && name !== code;
}

function isTimezone(value: string): boolean {
  const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('timeZone');
  return Array.isArray(supported) && supported.includes(value);
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  if ('code' in error && (error as { code?: string }).code === '23505') {
    return true;
  }
  const message = error instanceof Error ? error.message : '';
  return message.includes('duplicate key') || message.includes('invitations_one_pending_email');
}
