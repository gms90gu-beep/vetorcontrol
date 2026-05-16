CREATE TABLE public.rg_ocr_imports (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    image_url TEXT NOT NULL,
    raw_ocr_data JSONB,
    processed_data JSONB,
    block_number TEXT,
    street_name TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.rg_ocr_imports ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own OCR imports"
ON public.rg_ocr_imports FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own OCR imports"
ON public.rg_ocr_imports FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own OCR imports"
ON public.rg_ocr_imports FOR UPDATE
USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_rg_ocr_imports_updated_at
BEFORE UPDATE ON public.rg_ocr_imports
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket for RG OCR images
INSERT INTO storage.buckets (id, name, public) VALUES ('rg-ocr', 'rg-ocr', true);

CREATE POLICY "RG OCR images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'rg-ocr');

CREATE POLICY "Users can upload RG OCR images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'rg-ocr' AND auth.uid()::text = (storage.foldername(name))[1]);
