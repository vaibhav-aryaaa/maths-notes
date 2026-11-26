-- ==============================================================================
-- Supabase Security Advisor Fixes
-- Run this script in the Supabase Dashboard SQL Editor:
-- https://supabase.com/dashboard/project/_/sql
-- ==============================================================================

-- 1. Enable Row Level Security (RLS) on all public tables
ALTER TABLE IF EXISTS public.folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.canvases ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.history ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.shares ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies to prevent conflicts on re-run
DROP POLICY IF EXISTS "Users can manage own folders" ON public.folders;
DROP POLICY IF EXISTS "Users can manage own canvases" ON public.canvases;
DROP POLICY IF EXISTS "Users can manage own history" ON public.history;
DROP POLICY IF EXISTS "Anyone can read shares" ON public.shares;
DROP POLICY IF EXISTS "Anyone can create shares" ON public.shares;

-- 3. Row Level Security Policies for Folders
-- Users can only SELECT, INSERT, UPDATE, DELETE their own folders
CREATE POLICY "Users can manage own folders"
ON public.folders
FOR ALL
TO authenticated
USING (auth.uid()::text = user_id)
WITH CHECK (auth.uid()::text = user_id);

-- 4. Row Level Security Policies for Canvases
-- Users can only SELECT, INSERT, UPDATE, DELETE their own canvases
CREATE POLICY "Users can manage own canvases"
ON public.canvases
FOR ALL
TO authenticated
USING (auth.uid()::text = user_id)
WITH CHECK (auth.uid()::text = user_id);

-- 5. Row Level Security Policies for History
-- Users can only SELECT, INSERT, UPDATE, DELETE their own solve history
CREATE POLICY "Users can manage own history"
ON public.history
FOR ALL
TO authenticated
USING (auth.uid()::text = user_id)
WITH CHECK (auth.uid()::text = user_id);

-- 6. Row Level Security Policies for Shares
-- Anyone (authenticated or guest/anon) can view a public share link
CREATE POLICY "Anyone can read shares"
ON public.shares
FOR SELECT
TO anon, authenticated
USING (true);

-- Anyone can generate a share link
CREATE POLICY "Anyone can create shares"
ON public.shares
FOR INSERT
TO anon, authenticated
WITH CHECK (true);
