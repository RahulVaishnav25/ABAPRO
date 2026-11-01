import type { Queryable } from '../db/database';

/**
 * Small JSON documents kept in firestore_documents, keyed by collection and id. Used for branding and for regional
 * preferences, which sit outside the tenant tables.
 */
export async function getDocument<T>(db: Queryable, collectionId: string, documentId: string): Promise<T | null> {
  const rows = await db.query<{ data: unknown }>(
    `SELECT data FROM firestore_documents WHERE collection_id = $1 AND document_id = $2`,
    [collectionId, documentId],
  );
  const row = rows[0];
  if (!row) return null;
  return (typeof row.data === 'string' ? JSON.parse(row.data) : row.data) as T;
}

export async function setDocument(db: Queryable, collectionId: string, documentId: string, data: object): Promise<void> {
  await db.query(
    `INSERT INTO firestore_documents (collection_id, document_id, data, updated_at)
     VALUES ($1, $2, $3::jsonb, now())
     ON CONFLICT (collection_id, document_id)
     DO UPDATE SET data = $3::jsonb, updated_at = now()`,
    [collectionId, documentId, JSON.stringify(data)],
  );
}

export async function deleteDocument(db: Queryable, collectionId: string, documentId: string): Promise<void> {
  await db.query(`DELETE FROM firestore_documents WHERE collection_id = $1 AND document_id = $2`, [collectionId, documentId]);
}
