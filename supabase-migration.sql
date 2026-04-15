-- Add user_id column to applicants table
ALTER TABLE career.applicants ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Create index for faster user-based queries
CREATE INDEX IF NOT EXISTS idx_applicants_user_id ON career.applicants(user_id);

-- Enable RLS (optional, since we filter in API)
-- ALTER TABLE career.applicants ENABLE ROW LEVEL SECURITY;
