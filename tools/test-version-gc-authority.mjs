import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createSharedAssetApi } from '../src/data/shared-asset-api.js';
import { createGalleryManagementApi } from '../src/data/gallery-management-api.js';

const root = new URL('../', import.meta.url);
const pkg = JSON.parse(fs.readFileSync(new URL('package.json', root), 'utf8'));
const sql = fs.readFileSync(new URL('../../../OUTSIDE_REPO/SQL/ALL_IN_ONE.sql', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../../../OUTSIDE_REPO/SQL/ARCHIVE/V14_4_4_SHARED_ASSET_GALLERY_VERSION_GC_AUTHORITY_DEPLOYED.sql', import.meta.url), 'utf8');
const sharedApiText = fs.readFileSync(new URL('../src/data/shared-asset-api.js', import.meta.url), 'utf8');
const galleryApiText = fs.readFileSync(new URL('../src/data/gallery-management-api.js', import.meta.url), 'utf8');

assert.equal(pkg.version, '0.14.4-v14-4-7-8-mobile-debug-ui-removal');
for (const text of [sql, migration]) {
  assert.ok(text.includes('gc_eligible_after'));
  assert.ok(text.includes('gc_pending_at'));
  assert.ok(text.includes("interval '7 days'"));
  assert.ok(text.includes('exact_version_required'));
  assert.ok(text.includes('admin_prepare_shared_asset_version_gc'));
  assert.ok(text.includes('admin_finalize_shared_asset_version_gc'));
  assert.ok(text.includes('admin_prepare_venue_version_gc'));
  assert.ok(text.includes('admin_finalize_venue_version_gc'));
  assert.ok(text.includes('Gallery Version is a current Published/Draft/Previous pointer'));
  assert.ok(text.includes('unresolved legacy exact-version reference(s)'));
  assert.ok(text.includes('other.venue_version_id<>vv.id'));
  assert.ok(text.includes('Storage API'));
  assert.ok(!text.includes('delete from storage.objects'));
}
assert.ok(sharedApiText.includes('admin_prepare_shared_asset_version_gc'));
assert.ok(sharedApiText.includes('admin_finalize_shared_asset_version_gc'));
assert.ok(galleryApiText.includes('admin_prepare_venue_version_gc'));
assert.ok(galleryApiText.includes('admin_finalize_venue_version_gc'));

function fakeSupabase(kind) {
  const calls = [];
  const storageRemovals = [];
  return {
    calls,
    storageRemovals,
    async rpc(name, args) {
      calls.push([name, args]);
      if (name === 'admin_prepare_shared_asset_version_gc') return { data: [{ storageItems: [{ bucket: 'shared-assets', path: 'assets/a/versions/v.glb' }] }], error: null };
      if (name === 'admin_finalize_shared_asset_version_gc') return { data: [{ deleted: true }], error: null };
      if (name === 'admin_prepare_venue_version_gc') return { data: [{ storageItems: [{ bucket: 'venue-runtime', path: 'venues/v/versions/x/assets/walls/a.glb' }] }], error: null };
      if (name === 'admin_finalize_venue_version_gc') return { data: [{ deleted: true }], error: null };
      return { data: [], error: null };
    },
    storage: {
      from(bucket) {
        return {
          async remove(paths) {
            storageRemovals.push([bucket, [...paths]]);
            return { data: paths, error: null };
          },
          getPublicUrl(path) { return { data: { publicUrl: `${bucket}/${path}` } }; }
        };
      }
    }
  };
}

{
  const supabase = fakeSupabase('shared');
  const api = createSharedAssetApi({ supabase });
  const result = await api.gcVersion('sav-old');
  assert.equal(result.deleted, true);
  assert.deepEqual(supabase.calls.map((x) => x[0]), ['admin_prepare_shared_asset_version_gc', 'admin_finalize_shared_asset_version_gc']);
  assert.deepEqual(supabase.storageRemovals, [['shared-assets', ['assets/a/versions/v.glb']]]);
}

{
  const supabase = fakeSupabase('venue');
  const api = createGalleryManagementApi({ supabase });
  const result = await api.gcVersion('vv-old');
  assert.equal(result.deleted, true);
  assert.deepEqual(supabase.calls.map((x) => x[0]), ['admin_prepare_venue_version_gc', 'admin_finalize_venue_version_gc']);
  assert.deepEqual(supabase.storageRemovals, [['venue-runtime', ['venues/v/versions/x/assets/walls/a.glb']]]);
}

console.log('V14.4.4 per-Version GC authority regression passed.');
