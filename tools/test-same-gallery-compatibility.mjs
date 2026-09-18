import fs from 'node:fs';
import assert from 'node:assert/strict';
import {
  SAME_GALLERY_COMPATIBILITY_SCHEMA,
  SAME_GALLERY_COMPATIBILITY_STAGE,
  evaluateSameGalleryStateCompatibility,
  annotateStateWithSameGalleryCompatibility,
  summarizeSameGalleryCompatibility,
  captureStatePreservationInventory,
  compareStatePreservationInventory
} from '../src/runtime/same-gallery-state-compatibility.js';

function role(role, classification, meshes = [], verifiable = true) {
  return { role, classification, verifiable, evidence: verifiable ? 'RUNTIME_MESH_SIGNATURES' : 'STRUCTURAL_SIGNATURES_MISSING', meshes, counts: {} };
}
function comparison(overrides = {}) {
  const roles = {
    floor: role('floor','UNCHANGED'),
    walls: role('walls','UNCHANGED'),
    ceiling: role('ceiling','UNCHANGED'),
    props: role('props','UNCHANGED'),
    ...overrides
  };
  const list = Object.values(roles);
  const classification = list.some(x=>x.classification==='UNVERIFIABLE') ? 'UNVERIFIABLE'
    : list.some(x=>['CHANGED','REMOVED','ADDED'].includes(x.classification)) ? 'CHANGED'
    : list.some(x=>x.classification==='MOVED') ? 'MOVED' : 'UNCHANGED';
  return { schema:'exhibition-platform-gallery-structural-compatibility.v1',stage:'V14.3.3',classification,verifiable:!list.some(x=>x.verifiable===false),roles:list,counts:{} };
}
function state() {
  return {
    version:'Gallery_V0_11_WEB',
    context:{ exhibitionId:'ex-1',spaceId:'gallery-x',venueId:'venue-x',venueVersionId:'version-old' },
    editor:{
      walls:[{name:'Wall_segment_001',colorName:'red'}],
      artworks:[{artworkId:'art-1',name:'Artwork_1',position:{x:1,y:2,z:3},wall:{wallMeshName:'Wall_segment_001'},frame:{assetId:'frame-1'}}],
      spheres:[{slotId:'sculpture-1',name:'ArtSphere_1',position:{x:2,y:0,z:2}}],
      assetInstances:[{instanceId:'prop-1',assetId:'asset-prop',assetVersionId:'asset-prop-v1',position:{x:3,y:0,z:3}}]
    },
    localLights:{lights:[{id:'light-1',name:'Light 1',position:{x:0,y:2,z:0},targetMeshNames:['Wall_segment_001']}]}
  };
}
function input(structuralComparison, extra = {}) {
  return {
    state: state(),
    provenance:{kind:'relational-channel',venueId:'venue-x',venueVersionId:'version-old',channel:'published'},
    current:{venueId:'venue-x',venueVersionId:'version-new'},
    structuralComparison,
    ...extra
  };
}

const exact = evaluateSameGalleryStateCompatibility({
  state: state(),
  provenance:{kind:'relational-channel',venueId:'venue-x',venueVersionId:'version-old'},
  current:{venueId:'venue-x',venueVersionId:'version-old'}
});
assert.equal(exact.schema,SAME_GALLERY_COMPATIBILITY_SCHEMA);
assert.equal(exact.stage,SAME_GALLERY_COMPATIBILITY_STAGE);
assert.equal(exact.mode,'SAME_EXACT_VERSION');
assert.equal(exact.safeToApply,true);

const cross = evaluateSameGalleryStateCompatibility({
  state: state(),
  provenance:{kind:'relational-channel',venueId:'venue-x',venueVersionId:'version-old'},
  current:{venueId:'venue-y',venueVersionId:'version-new'}
});
assert.equal(cross.mode,'CROSS_GALLERY');
assert.equal(cross.classification,'REJECT');
assert.equal(cross.allowed,false);

const safe = evaluateSameGalleryStateCompatibility(input(comparison()));
assert.equal(safe.mode,'SAME_GALLERY_DIFFERENT_VERSION');
assert.equal(safe.classification,'SAFE_REBASE');
assert.equal(safe.safeToApply,true);
assert.equal(safe.counts.REPAIR,0);
assert.equal(safe.counts.REVIEW,0);
assert.ok(safe.decisions.every(x=>x.status==='PRESERVE'));

const movedWall = comparison({
  walls:role('walls','MOVED',[{name:'Wall_segment_001',classification:'MOVED'}])
});
const moved = evaluateSameGalleryStateCompatibility(input(movedWall));
assert.equal(moved.classification,'REPAIR_REQUIRED');
assert.equal(moved.safeToApply,false);
assert.equal(moved.decisions.find(x=>x.family==='artwork').status,'REPAIR');
assert.equal(moved.decisions.find(x=>x.family==='frame').status,'REPAIR');
assert.equal(moved.decisions.find(x=>x.family==='wall-style').status,'PRESERVE');
assert.equal(moved.decisions.find(x=>x.family==='sculpture').status,'PRESERVE');
assert.equal(moved.decisions.find(x=>x.family==='shared-prop').status,'PRESERVE');
assert.equal(moved.decisions.find(x=>x.family==='local-light').status,'REVIEW');

const removedWall = comparison({
  walls:role('walls','CHANGED',[{name:'Wall_segment_001',classification:'REMOVED'}])
});
const removed = evaluateSameGalleryStateCompatibility(input(removedWall));
assert.equal(removed.decisions.find(x=>x.family==='artwork').status,'REPAIR');
assert.equal(removed.decisions.find(x=>x.family==='wall-style').status,'REPAIR');
assert.equal(removed.decisions.find(x=>x.family==='local-light').status,'REPAIR');
assert.deepEqual(removed.decisions.find(x=>x.family==='local-light').affectedTargetMeshNames,['Wall_segment_001']);

const movedFloor = comparison({ floor:role('floor','MOVED',[{name:'Floor_segment_001',classification:'MOVED'}]) });
const floor = evaluateSameGalleryStateCompatibility(input(movedFloor));
assert.equal(floor.decisions.find(x=>x.family==='sculpture').status,'REPAIR');
assert.equal(floor.decisions.find(x=>x.family==='shared-prop').status,'REPAIR');
assert.equal(floor.decisions.find(x=>x.family==='artwork').status,'PRESERVE');
assert.equal(floor.decisions.find(x=>x.family==='local-light').status,'REVIEW');

const unverifiable = comparison({ walls:role('walls','UNVERIFIABLE',[],false) });
const review = evaluateSameGalleryStateCompatibility(input(unverifiable));
assert.equal(review.classification,'REVIEW_REQUIRED');
assert.equal(review.requiresReview,true);
assert.equal(review.decisions.find(x=>x.family==='artwork').status,'REVIEW');
assert.notEqual(review.decisions.find(x=>x.family==='artwork').status,'REPAIR');

const missingEvidence = evaluateSameGalleryStateCompatibility({
  state: state(),
  provenance:{kind:'relational-channel',venueId:'venue-x',venueVersionId:'version-old'},
  current:{venueId:'venue-x',venueVersionId:'version-new'}
});
assert.equal(missingEvidence.classification,'REVIEW_REQUIRED');
assert.equal(missingEvidence.requiresReview,true);
assert.equal(missingEvidence.safeToApply,false);

const stateWithWrongEmbeddedVersion = state();
stateWithWrongEmbeddedVersion.context.venueVersionId='embedded-wrong';
const relationalWins = evaluateSameGalleryStateCompatibility({
  state:stateWithWrongEmbeddedVersion,
  provenance:{kind:'relational-channel',venueId:'venue-x',venueVersionId:'version-old'},
  current:{venueId:'venue-x',venueVersionId:'version-new'},
  structuralComparison:comparison()
});
assert.equal(relationalWins.source.venueVersionId,'version-old');
assert.equal(relationalWins.safeToApply,true);

const annotated = annotateStateWithSameGalleryCompatibility(state(),removed);
assert.equal(annotated.context.venueId,'venue-x');
assert.equal(annotated.context.venueVersionId,'version-new');
assert.equal(annotated.context.authoredAgainstVenueVersionId,'version-old');
assert.equal(annotated.editor.artworks[0].placementStatus,'needs-repair');
assert.equal(annotated.editor.artworks[0].placementRepair.sourceVenueVersionId,'version-old');
assert.equal(annotated.editor.walls[0].compatibilityStatus,'needs-repair');
assert.equal(annotated.localLights.lights[0].placementStatus,'needs-repair');
assert.equal(annotated.editor.spheres[0].placementStatus,undefined);
assert.equal(annotated.editor.assetInstances[0].placementStatus,undefined);

const summary=summarizeSameGalleryCompatibility(removed);
assert.equal(summary.repair>0,true);
assert.equal(summary.sourceVenueVersionId,'version-old');
assert.equal(summary.currentVenueVersionId,'version-new');


const sourceInventory=captureStatePreservationInventory(state());
assert.deepEqual(sourceInventory.artworks,['art-1']);
assert.deepEqual(sourceInventory.sculptures,['sculpture-1']);
assert.deepEqual(sourceInventory.sharedProps,['prop-1']);
assert.deepEqual(sourceInventory.localLights,['light-1']);

const preservedCandidate=state();
preservedCandidate.context.venueVersionId='version-new';
const preservedInventory=compareStatePreservationInventory(state(),preservedCandidate);
assert.equal(preservedInventory.preserved,true);
assert.equal(preservedInventory.missingCount,0);

const missingLightCandidate=state();
missingLightCandidate.localLights.lights=[];
const missingInventory=compareStatePreservationInventory(state(),missingLightCandidate);
assert.equal(missingInventory.preserved,false);
assert.deepEqual(missingInventory.missing.localLights,['light-1']);



// V14.4.7.2 Gallery Version rebase preservation SQL/runtime guard regression.
{
  const engine = fs.readFileSync(new URL('../src/Gallery_V0_11.js', import.meta.url), 'utf8');
  const migration = fs.readFileSync(new URL('../../../OUTSIDE_REPO/SQL/ARCHIVE/V14_4_7_2_GALLERY_VERSION_REBASE_PRESERVATION_GUARD_DEPLOYED.sql', import.meta.url), 'utf8');
  const recovery = fs.readFileSync(new URL('../../../OUTSIDE_REPO/SQL/ARCHIVE/V14_4_7_2_PRODUCTION_EXHIBITION_STATE_RECOVERY_PRECHECK_CLOSED.sql', import.meta.url), 'utf8');
  const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.ok(packageJson.version.includes('v14-4-7-7-frame-blender-suffix'));
  assert.ok(packageJson.description.includes('V14.4.7.7 Modular Frame Blender Numeric Suffix Compatibility Hotfix'));
  assert.ok(engine.includes('function prepareGalleryStateForVersionRebaseSave(state)'));
  assert.ok(engine.includes('gallery-rebase-content-loss-blocked'));
  assert.ok(engine.includes('exhibition-platform-gallery-version-rebase-proof.v1'));
  assert.ok(engine.includes('Exhibition content was preserved for review'));
  assert.ok(!engine.includes('Gallery state requires placement repair before it can be applied.'));
  for (const fragment of [
    'galleryVersionRebase',
    'es.draft_venue_version_id is not null and es.draft_venue_version_id is distinct from vv.id',
    'exhibition-platform-gallery-version-rebase-proof.v1',
    'rebase_source_version_id is distinct from es.draft_venue_version_id',
    'rebase_current_version_id is distinct from vv.id',
    'rebase_preserved is not true',
    'retained Artwork inventory is not preserved',
    'retained Local Light inventory is not preserved',
    'retained Sculpture inventory is not preserved',
    'retained Shared Prop inventory is not preserved'
  ]) assert.ok(migration.includes(fragment), `missing V14.4.7.2 migration guard: ${fragment}`);
  assert.ok(!/delete\s+from\s+storage\.objects/i.test(migration));
  assert.match(recovery, /set\s+transaction\s+read\s+only/i);
  assert.match(recovery, /rollback\s*;\s*$/i);
  assert.ok(recovery.includes('RECOVERY_REVIEW_DRAFT_LOOKS_EMPTY'));
  assert.ok(recovery.includes('RECOVERY_REVIEW_PUBLISHED_LOOKS_EMPTY_PREVIOUS_HAS_CONTENT'));
}

console.log('V14.3.4 Same-Gallery compatibility + targeted placement repair authority tests passed.');
