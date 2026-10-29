import { BadRequestException } from '@nestjs/common';
import type { Queryable } from '../db/database';

export type ChangeRecordType = 'assessment' | 'program' | 'target' | 'session' | 'observation';

export interface ChangeReason {
  organizationId: string;
  recordType: ChangeRecordType;
  recordId: string;
  reason: string;
  userId: string;
}

/** Returns the trimmed reason, or rejects one too short to explain a clinical change. */
export function requireReason(reason: string | undefined): string {
  const text = reason?.trim() ?? '';
  if (text.length < 12) {
    throw new BadRequestException('Enter a reason of at least 12 characters for this clinical change.');
  }
  return text;
}

export async function recordChangeReason(db: Queryable, change: ChangeReason): Promise<void> {
  await db.query(
    `INSERT INTO clinical_change_reasons (organization_id, record_type, record_id, reason, created_by)
     VALUES ($1, $2, $3, $4, $5)`,
    [change.organizationId, change.recordType, change.recordId, change.reason, change.userId],
  );
}
