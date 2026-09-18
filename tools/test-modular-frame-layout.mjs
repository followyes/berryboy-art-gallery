import fs from 'node:fs';
import assert from 'node:assert/strict';
import {
  SHARED_ASSET_VALIDATOR_VERSION,
  getDefaultSharedAssetRuntimeMetadata,
  normalizeSharedAssetRuntimeMetadata
} from '../src/validation/shared-asset-validation.js';

const root = new URL('../', import.meta.url);
const pkg = JSON.parse(fs.readFileSync(new URL('package.json', root), 'utf8'));
const validation = fs.readFileSync(new URL('src/validation/shared-asset-validation.js', root), 'utf8');
const worker = fs.readFileSync(new URL('src/workers/shared-asset-glb-validator-worker.js', root), 'utf8');
const workspace = fs.readFileSync(new URL('src/bootstrap/admin-asset-workspace.js', root), 'utf8');
const gallery = fs.readFileSync(new URL('src/Gallery_V0_11.js', root), 'utf8');
const migration = fs.readFileSync(new URL('../../../OUTSIDE_REPO/SQL/ARCHIVE/V14_4_7_1_MODULAR_FRAME_RAIL_LAYOUT_AUTHORITY_DEPLOYED.sql', import.meta.url), 'utf8');
const allInOne = fs.readFileSync(new URL('../../../OUTSIDE_REPO/SQL/ALL_IN_ONE.sql', import.meta.url), 'utf8');
const postcheck = fs.readFileSync(new URL('../../../OUTSIDE_REPO/SQL/ARCHIVE/V14_4_7_1_PRODUCTION_POSTCHECK_DEPLOYED.sql', import.meta.url), 'utf8');

const requiredParts = [
  'CORNER_BL','CORNER_BR','CORNER_TL','CORNER_TR',
  'RAIL_BOTTOM','RAIL_LEFT','RAIL_RIGHT','RAIL_TOP'
];

function expect(label, condition) {
  assert.ok(condition, label);
  console.log(`✓ ${label}`);
}

expect('current release preserves V14.4.7.1 authority', pkg.version === '0.14.4-v14-4-7-2-gallery-version-rebase-preservation' && pkg.description.includes('V14.4.7.2 Gallery Version Rebase Preservation Guard'));
expect('deep Shared Asset validator version is advanced', SHARED_ASSET_VALIDATOR_VERSION === 'V14.4.7.1');

const defaults = getDefaultSharedAssetRuntimeMetadata('frame');
assert.deepEqual(defaults, {
  placementMode: 'artwork-only',
  frameLayout: 'modular-rails-v1',
  depthOverlapRatio: 0.92,
  zRotationDegrees: 180,
  yFacingDegrees: 180
});
const normalized = normalizeSharedAssetRuntimeMetadata('frame', {
  placementMode: 'artwork-only',
  frameLayout: 'modular-rails-v1',
  innerWidthRatio: 0.2,
  innerHeightRatio: 0.3,
  depthOverlapRatio: 0.8,
  zRotationDegrees: 180,
  yFacingDegrees: 180
});
assert.equal(normalized.frameLayout, 'modular-rails-v1');
assert.equal('innerWidthRatio' in normalized, false);
assert.equal('innerHeightRatio' in normalized, false);
assert.throws(() => normalizeSharedAssetRuntimeMetadata('frame', { frameLayout: 'legacy-monolithic-v1' }), /modular-rails-v1/);
expect('new Frame runtime metadata is modular-only and drops ratio fit authority', true);

for (const part of requiredParts) {
  expect(`worker requires ${part}`, worker.includes(`"${part}"`));
  expect(`runtime knows ${part}`, gallery.includes(`"${part}"`));
  expect(`SQL authority knows ${part}`, migration.includes(`'${part}'`));
}
expect('worker rejects missing/unexpected Frame parts', worker.includes('FRAME_MODULAR_PARTS_MISSING') && worker.includes('FRAME_MODULAR_PARTS_UNEXPECTED') && worker.includes('FRAME_MODULAR_PART_COUNT'));
expect('worker emits modular frameLayout evidence', worker.includes('summary.frameLayout={contract:MODULAR_FRAME_LAYOUT'));
expect('browser coordinator uses the new validator/cache version', validation.includes('V14.4.7.1') && validation.includes('v14_4_7_2_gallery_version_rebase_preservation'));

expect('Asset Manager removed legacy inner-ratio controls', !workspace.includes('assetRuntimeInnerWidth') && !workspace.includes('assetRuntimeInnerHeight'));
expect('Asset Manager writes modular layout metadata for Add/Replace', workspace.includes('frameLayout: "modular-rails-v1"') && workspace.includes('New Frame models must contain exactly 8 named parts'));

expect('runtime has explicit modular and legacy layout branches', gallery.includes('galleryArtworkFrameModularLayout = "modular-rails-v1"') && gallery.includes('galleryArtworkFrameLegacyLayout = "legacy-monolithic-v1"'));
expect('runtime measures semantic parts after actual GLB orientation', gallery.includes('getArtworkFrameMeshBoundsRelativeToNode') && gallery.includes('createArtworkFrameModularLayoutRuntime'));
expect('runtime derives orthogonal rail axes from measured bounds', gallery.includes('horizontalAxis = horizontalX >= horizontalY ? "x" : "y"') && gallery.includes('verticalAxis = verticalX >= verticalY ? "x" : "y"') && gallery.includes('rail axes are not orthogonal'));
expect('corners are repositioned without scaling', gallery.includes('["CORNER_BL", "CORNER_TL", "RAIL_LEFT"]') && gallery.includes('["CORNER_BR", "CORNER_TR", "RAIL_RIGHT"]') && gallery.includes('part.root.scaling.set(1, 1, 1)'));
expect('only horizontal rails scale on measured horizontal axis', gallery.includes('["RAIL_TOP", "RAIL_BOTTOM"]') && gallery.includes('part.root.scaling[horizontalAxis] = targetLength / baseLength'));
expect('only vertical rails scale on measured vertical axis', gallery.includes('["RAIL_LEFT", "RAIL_RIGHT"]') && gallery.includes('part.root.scaling[verticalAxis] = targetLength / baseLength'));
expect('legacy whole-frame XY scaling remains isolated fallback', gallery.includes('runtime.layoutMode === galleryArtworkFrameModularLayout') && gallery.includes('runtime.scaleRoot.scaling.x = targetWidth / Math.max(0.0001, runtime.referenceWidth || 1)'));
expect('Shared Asset logical identity / Artwork binding is unchanged', gallery.includes('assetId: frameState.assetId || null') && gallery.includes('authoredAgainstAssetVersionId'));

for (const fragment of [
  'V14.4.7.1 Modular Frame Rail Layout Authority',
  "'frameLayout','modular-rails-v1'",
  "report->>'validatorVersion'<>'V14.4.7.1'",
  "New Frame versions must use frameLayout modular-rails-v1",
  'Legacy immutable Frame uses monolithic fit',
  'expected_parts constant text[]'
]) expect(`migration contains ${fragment}`, migration.includes(fragment));
expect('migration does not mutate immutable legacy Frame rows in bulk', !/update\s+public\.shared_asset_versions\s+set\s+runtime_metadata\s*=\s*.*frameLayout/is.test(migration));
expect('migration never deletes Storage rows directly', !migration.toLowerCase().includes('delete from storage.objects'));
expect('ALL_IN_ONE includes V14.4.7.1 canonical authority', allInOne.includes('V14.4.7.1 Modular Frame Rail Layout Authority'));
expect('postcheck is read only', postcheck.toLowerCase().includes('set transaction read only') && postcheck.toLowerCase().includes('rollback;'));
expect('postcheck reports legacy immutable vs modular versions', postcheck.includes("'legacyImmutable'") && postcheck.includes("'invalidDraftLayout'") && postcheck.includes("'invalidModularPartContract'"));

console.log('V14.4.7.1 Modular Frame Rail Layout regression passed.');
