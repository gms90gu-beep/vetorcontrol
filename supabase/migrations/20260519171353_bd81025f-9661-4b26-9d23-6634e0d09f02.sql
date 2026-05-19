-- Add missing columns for RG functionality
ALTER TABLE public.properties 
ADD COLUMN IF NOT EXISTS side TEXT,
ADD COLUMN IF NOT EXISTS sequence INTEGER,
ADD COLUMN IF NOT EXISTS inhabitants INTEGER DEFAULT 0;

-- Create an index for sequence to help with ordering in the bulletin
CREATE INDEX IF NOT EXISTS idx_properties_sequence ON public.properties (sequence);
