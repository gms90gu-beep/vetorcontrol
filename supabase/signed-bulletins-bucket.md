# Bucket `signed-bulletins`

Create this bucket through the Lovable Cloud Storage interface before deploying the bulletin archive:

- Name / ID: `signed-bulletins`
- Public access: disabled
- Maximum file size: 20 MiB
- Allowed MIME type: `application/pdf`

The database migration intentionally does not write to `storage.buckets`. It creates the access policies on `storage.objects`; bucket configuration is managed by Lovable Cloud.

After creating the bucket, verify these settings in the project connected to the production backend `ttjzgszxrnmcsygtzfcu`. Do not create or configure it in a different Supabase project.
