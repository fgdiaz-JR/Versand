-- Perfil de autorización asociado a Supabase Auth. El rol se administra solo
-- desde el backend y no se toma de user_metadata enviado por el cliente.
CREATE TABLE IF NOT EXISTS public.app_user_profiles (
  auth_user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('buyer', 'operator')),
  customer_id varchar(50),
  display_name varchar(120) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_user_profiles_role_customer_check CHECK (
    (role = 'buyer' AND customer_id IS NOT NULL) OR
    (role = 'operator' AND customer_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_app_user_profiles_customer_id
  ON public.app_user_profiles (customer_id)
  WHERE customer_id IS NOT NULL;

ALTER TABLE public.app_user_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.app_user_profiles FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.app_user_profiles TO service_role;
