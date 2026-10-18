# Bucket `signed-bulletins`

The private bucket already exists in Lovable Cloud. Before deploying the bulletin archive, edit its settings through the Lovable Cloud Storage interface and verify:

- Name / ID: `signed-bulletins`
- Public access: disabled
- Maximum file size: 20 MiB
- Allowed MIME type: `application/pdf`

The database migrations intentionally do not write to `storage.buckets`. They create access policies on `storage.objects`; the upload policy requires the `.pdf` suffix and declared `application/pdf` MIME type. The app also checks the PDF header before upload. Bucket configuration is managed by Lovable Cloud.

Set **Allowed MIME type** to `application/pdf` on the existing bucket and save. This bucket setting is managed by Lovable Cloud; do not try to change it through SQL. Verify all settings in the project connected to production backend `ttjzgszxrnmcsygtzfcu`. Do not configure a different Supabase project.
