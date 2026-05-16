-- Create table for RG PDF export history
CREATE TABLE IF NOT EXISTS public.rg_pdf_exports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    filter_type TEXT NOT NULL, -- 'all', 'block', 'street', 'cycle', 'area'
    filter_value TEXT, -- e.g. "001", "Rua das Flores"
    metadata JSONB DEFAULT '{}'::jsonb, -- Store totals (residences, etc) and agent info at time of generation
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.rg_pdf_exports ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own exports"
ON public.rg_pdf_exports
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own exports"
ON public.rg_pdf_exports
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Storage bucket for PDFs (if we decide to upload them)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('rg-pdfs', 'rg-pdfs', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Users can view their own PDFs"
ON storage.objects
FOR SELECT
USING (bucket_id = 'rg-pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload their own PDFs"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'rg-pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);
