import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  DEFAULT_ORGANIZATION_BRANDING,
  DEFAULT_PLATFORM_BRANDING,
  PERMISSIONS,
  type AuthUser,
  type OrganizationBranding,
  type PlatformBranding,
} from '@abapro/shared';
import { DATABASE } from '../db/database.module';
import type { Database } from '../db/database';
import type { UpdateOrganizationBrandingDto, UpdatePlatformBrandingDto } from './branding.dto';

const BRANDING_COLLECTION = 'branding';
const PLATFORM_DOC_ID = 'platform';

@Injectable()
export class BrandingService {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  /**
   * Reads a document from the Firestore-backed branding collection.
   */
  private async getFirestoreDocument<T>(collectionId: string, documentId: string): Promise<T | null> {
    const rows = await this.database.query(
      `SELECT data FROM firestore_documents WHERE collection_id = $1 AND document_id = $2`,
      [collectionId, documentId],
    );
    if (!rows || rows.length === 0) return null;
    const row = rows[0];
    return (typeof row.data === 'string' ? JSON.parse(row.data) : row.data) as T;
  }

  /**
   * Writes a document to the Firestore-backed branding collection.
   */
  private async setFirestoreDocument<T extends Record<string, unknown>>(
    collectionId: string,
    documentId: string,
    data: T,
  ): Promise<void> {
    const jsonData = JSON.stringify(data);
    await this.database.query(
      `INSERT INTO firestore_documents (collection_id, document_id, data, updated_at)
       VALUES ($1, $2, $3::jsonb, now())
       ON CONFLICT (collection_id, document_id)
       DO UPDATE SET data = $3::jsonb, updated_at = now()`,
      [collectionId, documentId, jsonData],
    );
  }

  /**
   * Deletes a document from the Firestore-backed branding collection.
   */
  private async deleteFirestoreDocument(collectionId: string, documentId: string): Promise<void> {
    await this.database.query(
      `DELETE FROM firestore_documents WHERE collection_id = $1 AND document_id = $2`,
      [collectionId, documentId],
    );
  }

  /**
   * Retrieves platform branding from Firestore.
   */
  async getPlatformBranding(): Promise<PlatformBranding> {
    const doc = await this.getFirestoreDocument<PlatformBranding>(BRANDING_COLLECTION, PLATFORM_DOC_ID);
    if (!doc) {
      return { ...DEFAULT_PLATFORM_BRANDING };
    }
    return {
      portalName: doc.portalName || DEFAULT_PLATFORM_BRANDING.portalName,
      logoUrl: doc.logoUrl || '',
      faviconUrl: doc.faviconUrl || '',
      primaryColor: doc.primaryColor || DEFAULT_PLATFORM_BRANDING.primaryColor,
      secondaryColor: doc.secondaryColor || DEFAULT_PLATFORM_BRANDING.secondaryColor,
      loginHeadline: doc.loginHeadline || DEFAULT_PLATFORM_BRANDING.loginHeadline,
      loginSubtitle: doc.loginSubtitle || DEFAULT_PLATFORM_BRANDING.loginSubtitle,
      updatedAt: doc.updatedAt,
    };
  }

  /**
   * Updates platform branding in Firestore. Only Super Admins can call this.
   */
  async updatePlatformBranding(user: AuthUser, dto: UpdatePlatformBrandingDto): Promise<PlatformBranding> {
    this.requireSuperAdmin(user);
    const existing = await this.getPlatformBranding();
    const data: PlatformBranding = {
      portalName: dto.portalName !== undefined && dto.portalName.trim() ? dto.portalName.trim() : existing.portalName,
      logoUrl: dto.logoUrl !== undefined ? dto.logoUrl.trim() : existing.logoUrl,
      faviconUrl: dto.faviconUrl !== undefined ? dto.faviconUrl.trim() : existing.faviconUrl,
      primaryColor: dto.primaryColor !== undefined && dto.primaryColor.trim() ? dto.primaryColor.trim() : existing.primaryColor,
      secondaryColor: dto.secondaryColor !== undefined && dto.secondaryColor.trim() ? dto.secondaryColor.trim() : existing.secondaryColor,
      loginHeadline: dto.loginHeadline !== undefined && dto.loginHeadline.trim() ? dto.loginHeadline.trim() : existing.loginHeadline,
      loginSubtitle: dto.loginSubtitle !== undefined && dto.loginSubtitle.trim() ? dto.loginSubtitle.trim() : existing.loginSubtitle,
      updatedAt: new Date().toISOString(),
    };

    await this.setFirestoreDocument(BRANDING_COLLECTION, PLATFORM_DOC_ID, data as unknown as Record<string, unknown>);
    return data;
  }

  /**
   * Resets platform branding in Firestore to defaults. Only Super Admins can call this.
   */
  async resetPlatformBranding(user: AuthUser): Promise<PlatformBranding> {
    this.requireSuperAdmin(user);
    await this.deleteFirestoreDocument(BRANDING_COLLECTION, PLATFORM_DOC_ID);
    return { ...DEFAULT_PLATFORM_BRANDING };
  }

  /**
   * Retrieves organization branding from Firestore.
   */
  async getOrganizationBranding(user: AuthUser, organizationId: string): Promise<OrganizationBranding | null> {
    this.requireOrganizationAccess(user, organizationId);
    const docId = `org_${organizationId}`;
    const doc = await this.getFirestoreDocument<OrganizationBranding>(BRANDING_COLLECTION, docId);
    if (!doc) return null;
    return {
      organizationId,
      portalName: doc.portalName || '',
      logoUrl: doc.logoUrl || '',
      faviconUrl: doc.faviconUrl || '',
      primaryColor: doc.primaryColor || DEFAULT_ORGANIZATION_BRANDING.primaryColor,
      secondaryColor: doc.secondaryColor || DEFAULT_ORGANIZATION_BRANDING.secondaryColor,
      updatedAt: doc.updatedAt,
    };
  }

  /**
   * Updates organization branding in Firestore. Only authorized Organisation Admins can call this.
   */
  async updateOrganizationBranding(
    user: AuthUser,
    organizationId: string,
    dto: UpdateOrganizationBrandingDto,
  ): Promise<OrganizationBranding> {
    this.requireOrganizationAdmin(user, organizationId);
    const docId = `org_${organizationId}`;
    const data: OrganizationBranding = {
      organizationId,
      portalName: dto.portalName !== undefined ? dto.portalName.trim() : '',
      logoUrl: dto.logoUrl !== undefined ? dto.logoUrl.trim() : '',
      faviconUrl: dto.faviconUrl !== undefined ? dto.faviconUrl.trim() : '',
      primaryColor: dto.primaryColor !== undefined ? dto.primaryColor.trim() : DEFAULT_ORGANIZATION_BRANDING.primaryColor,
      secondaryColor: dto.secondaryColor !== undefined ? dto.secondaryColor.trim() : DEFAULT_ORGANIZATION_BRANDING.secondaryColor,
      updatedAt: new Date().toISOString(),
    };

    await this.setFirestoreDocument(BRANDING_COLLECTION, docId, data as unknown as Record<string, unknown>);
    return data;
  }

  /**
   * Resets organization branding in Firestore to defaults.
   */
  async resetOrganizationBranding(user: AuthUser, organizationId: string): Promise<OrganizationBranding> {
    this.requireOrganizationAdmin(user, organizationId);
    const docId = `org_${organizationId}`;
    await this.deleteFirestoreDocument(BRANDING_COLLECTION, docId);
    return {
      organizationId,
      ...DEFAULT_ORGANIZATION_BRANDING,
    };
  }

  private requireSuperAdmin(user: AuthUser): void {
    if (!user.platformAdmin) {
      throw new ForbiddenException('Only a Super Admin (Platform Administrator) can modify platform branding.');
    }
  }

  private requireOrganizationAccess(user: AuthUser, organizationId: string): void {
    if (user.platformAdmin) return;
    if (user.organization?.id === organizationId) return;
    throw new ForbiddenException('You do not have access to this organization.');
  }

  private requireOrganizationAdmin(user: AuthUser, organizationId: string): void {
    if (user.platformAdmin) return;
    if (
      user.organization?.id === organizationId &&
      (user.role === 'organization_admin' || user.permissions.includes(PERMISSIONS.settingsManage))
    ) {
      return;
    }
    throw new ForbiddenException('Only an authorized Organisation Administrator can modify organisation branding.');
  }
}
