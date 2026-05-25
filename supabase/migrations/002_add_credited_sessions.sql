-- Add credited_stripe_sessions tracking to profiles table
-- This prevents double-crediting the same checkout session

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS credited_stripe_sessions text[] DEFAULT '{}';

-- Create index for better performance on RLS checks
CREATE INDEX IF NOT EXISTS idx_profiles_id ON public.profiles(id);
