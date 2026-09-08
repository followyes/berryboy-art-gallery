import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createSceneLifecycleController, getRuntimeVenueVersionKey, areRuntimesSameVenueVersion } from '../src/runtime/scene-lifecycle-controller.js';

if (!globalThis.window) globalThis.window = new EventTarget();
if (!window.setTimeout) window.setTimeout = setTimeout;
if (!window.clearTimeout) window.clearTimeout = clearTimeout;
if (!globalThis.CustomEvent) {
  globalThis.CustomEvent = class CustomEvent extends Event {
    constructor(type, options = {}) { super(type); this.detail = options.detail; }
  };
}
window.GalleryApp = null;

function runtime(exhibitionId, versionId, options = {}) {
  return {
    mode: options.mode || 'public',
    exhibition: {
      id: exhibitionId,
      slug: exhibitionId,
      name: exhibitionId,
      space_id: options.spaceId || 'shared-gallery',
      venue_version_id: versionId
    },
    venueVersion: { id: versionId },
    spaceDefinition: {
      id: options.spaceId || 'shared-gallery',
      venueVersionId: versionId,
      failStartup: options.failStartup === true
    }
  };
}

const engine = { id: 'persistent-engine', scenes: [] };
const canvas = { id: 'renderCanvas' };
const createdScenes = [];
let staleEvents = 0;

const engineModule = {
  createScene(receivedEngine, receivedCanvas, options) {
    assert.equal(receivedEngine, engine, 'C25 must preserve the Babylon Engine');
    assert.equal(receivedCanvas, canvas, 'C25 must preserve the canvas');
    const scene = {
      id: `scene-${createdScenes.length + 1}`,
      options,
      disposed: false,
      renderCount: 0,
      isDisposed() { return this.disposed; },
      render() { if (this.disposed) throw new Error('disposed scene rendered'); this.renderCount += 1; },
      dispose() {
        if (this.disposed) return;
        this.disposed = true;
        const index = engine.scenes.indexOf(this);
        if (index >= 0) engine.scenes.splice(index, 1);
      }
    };
    createdScenes.push(scene);
    engine.scenes.push(scene);
    queueMicrotask(() => {
      // Deliberately send one event from an unrelated lifecycle first. The waiter must ignore it.
      staleEvents += 1;
      window.dispatchEvent(new CustomEvent('gallery-interaction-ready', { detail: { lifecycleId: 'stale-c24-scene' } }));
      if (options.spaceDefinition.failStartup) {
        window.dispatchEvent(new CustomEvent('gallery-startup-failure', {
          detail: { lifecycleId: options.lifecycleId, message: 'synthetic target startup failure' }
        }));
      } else {
        window.dispatchEvent(new CustomEvent('gallery-interaction-ready', {
          detail: {
            lifecycleId: options.lifecycleId,
            venueVersionId: options.spaceDefinition.venueVersionId,
            exhibitionId: options.exhibitionId
          }
        }));
      }
    });
    return scene;
  }
};

let sameSpaceSwitchCalls = 0;
window.GalleryApp = {
  async switchExhibition(id, options) {
    sameSpaceSwitchCalls += 1;
    assert.ok(id);
    assert.equal(options.force, true);
    return true;
  }
};

const runtimeA1 = runtime('ex-a', 'venue-version-a1', { spaceId: 'main-gallery' });
const runtimeA2 = runtime('ex-b', 'venue-version-a2', { spaceId: 'main-gallery' });
const runtimeSameA1 = runtime('ex-c', 'venue-version-a1', { spaceId: 'main-gallery' });

assert.equal(getRuntimeVenueVersionKey(runtimeA1), 'venue-version-a1');
assert.equal(areRuntimesSameVenueVersion(runtimeA1, runtimeSameA1), true);
assert.equal(areRuntimesSameVenueVersion(runtimeA1, runtimeA2), false, 'same Gallery slug but another immutable version must be cross-space');

const runtimeMap = new Map([
  ['ex-a', runtimeA1],
  ['ex-b', runtimeA2],
  ['ex-c', runtimeSameA1]
]);

const sceneChanges = [];
const adapterModes = [];
const exhibitionData = { setMode(mode) { adapterModes.push(mode); return mode; } };
const controller = createSceneLifecycleController({
  engine,
  canvas,
  engineModule,
  exhibitionData,
  resolveRuntime: async (reference) => {
    if (reference === 'preflight-fail') throw new Error('synthetic preflight failure');
    const resolved = runtimeMap.get(reference);
    if (!resolved) throw new Error(`unknown runtime ${reference}`);
    return resolved;
  },
  getApp: () => window.GalleryApp,
  onSceneChanged: (scene, rt, lifecycleId, reason) => {
    sceneChanges.push({ scene, runtime: rt, lifecycleId, reason });
  },
  readinessTimeoutMs: 3000
});

const started = await controller.start(runtimeA1);
assert.equal(started.ok, true);
assert.equal(engine.scenes.length, 1);
assert.equal(controller.getActiveScene(), createdScenes[0]);
assert.equal(controller.getActiveRuntime(), runtimeA1);
assert.match(controller.getActiveLifecycleId(), /^c25-scene-/);
assert.ok(staleEvents >= 1, 'stale lifecycle event was exercised');

const firstScene = controller.getActiveScene();
const sameResult = await controller.switchTo('ex-c', { runtime: runtimeSameA1, forceRemote: true });
assert.equal(sameResult.mode, 'same-venue-version');
assert.equal(controller.getActiveScene(), firstScene, 'same immutable Gallery Version must stay resident');
assert.equal(firstScene.disposed, false);
assert.equal(engine.scenes.length, 1);
assert.equal(sameSpaceSwitchCalls, 1);

const crossResult = await controller.switchTo('ex-b', { runtime: runtimeA2, forceRemote: true });
assert.equal(crossResult.mode, 'cross-space-scene-recreate');
assert.equal(firstScene.disposed, true, 'old Scene must be disposed at a cross-version boundary');
assert.equal(engine.scenes.length, 1, 'only one live Babylon Scene may remain');
assert.notEqual(controller.getActiveScene(), firstScene);
assert.equal(controller.getActiveRuntime(), runtimeA2);

const adminSameVersion = runtime('ex-b', 'venue-version-a2', { spaceId: 'main-gallery', mode: 'admin' });
const adopted = controller.adoptRuntime(adminSameVersion, 'test-admin-adopt');
assert.equal(adopted.scene, controller.getActiveScene());
assert.equal(controller.getActiveRuntime().mode, 'admin');
assert.equal(adapterModes.at(-1), 'admin');
assert.throws(() => controller.adoptRuntime(runtimeA1), /cannot cross immutable Venue Versions/);
controller.adoptRuntime(runtimeA2, 'test-public-adopt');
assert.equal(adapterModes.at(-1), 'public');

const sceneBeforePreflightFailure = controller.getActiveScene();
await assert.rejects(
  controller.switchTo('preflight-fail', { forceRemote: true }),
  /synthetic preflight failure/
);
assert.equal(controller.getActiveScene(), sceneBeforePreflightFailure, 'preflight failure must preserve current Scene');
assert.equal(sceneBeforePreflightFailure.disposed, false);
assert.equal(engine.scenes.length, 1);

const failedTarget = runtime('ex-fail', 'venue-version-fail', { spaceId: 'broken-gallery', failStartup: true, mode: 'admin' });
await assert.rejects(
  controller.switchTo('ex-fail', { runtime: failedTarget, forceRemote: true }),
  /synthetic target startup failure/
);
assert.equal(controller.getActiveRuntime(), runtimeA2, 'post-dispose failure must restore previous canonical runtime');
assert.equal(engine.scenes.length, 1, 'rollback must still leave exactly one live Scene');
assert.equal(controller.getDebug().rollbacks, 1);
assert.equal(adapterModes.at(-1), 'public', 'rollback must restore the previous runtime data channel');

// Exercise repeated cross-space switching. Engine/canvas stay stable and old Scenes are disposed.
for (let index = 0; index < 10; index += 1) {
  const target = index % 2 === 0 ? runtimeA1 : runtimeA2;
  await controller.switchTo(target.exhibition.id, { runtime: target, forceRemote: true });
  assert.equal(engine.scenes.length, 1, `iteration ${index}: leaked live Scene`);
  assert.equal(controller.getActiveRuntime(), target);
}
assert.ok(createdScenes.filter((scene) => !scene.disposed).length === 1, 'only current Scene may be live after repeated switching');
assert.ok(controller.getDebug().sceneRecreates >= 11);

controller.dispose();
assert.equal(engine.scenes.length, 0);
assert.equal(controller.getActiveScene(), null);

// Source-level contract checks for the integration points that a controller-only fake cannot execute.
const root = new URL('../', import.meta.url);
const viewer = fs.readFileSync(new URL('src/bootstrap/gallery-viewer-bootstrap.js', root), 'utf8');
const admin = fs.readFileSync(new URL('src/bootstrap/admin-workspace-bootstrap.js', root), 'utf8');
const source = fs.readFileSync(new URL('src/Gallery_V0_11.js', root), 'utf8');
const api = fs.readFileSync(new URL('src/data/exhibition-api.js', root), 'utf8');

assert.ok(viewer.includes('createSceneLifecycleController'));
assert.ok(viewer.includes('const scene = activeScene;'), 'viewer render loop must follow mutable activeScene');
assert.ok(viewer.includes('switchPublicExhibition(reference'));
assert.ok(viewer.includes('window.ExhibitionPlatformSceneLifecycle = sceneLifecycleController'));
assert.ok(viewer.includes('sceneLifecycleController.adoptRuntime(publicRuntime'), 'same-scene Admin→Public must update lifecycle runtime identity');
assert.ok(viewer.includes('initialPublicExhibitionReference = await ensurePublicExhibitionSelection()'), 'initial discovery selection must actually drive startup');
assert.ok(admin.includes('createSceneLifecycleController'));
assert.ok(admin.includes('sceneLifecycleController.switchTo'), 'Admin Exhibition selection must use lifecycle controller');
assert.ok(source.includes('venueVersionId: galleryActiveVenueVersionId'), 'serialized/runtime identity must retain exact Venue Version');
assert.ok(source.includes('Exhibition state belongs to another Gallery Version'), 'state must reject another immutable Gallery Version');
assert.ok(source.includes('galleryDisposed = true'));
assert.ok(source.includes('gallery-scene-disposed'));
assert.ok(source.includes('galleryLifecycleId'));
assert.ok(source.includes('Cross-Space Exhibition switch requires C6C8C25 Scene lifecycle recreation'));
assert.ok(api.includes('const runtimeKey = (modeValue, id) =>'), 'Public/Admin runtime caches must be channel-qualified');
assert.ok(api.includes('public:<') === false); // implementation uses dynamic canonical key, not hard-coded one-off values
assert.ok(api.includes('requestedMode'), 'mode-specific runtime cache lookup missing');

console.log('C6C8C25 Cross-Space Runtime executable regression invariants passed.');
