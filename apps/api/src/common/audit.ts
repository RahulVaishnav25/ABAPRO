import type { Queryable } from '../db/database';

export interface AuditEvent {
  organizationId?: string | null;
  actorUserId?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function recordAudit(db: Queryable, event: AuditEvent): Promise<void> {
  await db.query(
    `INSERT INTO audit_events (organization_id, actor_user_id, action, target_type, target_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      event.organizationId ?? null,
      event.actorUserId ?? null,
      event.action,
      event.targetType ?? null,
      event.targetId ?? null,
      JSON.stringify(event.metadata ?? {}),
    ],
  );
}
