
-- Restrict policies from public to authenticated, preserving filters.

-- visits: drop duplicate INSERT policy (public role); keep "Agents can insert visits" (authenticated)
DROP POLICY IF EXISTS "Users can insert their own visits" ON public.visits;

-- weekly_bulletins
DROP POLICY IF EXISTS "Users can insert their own bulletins" ON public.weekly_bulletins;
DROP POLICY IF EXISTS "Users can view their own bulletins" ON public.weekly_bulletins;
CREATE POLICY "Users can insert their own bulletins" ON public.weekly_bulletins
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = agent_id);
CREATE POLICY "Users can view their own bulletins" ON public.weekly_bulletins
  FOR SELECT TO authenticated USING (auth.uid() = agent_id);

-- daily_work_records
DROP POLICY IF EXISTS "Agents can insert their own records" ON public.daily_work_records;
DROP POLICY IF EXISTS "Agents can update their own records" ON public.daily_work_records;
CREATE POLICY "Agents can insert their own records" ON public.daily_work_records
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.agents WHERE agents.id = daily_work_records.agent_id AND agents.profile_id = auth.uid()));
CREATE POLICY "Agents can update their own records" ON public.daily_work_records
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.agents WHERE agents.id = daily_work_records.agent_id AND agents.profile_id = auth.uid()));

-- field_work_sessions
DROP POLICY IF EXISTS "Users can create their own field work sessions" ON public.field_work_sessions;
DROP POLICY IF EXISTS "Users can view their own field work sessions" ON public.field_work_sessions;
DROP POLICY IF EXISTS "Users can update their own field work sessions" ON public.field_work_sessions;
CREATE POLICY "Users can create their own field work sessions" ON public.field_work_sessions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view their own field work sessions" ON public.field_work_sessions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own field work sessions" ON public.field_work_sessions
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- rg_ocr_imports
DROP POLICY IF EXISTS "Users can insert their own OCR imports" ON public.rg_ocr_imports;
DROP POLICY IF EXISTS "Users can view their own OCR imports" ON public.rg_ocr_imports;
DROP POLICY IF EXISTS "Users can update their own OCR imports" ON public.rg_ocr_imports;
CREATE POLICY "Users can insert their own OCR imports" ON public.rg_ocr_imports
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view their own OCR imports" ON public.rg_ocr_imports
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own OCR imports" ON public.rg_ocr_imports
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- rg_uploads
DROP POLICY IF EXISTS "Users can insert their own rg_uploads" ON public.rg_uploads;
DROP POLICY IF EXISTS "Users can view their own rg_uploads" ON public.rg_uploads;
DROP POLICY IF EXISTS "Users can update their own rg_uploads" ON public.rg_uploads;
CREATE POLICY "Users can insert their own rg_uploads" ON public.rg_uploads
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = agent_id);
CREATE POLICY "Users can view their own rg_uploads" ON public.rg_uploads
  FOR SELECT TO authenticated USING (auth.uid() = agent_id);
CREATE POLICY "Users can update their own rg_uploads" ON public.rg_uploads
  FOR UPDATE TO authenticated USING (auth.uid() = agent_id);

-- rg_pdf_exports
DROP POLICY IF EXISTS "Users can create their own exports" ON public.rg_pdf_exports;
DROP POLICY IF EXISTS "Users can view their own exports" ON public.rg_pdf_exports;
CREATE POLICY "Users can create their own exports" ON public.rg_pdf_exports
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view their own exports" ON public.rg_pdf_exports
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- vehicles
DROP POLICY IF EXISTS "Users can create their own vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Users can view their own vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Users can update their own vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Users can delete their own vehicles" ON public.vehicles;
CREATE POLICY "Users can create their own vehicles" ON public.vehicles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view their own vehicles" ON public.vehicles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own vehicles" ON public.vehicles
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own vehicles" ON public.vehicles
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Storage: owner-scoped UPDATE/DELETE for rg-ocr and rg-pdfs
CREATE POLICY "rg-ocr owner update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'rg-ocr' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "rg-ocr owner delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'rg-ocr' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "rg-pdfs owner update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'rg-pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "rg-pdfs owner delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'rg-pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);
