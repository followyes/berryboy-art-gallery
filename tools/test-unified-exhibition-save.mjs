import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createExhibitionDataAdapter } from '../src/data/exhibition-api.js';

const root = new URL('../', import.meta.url);
const pkg = JSON.parse(fs.readFileSync(new URL('package.json', root), 'utf8'));
const sql = fs.readFileSync(new URL('../../../OUTSIDE_REPO/SQL/ARCHIVE/V14_4_6_UNIFIED_EXHIBITION_SAVE_AUTHORITY_DEPLOYED.sql', import.meta.url), 'utf8');
const allInOne = fs.readFileSync(new URL('../../../OUTSIDE_REPO/SQL/ALL_IN_ONE.sql', import.meta.url), 'utf8');
const admin = fs.readFileSync(new URL('../src/bootstrap/admin-workspace-bootstrap.js', import.meta.url), 'utf8');
const viewer = fs.readFileSync(new URL('../src/bootstrap/gallery-viewer-bootstrap.js', import.meta.url), 'utf8');
const engine = fs.readFileSync(new URL('../src/Gallery_V0_11.js', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('../src/data/exhibition-api.js', import.meta.url), 'utf8');
const adminHtml = fs.readFileSync(new URL('../admin.html', import.meta.url), 'utf8');

assert.ok(pkg.description.includes('V14.4.7.8 Mobile Survival Debug UI Removal'));
assert.ok(sql.includes('create function public.admin_save_exhibition_product('));
for (const fragment of [
  'select * into e from public.exhibitions where id=p_exhibition_id for update',
  'select * into es from public.exhibition_states where exhibition_id=p_exhibition_id for update',
  'select * into ec from public.exhibition_cards where exhibition_id=p_exhibition_id for update',
  'state revision conflict', 'state lock conflict', 'card revision conflict', 'card lock conflict',
  'public.save_exhibition_runtime_state(', 'public.admin_update_exhibition(', 'public.admin_set_exhibition_runtime_cover(',
  'Exactly one technical Public cutover', 'public.admin_publish_exhibition_bundle(',
  'cleanupCandidates', 'save-unified-product'
]) assert.ok(sql.includes(fragment), `missing SQL contract: ${fragment}`);
assert.ok(!sql.toLowerCase().includes('delete from storage.objects'));
assert.ok(allInOne.includes('admin_save_exhibition_product('));

assert.ok(api.includes('admin_save_exhibition_product'));
assert.ok(api.includes('stageProductSave'));
assert.ok(api.includes('saveProduct(reference, payload'));
assert.ok(api.includes('getLastProductSaveResult'));
assert.ok(admin.includes('handleUnifiedExhibitionSave'));
assert.ok(admin.includes('uploadStagedPosterCandidate'));
assert.ok(admin.includes('New poster staged'));
assert.ok(admin.includes('Poster removal staged'));
assert.ok(!admin.includes('async function savePosterProduct'));
assert.ok(!admin.includes('async function uploadPoster'));
assert.ok(admin.includes('saveStateButton.hidden = true'));
assert.ok(engine.includes('product Save authority lives only in the left Exhibition panel'));
assert.ok(engine.includes('galleryEditorSaveBar.hidden = true'));
assert.ok(!engine.includes('galleryEditorSaveBar.appendChild(sharedSaveStateButton)'));
assert.ok(adminHtml.includes('id="saveMetadataButton"'));
assert.ok(adminHtml.includes('data-save-state="clean" disabled>ALL CHANGES SAVED'));
assert.ok(viewer.includes('v14_4_7_3_modular_frame_3_axis'));
assert.ok(admin.includes('v14_4_7_3_modular_frame_3_axis'));

const calls = [];
const fakeSupabase = {
  async rpc(name, args) {
    calls.push([name, args]);
    if (name === 'admin_save_exhibition_product') {
      return { data: [{
        saved: true,
        autoPublished: true,
        stateDraftRevision: 8,
        statePublishedRevision: 8,
        stateLockVersion: 13,
        cardDraftRevision: 6,
        cardPublishedRevision: 6,
        cardLockVersion: 9,
        updatedAt: '2026-09-17T21:00:00Z',
        cleanupCandidates: ['exhibitions/e1/branding/posters/old.webp'],
        exhibition: { id: 'e1', slug: 'main', title: 'Updated', short_description: 'Description', status: 'published', display_order: 2, venue_id: 'v1' }
      }], error: null };
    }
    throw new Error(`unexpected RPC ${name}`);
  }
};
const initialRuntime = {
  mode: 'admin',
  exhibition: { id: 'e1', slug: 'main', name: 'Main', description: '', status: 'published', is_published: true, sort_order: 0, storage_prefix: 'main', space_id: 'gallery', venue_id: 'v1', venue_version_id: 'vv1', venue_version_number: 'v1' },
  revision: 7,
  lockVersion: 12,
  updatedAt: '2026-09-17T20:00:00Z',
  state: { context: { venueId: 'v1', venueVersionId: 'vv1' } },
  rowExists: true,
  adminDetail: { card: { draft_revision: 5, lock_version: 8 }, state: { draft_revision: 7, lock_version: 12 } }
};
const adapter = createExhibitionDataAdapter({ supabase: fakeSupabase, mode: 'admin', initialRuntime });
await adapter.stageProductSave('e1', {
  metadataPatch: { title: 'Updated', short_description: 'Description', display_order: 2 },
  coverPatch: { mode: 'replace', storagePath: 'exhibitions/e1/branding/posters/new.webp', mimeType: 'image/webp', fileSize: 1234 },
  runtimeChanged: true
});
const state = { context: { venueId: 'v1', venueVersionId: 'vv1' }, editor: { artworks: [] } };
const saved = await adapter.saveState('e1', state);
assert.equal(saved.revision, 8);
assert.equal(saved.lockVersion, 13);
assert.equal(saved.published, true);
assert.equal(calls.length, 1);
assert.equal(calls[0][0], 'admin_save_exhibition_product');
assert.equal(calls[0][1].p_expected_draft_revision, 7);
assert.equal(calls[0][1].p_expected_state_lock_version, 12);
assert.equal(calls[0][1].p_expected_card_revision, 5);
assert.equal(calls[0][1].p_expected_card_lock_version, 8);
assert.deepEqual(calls[0][1].p_state, state);
assert.equal(calls[0][1].p_cover_patch.mode, 'replace');
assert.equal(adapter.getLastProductSaveResult().saved, true);

console.log('V14.4.6 unified Exhibition Save authority regression passed.');
