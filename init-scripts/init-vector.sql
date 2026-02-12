-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Table equivalent to Qdrant collection "illinois-chat-qwen"
-- Vector size: 4096 (matching Qdrant collection)
-- Distance: Cosine (pgvector uses <=> operator for cosine distance)
CREATE TABLE IF NOT EXISTS embeddings (
  id BIGSERIAL PRIMARY KEY,
  -- Vector embedding with 4096 dimensions (matching Qdrant collection)
  embedding VECTOR(4096) NOT NULL,
  -- Metadata fields similar to Qdrant payload
  content TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Note: pgvector HNSW index supports max 2000 dimensions; our vectors are 4096.
-- Cosine search still works using the <=> operator (sequential scan).
-- If you use smaller vectors (<=2000), you can add:
--   CREATE INDEX ... ON embeddings USING hnsw (embedding vector_cosine_ops);

-- Create GIN index for JSONB metadata queries
CREATE INDEX IF NOT EXISTS embeddings_metadata_idx ON embeddings 
USING gin (metadata);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update updated_at
CREATE TRIGGER update_embeddings_updated_at BEFORE UPDATE ON embeddings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
