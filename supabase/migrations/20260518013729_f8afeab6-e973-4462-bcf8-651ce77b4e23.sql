-- Create the rg_uploads table
CREATE TABLE IF NOT EXISTS public.rg_uploads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    image_url TEXT NOT NULL,
    extracted_data JSONB,
    status TEXT DEFAULT 'pending', -- pending, processed, confirmed, error
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.rg_uploads ENABLE ROW LEVEL SECURITY;

-- Policies for rg_uploads
CREATE POLICY "Users can view their own rg_uploads"
ON public.rg_uploads
FOR SELECT
USING (auth.uid() = agent_id);

CREATE POLICY "Users can insert their own rg_uploads"
ON public.rg_uploads
FOR INSERT
WITH CHECK (auth.uid() = agent_id);

CREATE POLICY "Users can update their own rg_uploads"
ON public.rg_uploads
FOR UPDATE
USING (auth.uid() = agent_id);

-- Create storage bucket for RG OCR photos if it doesn't exist
INSERT INTO storage.buckets (id, name, public) 
VALUES ('rg-ocr', 'rg-ocr', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for rg-ocr bucket
CREATE POLICY "RG OCR photos are accessible by owner"
ON storage.objects
FOR SELECT
USING (bucket_id = 'rg-ocr' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload RG OCR photos"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'rg-ocr' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_rg_uploads_updated_at
BEFORE UPDATE ON public.rg_uploads
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();
