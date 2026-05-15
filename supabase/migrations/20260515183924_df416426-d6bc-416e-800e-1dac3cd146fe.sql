-- Create property_status enum if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'property_status') THEN
        CREATE TYPE property_status AS ENUM ('active', 'pending', 'deactivated');
    END IF;
END $$;

-- Add new columns to properties table
ALTER TABLE public.properties 
ADD COLUMN IF NOT EXISTS complement TEXT,
ADD COLUMN IF NOT EXISTS neighborhood TEXT,
ADD COLUMN IF NOT EXISTS block_number TEXT,
ADD COLUMN IF NOT EXISTS street_name TEXT,
ADD COLUMN IF NOT EXISTS reference TEXT,
ADD COLUMN IF NOT EXISTS container_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS observations TEXT,
ADD COLUMN IF NOT EXISTS is_abandoned BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS is_frequently_closed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS had_previous_focus BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS status property_status DEFAULT 'active',
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Enable RLS
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts and recreate them
DROP POLICY IF EXISTS "Users can view all properties" ON public.properties;
DROP POLICY IF EXISTS "Users can insert their own properties" ON public.properties;
DROP POLICY IF EXISTS "Users can update their own properties" ON public.properties;
DROP POLICY IF EXISTS "Users can delete their own properties" ON public.properties;

-- Create policies
CREATE POLICY "Users can view all properties" ON public.properties FOR SELECT USING (true);
CREATE POLICY "Users can insert their own properties" ON public.properties FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own properties" ON public.properties FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own properties" ON public.properties FOR DELETE USING (auth.uid() = user_id);
