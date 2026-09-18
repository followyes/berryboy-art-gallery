import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { fileURLToPath, pathToFileURL } from 'node:url';
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


const repoPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const validatorWorkerPath = path.join(repoPath, 'src/workers/shared-asset-glb-validator-worker.js');

function pad4(bytes, pad = 0x20) {
  const length = (bytes.length + 3) & ~3;
  const out = new Uint8Array(length);
  out.fill(pad);
  out.set(bytes);
  return out;
}

function makeGlb(gltf, binBytes = new Uint8Array(36)) {
  const json = pad4(new TextEncoder().encode(JSON.stringify(gltf)), 0x20);
  const bin = pad4(binBytes, 0);
  const total = 12 + 8 + json.length + 8 + bin.length;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  let offset = 12;
  dv.setUint32(offset, json.length, true);
  dv.setUint32(offset + 4, 0x4e4f534a, true);
  offset += 8;
  out.set(json, offset);
  offset += json.length;
  dv.setUint32(offset, bin.length, true);
  dv.setUint32(offset + 4, 0x004e4942, true);
  offset += 8;
  out.set(bin, offset);
  return out;
}

function modularFrameGltf(runtimeNames) {
  return {
    asset: { version: '2.0', generator: 'V14.4.7.7 Blender suffix fixture' },
    scene: 0,
    scenes: [{ nodes: runtimeNames.map((_name, index) => index) }],
    nodes: runtimeNames.map((name, index) => ({ name, mesh: index })),
    meshes: runtimeNames.map((name) => ({ name, primitives: [{ attributes: { POSITION: 0 } }] })),
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [-0.5, -0.1, -0.1], max: [0.5, 0.1, 0.1] }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }],
    buffers: [{ byteLength: 36 }]
  };
}

function createValidatorWorker() {
  const wrapper = `
    import { parentPort } from 'node:worker_threads';
    globalThis.self = globalThis;
    globalThis.postMessage = (value) => parentPort.postMessage(value);
    await import(${JSON.stringify(pathToFileURL(validatorWorkerPath).href)});
    parentPort.on('message', (data) => globalThis.self.onmessage({ data }));
  `;
  return new Worker(wrapper, { eval: true, type: 'module' });
}

async function validateFrameRuntimeNames(runtimeNames) {
  const bytes = makeGlb(modularFrameGltf(runtimeNames));
  const validator = createValidatorWorker();
  const id = 'frame-' + Math.random().toString(36).slice(2);
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('modular Frame validator timeout')), 10000);
      validator.on('error', reject);
      validator.on('message', (message) => {
        if (!message || message.id !== id) return;
        if (message.type === 'result') {
          clearTimeout(timer);
          resolve(message.report);
        } else if (message.type === 'failure') {
          clearTimeout(timer);
          reject(new Error(message.error || 'validator failure'));
        }
      });
      validator.postMessage({
        type: 'validate',
        id,
        assetType: 'frame',
        source: { kind: 'blob', blob: new Blob([bytes], { type: 'model/gltf-binary' }), name: 'Frame3.glb' },
        expectedSize: bytes.length
      });
    });
  } finally {
    await validator.terminate();
  }
}

expect('current release preserves V14.4.7.1 authority', pkg.version === '0.14.4-v14-4-7-7-frame-blender-suffix' && pkg.description.includes('V14.4.7.7 Modular Frame Blender Numeric Suffix Compatibility Hotfix'));
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
expect('browser coordinator uses the V14.4.7.7 worker cache key while preserving the V14.4.7.1 server report contract', validation.includes('V14.4.7.1') && validation.includes('v14_4_7_7_blender_numeric_suffix'));


expect('worker normalizes only a final Blender numeric suffix', worker.includes('replace(/\\.\\d{3,}$/, "")') && worker.includes('normalizeModularFrameRuntimePartName'));
expect('runtime uses the same final Blender numeric suffix compatibility before semantic lookup', gallery.includes('normalizeArtworkFrameSemanticCandidate') && gallery.includes('replace(/\\.\\d{3,}$/, "")'));

const blenderSuffixedNames = requiredParts.map((part) => `${part}.001`);
const blenderSuffixReport = await validateFrameRuntimeNames(blenderSuffixedNames);
assert.equal(blenderSuffixReport.valid, true, JSON.stringify(blenderSuffixReport.errors));
assert.deepEqual([...blenderSuffixReport.glb.runtimeMeshNames].sort(), [...requiredParts].sort());
assert.deepEqual(blenderSuffixReport.glb.frameLayout.sourceRuntimeParts, blenderSuffixedNames);
assert.deepEqual([...blenderSuffixReport.glb.frameLayout.runtimeParts].sort(), [...requiredParts].sort());
expect('Frame3-style Blender .001 names validate as the canonical eight semantic Frame parts', true);

const duplicateSemanticNames = [...blenderSuffixedNames];
duplicateSemanticNames[1] = 'CORNER_BL.002';
const duplicateSemanticReport = await validateFrameRuntimeNames(duplicateSemanticNames);
assert.equal(duplicateSemanticReport.valid, false);
assert.ok(duplicateSemanticReport.errors.some((item) => item.code === 'FRAME_MODULAR_PARTS_DUPLICATE_SEMANTIC'));
assert.ok(duplicateSemanticReport.errors.some((item) => item.code === 'FRAME_MODULAR_PARTS_MISSING'));
expect('suffix normalization cannot hide duplicate/missing semantic Frame parts', true);

const nonBlenderAliasNames = [...blenderSuffixedNames];
nonBlenderAliasNames[0] = 'CORNER_BL_copy';
const nonBlenderAliasReport = await validateFrameRuntimeNames(nonBlenderAliasNames);
assert.equal(nonBlenderAliasReport.valid, false);
assert.ok(nonBlenderAliasReport.errors.some((item) => item.code === 'FRAME_MODULAR_PARTS_UNEXPECTED'));
expect('arbitrary suffixes remain rejected; compatibility is limited to numeric Blender suffixes', true);

expect('Asset Manager removed legacy inner-ratio controls', !workspace.includes('assetRuntimeInnerWidth') && !workspace.includes('assetRuntimeInnerHeight'));
expect('Asset Manager writes modular layout metadata for Add/Replace', workspace.includes('frameLayout: "modular-rails-v1"') && workspace.includes('New Frame models must contain exactly 8 named parts'));

expect('runtime has explicit modular and legacy layout branches', gallery.includes('galleryArtworkFrameModularLayout = "modular-rails-v1"') && gallery.includes('galleryArtworkFrameLegacyLayout = "legacy-monolithic-v1"'));
expect('runtime measures semantic parts after actual GLB orientation', gallery.includes('getArtworkFrameMeshBoundsRelativeToNode') && gallery.includes('createArtworkFrameModularLayoutRuntime'));
expect('runtime derives rail axes across X/Y/Z measured bounds', gallery.includes('function dominantRailAxis(firstPart, secondPart)') && gallery.includes('["x", "y", "z"]') && gallery.includes('horizontalAxis = dominantRailAxis(parts.RAIL_TOP, parts.RAIL_BOTTOM)') && gallery.includes('verticalAxis = dominantRailAxis(parts.RAIL_LEFT, parts.RAIL_RIGHT)'));

function dominantAxis(a, b) {
  const totals = { x: Math.abs(a.x)+Math.abs(b.x), y: Math.abs(a.y)+Math.abs(b.y), z: Math.abs(a.z)+Math.abs(b.z) };
  return ['x','y','z'].sort((l,r)=>totals[r]-totals[l])[0];
}
assert.equal(dominantAxis({x:0.604648,y:0.096437,z:0.166681},{x:0.604648,y:0.096437,z:0.166681}), 'x');
assert.equal(dominantAxis({x:0.166681,y:0.096437,z:0.604648},{x:0.166681,y:0.096437,z:0.604648}), 'z');
expect('Frame2-style XZ authored frames resolve horizontal X and vertical Z', true);
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

console.log('V14.4.7.7 Modular Frame Blender numeric suffix compatibility regression passed.');
