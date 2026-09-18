import fs from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);
const pkg = JSON.parse(fs.readFileSync(new URL('package.json', root), 'utf8'));
const sql = fs.readFileSync(new URL('../../../OUTSIDE_REPO/SQL/ALL_IN_ONE.sql', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('src/data/shared-asset-api.js', root), 'utf8');
const admin = fs.readFileSync(new URL('src/bootstrap/admin-workspace-bootstrap.js', root), 'utf8');
const workspace = fs.readFileSync(new URL('src/bootstrap/admin-asset-workspace.js', root), 'utf8');

function blockAfter(marker, end = ');') {
  const start = sql.indexOf(marker);
  assert.ok(start >= 0, `missing SQL marker: ${marker}`);
  const finish = sql.indexOf(end, start);
  assert.ok(finish >= 0, `unterminated SQL block: ${marker}`);
  return sql.slice(start, finish + end.length);
}

assert.equal(pkg.version, '0.14.4-v14-4-7-8-mobile-debug-ui-removal');
assert.ok(!sql.includes('can_remove_prepared_shared_asset_storage_path'));
assert.ok(!sql.includes('shared_assets_prepared_delete_select'));
assert.ok(!sql.includes('gallery_artworks_prepared_shared_asset_delete_select'));

const publicSelect = blockAfter('create policy "gallery_artworks_public_select"');
assert.ok(publicSelect.includes('for select to anon'));
assert.ok(publicSelect.includes('can_read_exhibition_artwork_path(name)'));
assert.ok(!publicSelect.includes('can_edit_exhibition_artwork_path'));
assert.ok(!publicSelect.includes('can_delete_shared_asset_storage_path'));

const authenticatedSelectStart = sql.lastIndexOf('create policy "gallery_artworks_authenticated_select"');
assert.ok(authenticatedSelectStart >= 0);
const authenticatedSelect = sql.slice(authenticatedSelectStart, sql.indexOf(');', authenticatedSelectStart) + 2);
assert.ok(authenticatedSelect.includes('for select to authenticated'));
assert.ok(authenticatedSelect.includes('can_read_exhibition_artwork_path(name)'));
assert.ok(authenticatedSelect.includes('can_edit_exhibition_artwork_path(name)'));
assert.ok(authenticatedSelect.includes('can_delete_shared_asset_storage_path(bucket_id,name)'));

const galleryDeleteStart = sql.lastIndexOf('create policy "gallery_artworks_canonical_delete"');
const galleryDelete = sql.slice(galleryDeleteStart, sql.indexOf(');', galleryDeleteStart) + 2);
assert.ok(galleryDelete.includes('for delete to authenticated'));
assert.ok(galleryDelete.includes('can_delete_shared_asset_storage_path(bucket_id,name)'));

const sharedSelectStart = sql.lastIndexOf('create policy "shared_assets_editor_select"');
const sharedSelect = sql.slice(sharedSelectStart, sql.indexOf(');', sharedSelectStart) + 2);
assert.ok(sharedSelect.includes('for select to authenticated'));
assert.ok(sharedSelect.includes('can_delete_shared_asset_storage_path(bucket_id,name)'));

assert.ok(sql.includes('revoke all on function public.can_delete_shared_asset_storage_path(text,text,uuid) from public,anon,authenticated;'));
assert.ok(sql.includes('grant execute on function public.can_delete_shared_asset_storage_path(text,text,uuid) to authenticated;'));
assert.ok(!admin.includes('preparedStorageSupabase'));
assert.ok(!workspace.includes('preparedStorageSupabase'));
assert.ok(!api.includes('preparedStorageClient'));
assert.ok(api.includes('removeStorageItemsOrThrow(supabase'));

console.log('V14.4.7.5 Storage role/policy contract regression passed.');
