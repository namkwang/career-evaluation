-- Function to list all users from auth.users (callable via supabase.rpc)
-- Only accessible with service_role key
CREATE OR REPLACE FUNCTION public.get_all_users()
RETURNS TABLE (
  id UUID,
  email TEXT,
  raw_user_meta_data JSONB,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id, email::text, raw_user_meta_data, created_at
  FROM auth.users
  ORDER BY created_at DESC;
$$;

-- Only service_role can call this function
REVOKE ALL ON FUNCTION public.get_all_users() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_all_users() FROM authenticated;
REVOKE ALL ON FUNCTION public.get_all_users() FROM anon;
