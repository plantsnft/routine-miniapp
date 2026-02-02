-- Basketball Mini App - Grant PostgREST Permissions for basketball Schema
-- 
-- IMPORTANT: This migration grants permissions to PostgREST roles (anon, authenticated, service_role)
-- so that PostgREST can access the basketball schema via Accept-Profile headers.
--
-- This must be run AFTER:
-- 1. The basketball schema exists (supabase_migration_basketball_schema.sql)
-- 2. The basketball schema is added to "Exposed schemas" in Supabase Dashboard → Settings → API
--
-- Run this in Supabase SQL Editor for the "Catwalk Ai Agent" project

-- Grant usage on schema to PostgREST roles
GRANT USAGE ON SCHEMA basketball TO anon, authenticated, service_role;

-- Grant permissions on all existing tables
GRANT ALL ON ALL TABLES IN SCHEMA basketball TO anon, authenticated, service_role;

-- Grant permissions on all sequences (for auto-increment/UUID generation)
GRANT ALL ON ALL SEQUENCES IN SCHEMA basketball TO anon, authenticated, service_role;

-- Grant permissions on all functions/routines (if any exist)
GRANT ALL ON ALL ROUTINES IN SCHEMA basketball TO anon, authenticated, service_role;

-- Set default privileges for future tables (so new tables automatically get permissions)
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA basketball 
  GRANT ALL ON TABLES TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA basketball 
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA basketball 
  GRANT ALL ON ROUTINES TO anon, authenticated, service_role;

-- Verify permissions were granted (optional - for debugging)
-- SELECT grantee, privilege_type 
-- FROM information_schema.role_table_grants 
-- WHERE table_schema = 'basketball' 
--   AND grantee IN ('anon', 'authenticated', 'service_role')
-- LIMIT 10;
