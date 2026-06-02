
-- Restrict realtime channel subscriptions to authenticated users
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='realtime' AND table_name='messages') THEN
    EXECUTE 'ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY';
    BEGIN
      EXECUTE 'CREATE POLICY "Authenticated can receive realtime" ON realtime.messages FOR SELECT TO authenticated USING (true)';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;
