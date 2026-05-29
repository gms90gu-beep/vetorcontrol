-- Add is_block_end to properties
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS is_block_end BOOLEAN DEFAULT FALSE;

-- Create storage bucket for block reports
INSERT INTO storage.buckets (id, name, public) 
VALUES ('block-reports', 'block-reports', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for block-reports
CREATE POLICY "Block reports are publicly accessible" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'block-reports');

CREATE POLICY "Authenticated users can upload block reports" 
ON storage.objects FOR INSERT 
TO authenticated 
WITH CHECK (bucket_id = 'block-reports');

CREATE POLICY "Authenticated users can update block reports" 
ON storage.objects FOR UPDATE 
TO authenticated 
USING (bucket_id = 'block-reports');

CREATE POLICY "Authenticated users can delete block reports" 
ON storage.objects FOR DELETE 
TO authenticated 
USING (bucket_id = 'block-reports');
