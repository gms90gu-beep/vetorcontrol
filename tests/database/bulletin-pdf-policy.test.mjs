import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const sql = readFileSync(new URL('../../drizzle/migrations/0020_enforce_bulletin_pdf_upload.sql', import.meta.url), 'utf8');

test('signed bulletin uploads require the pdf extension', () => {
  assert.match(sql, /and storage\.extension\(name\) = 'pdf'/);
});

test('signed bulletin uploads require declared application/pdf MIME', () => {
  assert.match(sql, /and lower\(coalesce\(metadata ->> 'mimetype', ''\)\) = 'application\/pdf'/);
});

test('signed bulletin uploads are authenticated and use the caller folder', () => {
  assert.match(sql, /on storage\.objects for insert to authenticated/);
  assert.match(sql, /and \(storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)\)::text/);
});

test('signed bulletin uploads require the matching pending bulletin owned by the caller', () => {
  assert.match(sql, /from public\.signed_bulletin_archive a\s+where a\.storage_path = name\s+and a\.agent_profile_id = \(select auth\.uid\(\)\)\s+and a\.status = 'pending'/);
});