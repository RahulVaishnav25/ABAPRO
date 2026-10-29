CREATE TABLE IF NOT EXISTS firestore_documents (
  collection_id text NOT NULL,
  document_id text NOT NULL,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (collection_id, document_id)
);
