/*
  Exhibition Platform — V14.3.4 Same-Gallery Compatibility & Placement Repair Authority.
  Pure state/structure evaluator. No Supabase, Babylon or DOM dependencies.
*/

import { compareGalleryStructuralSnapshots } from "../validation/gallery-structural-compatibility.js";

export const SAME_GALLERY_COMPATIBILITY_STAGE = "V14.3.4";
export const SAME_GALLERY_COMPATIBILITY_SCHEMA = "exhibition-platform-same-gallery-state-compatibility.v1";
export const SAME_GALLERY_REPAIR_SCHEMA = "exhibition-platform-placement-repair.v1";
export const SAME_GALLERY_DECISION_STATUSES = Object.freeze(["PRESERVE", "REPAIR", "REVIEW"]);

function text(value) { return String(value == null ? "" : value).trim(); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : null; }
function array(value) { return Array.isArray(value) ? value : []; }
function clone(value) {
  try { return JSON.parse(JSON.stringify(value)); } catch (_error) { return value; }
}
function contentOf(state) {
  const root = object(state) || {};
  return object(root.content) || root;
}
function sourcePriority(input, state) {
  const explicit = object(input && input.provenance) || {};
  const source = object(input && input.source) || {};
  const context = object(contentOf(state).context) || {};
  return {
    venueId: text(explicit.venueId || explicit.venue_id || source.venueId || source.venue_id || context.venueId || context.venue_id),
    venueVersionId: text(explicit.venueVersionId || explicit.venue_version_id || source.venueVersionId || source.venue_version_id || context.authoredAgainstVenueVersionId || context.authored_against_venue_version_id || context.venueVersionId || context.venue_version_id),
    channel: text(explicit.channel || source.channel),
    kind: text(explicit.kind || explicit.source || (explicit.venueVersionId || explicit.venue_version_id ? "relational-channel" : source.kind || source.source || "embedded-or-explicit")) || "embedded-or-explicit"
  };
}
function currentIdentity(input) {
  const current = object(input && input.current) || {};
  return {
    venueId: text(current.venueId || current.venue_id),
    venueVersionId: text(current.venueVersionId || current.venue_version_id),
    versionNumber: text(current.versionNumber || current.version_number)
  };
}
function structuralSnapshots(input) {
  const source = object(input && input.source) || {};
  const current = object(input && input.current) || {};
  return { source: source.snapshot || source.assets || null, current: current.snapshot || current.assets || null };
}
function unavailableStructuralComparison() {
  return {
    schema: "exhibition-platform-gallery-structural-compatibility.v1",
    stage: "V14.3.3",
    classification: "UNVERIFIABLE",
    verifiable: false,
    counts: { UNCHANGED: 0, MOVED: 0, CHANGED: 0, REMOVED: 0, ADDED: 0, UNVERIFIABLE: 4 },
    roles: ["floor", "walls", "ceiling", "props"].map((role) => ({ role, classification: "UNVERIFIABLE", verifiable: false, evidence: "STRUCTURAL_CONTEXT_MISSING", meshes: [], counts: {} }))
  };
}
function normalizeStructuralComparison(input) {
  const supplied = object(input && input.structuralComparison);
  if (supplied && Array.isArray(supplied.roles)) return supplied;
  const snapshots = structuralSnapshots(input);
  if (!snapshots.source || !snapshots.current) return unavailableStructuralComparison();
  return compareGalleryStructuralSnapshots(snapshots.source, snapshots.current);
}
function roleMap(comparison) {
  const map = new Map();
  for (const role of array(comparison && comparison.roles)) {
    if (role && role.role) map.set(text(role.role).toLowerCase(), role);
  }
  return map;
}
function meshMap(role) {
  const map = new Map();
  for (const mesh of array(role && role.meshes)) {
    const name = text(mesh && mesh.name);
    if (name) map.set(name, mesh);
  }
  return map;
}
function assetForRole(snapshot, role) {
  if (!snapshot) return null;
  const list = Array.isArray(snapshot) ? snapshot : Array.isArray(snapshot.assets) ? snapshot.assets : null;
  if (list) return list.find((asset) => text(asset && (asset.role || asset.asset_id || asset.assetId)).toLowerCase() === role) || null;
  return object(snapshot[role]);
}
function validationOf(asset) {
  const value = object(asset);
  if (!value) return null;
  if (object(value.glb)) return value;
  const metadata = object(value.metadata);
  return metadata && object(metadata.c23ModelValidation) ? metadata.c23ModelValidation : null;
}
function runtimeMeshNames(asset) {
  const validation = validationOf(asset);
  const glb = validation && object(validation.glb);
  return new Set(array(glb && glb.runtimeMeshNames).map(text).filter(Boolean));
}
function legacyMeshEvidence(input, roleName) {
  const snapshots = structuralSnapshots(input);
  return {
    source: runtimeMeshNames(assetForRole(snapshots.source, roleName)),
    current: runtimeMeshNames(assetForRole(snapshots.current, roleName))
  };
}
function overallSpatialChanged(comparison) {
  return ["MOVED", "CHANGED", "REMOVED", "ADDED"].includes(text(comparison && comparison.classification).toUpperCase());
}
function decision(family, id, status, reason, extra = {}) {
  return Object.freeze({
    schema: SAME_GALLERY_REPAIR_SCHEMA,
    stage: SAME_GALLERY_COMPATIBILITY_STAGE,
    family,
    id: text(id) || null,
    status,
    reason,
    ...extra
  });
}
function maxStatus(decisions) {
  if (decisions.some((item) => item.status === "REPAIR")) return "REPAIR";
  if (decisions.some((item) => item.status === "REVIEW")) return "REVIEW";
  return "PRESERVE";
}
function wallReferenceDecision(name, wallsRole, input) {
  const wallName = text(name);
  if (!wallName) return { status: "REVIEW", reason: "ARTWORK_WALL_ANCHOR_MISSING", meshClassification: null };
  const roleClass = text(wallsRole && wallsRole.classification).toUpperCase();
  if (roleClass === "UNCHANGED") return { status: "PRESERVE", reason: "WALL_ROLE_UNCHANGED", meshClassification: "UNCHANGED" };
  if (roleClass === "UNVERIFIABLE" || !wallsRole) {
    const legacy = legacyMeshEvidence(input, "walls");
    if (legacy.source.size && legacy.current.size) {
      if (legacy.source.has(wallName) && legacy.current.has(wallName)) return { status: "REVIEW", reason: "WALL_EXISTS_BUT_SPATIAL_SIGNATURE_UNVERIFIABLE", meshClassification: "UNVERIFIABLE" };
      if (legacy.source.has(wallName) && !legacy.current.has(wallName)) return { status: "REPAIR", reason: "WALL_ANCHOR_REMOVED_BY_NAME", meshClassification: "REMOVED" };
    }
    return { status: "REVIEW", reason: "WALL_STRUCTURE_UNVERIFIABLE", meshClassification: "UNVERIFIABLE" };
  }
  const mesh = meshMap(wallsRole).get(wallName);
  const meshClass = text(mesh && mesh.classification).toUpperCase();
  if (meshClass === "UNCHANGED") return { status: "PRESERVE", reason: "WALL_ANCHOR_UNCHANGED", meshClassification: meshClass };
  if (["MOVED", "CHANGED", "REMOVED"].includes(meshClass)) return { status: "REPAIR", reason: `WALL_ANCHOR_${meshClass}`, meshClassification: meshClass };
  if (!mesh && roleClass === "REMOVED") return { status: "REPAIR", reason: "WALL_ROLE_REMOVED", meshClassification: "REMOVED" };
  return { status: "REVIEW", reason: "WALL_ANCHOR_NOT_PROVEN_COMPATIBLE", meshClassification: meshClass || null };
}
function floorPlacementDecision(floorRole) {
  const classification = text(floorRole && floorRole.classification).toUpperCase();
  if (classification === "UNCHANGED") return { status: "PRESERVE", reason: "FLOOR_UNCHANGED" };
  if (["MOVED", "CHANGED", "REMOVED", "ADDED"].includes(classification)) return { status: "REPAIR", reason: `FLOOR_${classification}` };
  return { status: "REVIEW", reason: "FLOOR_STRUCTURE_UNVERIFIABLE" };
}
function shellMeshDecision(name, roles, input) {
  const target = text(name);
  if (!target) return null;
  let sawUnverifiable = false;
  for (const roleName of ["floor", "walls", "ceiling", "props"]) {
    const role = roles.get(roleName);
    const classification = text(role && role.classification).toUpperCase();
    if (classification === "UNCHANGED") continue;
    if (classification === "UNVERIFIABLE" || !role) {
      const legacy = legacyMeshEvidence(input, roleName);
      if (legacy.source.has(target)) {
        if (legacy.current.size && !legacy.current.has(target)) return { status: "REPAIR", reason: `${roleName.toUpperCase()}_TARGET_REMOVED_BY_NAME`, role: roleName };
        sawUnverifiable = true;
      }
      continue;
    }
    const mesh = meshMap(role).get(target);
    if (!mesh) continue;
    const meshClass = text(mesh.classification).toUpperCase();
    if (meshClass === "REMOVED") return { status: "REPAIR", reason: `${roleName.toUpperCase()}_TARGET_REMOVED`, role: roleName, meshClassification: meshClass };
    return { status: "PRESERVE", reason: `${roleName.toUpperCase()}_TARGET_STILL_EXISTS`, role: roleName, meshClassification: meshClass };
  }
  if (sawUnverifiable) return { status: "REVIEW", reason: "TARGET_SHELL_REFERENCE_UNVERIFIABLE" };
  return null;
}
function stateDecisionInventory(state, comparison, input) {
  const content = contentOf(state);
  const editor = object(content.editor) || {};
  const roles = roleMap(comparison);
  const wallsRole = roles.get("walls");
  const floorRole = roles.get("floor");
  const all = [];

  for (const [index, artwork] of array(editor.artworks).entries()) {
    if (!artwork) continue;
    const id = text(artwork.artworkId || artwork.name || index);
    const anchor = wallReferenceDecision(artwork.wall && artwork.wall.wallMeshName, wallsRole, input);
    all.push(decision("artwork", id, anchor.status, anchor.reason, { name: text(artwork.name), wallMeshName: text(artwork.wall && artwork.wall.wallMeshName) || null, meshClassification: anchor.meshClassification || null, affects: ["world-transform", "wall-anchor", "focus-camera"] }));
    if (artwork.frame || artwork.artworkFrame) {
      all.push(decision("frame", `frame:${id}`, anchor.status, anchor.status === "PRESERVE" ? "FRAME_FOLLOWS_COMPATIBLE_ARTWORK" : "FRAME_FOLLOWS_ARTWORK_PLACEMENT", { artworkId: id, affects: ["artwork-binding"] }));
    }
  }

  const floorDecision = floorPlacementDecision(floorRole);
  for (const [index, sphere] of array(editor.spheres).entries()) {
    if (!sphere) continue;
    const id = text(sphere.slotId || sphere.name || index);
    all.push(decision("sculpture", id, floorDecision.status, floorDecision.reason, { name: text(sphere.name), affects: ["world-transform", "floor-placement", "focus-camera"] }));
  }
  for (const [index, instance] of array(editor.assetInstances).entries()) {
    if (!instance) continue;
    const id = text(instance.instanceId || instance.id || index);
    all.push(decision("shared-prop", id, floorDecision.status, floorDecision.reason, { assetId: text(instance.assetId), assetVersionId: text(instance.assetVersionId), affects: ["world-transform", "floor-placement"] }));
  }

  for (const [index, wallState] of array(editor.walls).entries()) {
    if (!wallState) continue;
    const name = text(wallState.name || index);
    const anchor = wallReferenceDecision(name, wallsRole, input);
    let status = anchor.status;
    let reason = anchor.reason;
    if (["MOVED", "CHANGED", "UNCHANGED"].includes(text(anchor.meshClassification).toUpperCase())) {
      status = "PRESERVE";
      reason = "WALL_STYLE_TARGET_STILL_EXISTS";
    }
    all.push(decision("wall-style", name, status, reason, { wallMeshName: name, meshClassification: anchor.meshClassification || null, affects: ["wall-style"] }));
  }

  const localLights = object(content.localLights) || {};
  for (const [index, light] of array(localLights.lights).entries()) {
    if (!light) continue;
    const id = text(light.id || light.name || index);
    const refs = array(light.targetMeshNames).map(text).filter(Boolean);
    const targetFindings = refs.map((name) => ({ name, result: shellMeshDecision(name, roles, input) })).filter((entry) => entry.result);
    let status = "PRESERVE";
    let reason = "LOCAL_LIGHT_REFERENCES_COMPATIBLE";
    if (targetFindings.some((entry) => entry.result.status === "REPAIR")) {
      status = "REPAIR";
      reason = "LOCAL_LIGHT_TARGET_REMOVED";
    } else if (targetFindings.some((entry) => entry.result.status === "REVIEW")) {
      status = "REVIEW";
      reason = "LOCAL_LIGHT_TARGET_UNVERIFIABLE";
    } else if (overallSpatialChanged(comparison)) {
      status = "REVIEW";
      reason = "LOCAL_LIGHT_ABSOLUTE_PLACEMENT_AFTER_SHELL_CHANGE";
    } else if (!comparison.verifiable) {
      status = "REVIEW";
      reason = "LOCAL_LIGHT_SHELL_COMPATIBILITY_UNVERIFIABLE";
    }
    all.push(decision("local-light", id, status, reason, {
      name: text(light.name),
      targetMeshNames: refs,
      affectedTargetMeshNames: targetFindings.filter((entry) => entry.result.status !== "PRESERVE").map((entry) => entry.name),
      affects: ["world-transform", "target-mesh-references"]
    }));
  }

  const legacySpatialKeys = ["customFocus", "navigationPath", "pathData"].filter((key) => content[key] != null);
  for (const key of legacySpatialKeys) {
    const status = comparison.classification === "UNCHANGED" ? "PRESERVE" : "REVIEW";
    all.push(decision("other-spatial", key, status, status === "PRESERVE" ? "SHELL_UNCHANGED" : "LEGACY_SPATIAL_STATE_REVIEW_AFTER_SHELL_CHANGE", { affects: [key] }));
  }

  return all;
}

export function evaluateSameGalleryStateCompatibility(input = {}) {
  const state = input.state;
  const provenance = sourcePriority(input, state);
  const current = currentIdentity(input);
  const base = {
    schema: SAME_GALLERY_COMPATIBILITY_SCHEMA,
    stage: SAME_GALLERY_COMPATIBILITY_STAGE,
    source: provenance,
    current,
    checkedAt: new Date().toISOString(),
    decisions: [],
    counts: { PRESERVE: 0, REPAIR: 0, REVIEW: 0 }
  };

  if (!provenance.venueVersionId || !current.venueVersionId) {
    return { ...base, mode: "PROVENANCE_UNVERIFIABLE", classification: "REVIEW_REQUIRED", allowed: false, safeToApply: false, requiresRepair: false, requiresReview: true, reason: "EXACT_VERSION_PROVENANCE_REQUIRED" };
  }

  if (provenance.venueVersionId === current.venueVersionId) {
    return { ...base, mode: "SAME_EXACT_VERSION", classification: "NORMAL_APPLY", allowed: true, safeToApply: true, requiresRepair: false, requiresReview: false, reason: "EXACT_VERSION_MATCH" };
  }

  if (!provenance.venueId || !current.venueId) {
    return { ...base, mode: "LOGICAL_GALLERY_UNVERIFIABLE", classification: "REVIEW_REQUIRED", allowed: false, safeToApply: false, requiresRepair: false, requiresReview: true, reason: "LOGICAL_GALLERY_ID_REQUIRED_FOR_CROSS_VERSION_STATE" };
  }

  if (provenance.venueId !== current.venueId) {
    return { ...base, mode: "CROSS_GALLERY", classification: "REJECT", allowed: false, safeToApply: false, requiresRepair: false, requiresReview: false, reason: "LOGICAL_GALLERY_MISMATCH" };
  }

  const structuralComparison = normalizeStructuralComparison(input);
  const decisions = stateDecisionInventory(state, structuralComparison, input);
  const counts = Object.fromEntries(SAME_GALLERY_DECISION_STATUSES.map((status) => [status, decisions.filter((item) => item.status === status).length]));
  const overall = maxStatus(decisions);
  const requiresRepair = counts.REPAIR > 0;
  const requiresReview = counts.REVIEW > 0;
  const safeToApply = !requiresRepair && !requiresReview && structuralComparison.verifiable !== false;
  return {
    ...base,
    mode: "SAME_GALLERY_DIFFERENT_VERSION",
    classification: safeToApply ? "SAFE_REBASE" : requiresRepair ? "REPAIR_REQUIRED" : "REVIEW_REQUIRED",
    allowed: true,
    safeToApply,
    requiresRepair,
    requiresReview,
    reason: safeToApply ? "TARGETED_COMPATIBILITY_CONFIRMED" : requiresRepair ? "TARGETED_PLACEMENT_REPAIR_REQUIRED" : "COMPATIBILITY_NOT_FULLY_VERIFIABLE",
    structuralComparison,
    decisions,
    counts,
    overallDecision: overall
  };
}

function decisionIndex(plan) {
  const map = new Map();
  for (const item of array(plan && plan.decisions)) map.set(`${item.family}:${text(item.id)}`, item);
  return map;
}
function annotation(item, sourceVenueVersionId) {
  if (!item || item.status === "PRESERVE") return null;
  return {
    schema: SAME_GALLERY_REPAIR_SCHEMA,
    stage: SAME_GALLERY_COMPATIBILITY_STAGE,
    status: item.status === "REPAIR" ? "needs-repair" : "needs-review",
    reason: item.reason,
    sourceVenueVersionId: text(sourceVenueVersionId) || null,
    checkedAt: new Date().toISOString()
  };
}

export function annotateStateWithSameGalleryCompatibility(state, plan) {
  const root = clone(object(state) || {});
  const content = object(root.content) || root;
  const editor = object(content.editor) || {};
  const index = decisionIndex(plan);
  const current = object(plan && plan.current) || {};
  const source = object(plan && plan.source) || {};

  content.galleryCompatibility = {
    schema: SAME_GALLERY_COMPATIBILITY_SCHEMA,
    stage: SAME_GALLERY_COMPATIBILITY_STAGE,
    classification: plan && plan.classification || "UNKNOWN",
    sourceVenueId: source.venueId || null,
    sourceVenueVersionId: source.venueVersionId || null,
    currentVenueId: current.venueId || null,
    currentVenueVersionId: current.venueVersionId || null,
    counts: clone(plan && plan.counts || {}),
    checkedAt: plan && plan.checkedAt || new Date().toISOString()
  };

  content.context = object(content.context) || {};
  if (current.venueId) content.context.venueId = current.venueId;
  if (current.venueVersionId) {
    if (!content.context.authoredAgainstVenueVersionId && source.venueVersionId) content.context.authoredAgainstVenueVersionId = source.venueVersionId;
    content.context.venueVersionId = current.venueVersionId;
  }

  if (Array.isArray(editor.artworks)) editor.artworks = editor.artworks.map((item, i) => {
    const id = text(item && (item.artworkId || item.name || i));
    const finding = index.get(`artwork:${id}`);
    const mark = annotation(finding, source.venueVersionId);
    return mark ? { ...item, placementStatus: mark.status, placementRepair: mark } : item;
  });
  if (Array.isArray(editor.spheres)) editor.spheres = editor.spheres.map((item, i) => {
    const id = text(item && (item.slotId || item.name || i));
    const finding = index.get(`sculpture:${id}`);
    const mark = annotation(finding, source.venueVersionId);
    return mark ? { ...item, placementStatus: mark.status, placementRepair: mark } : item;
  });
  if (Array.isArray(editor.assetInstances)) editor.assetInstances = editor.assetInstances.map((item, i) => {
    const id = text(item && (item.instanceId || item.id || i));
    const finding = index.get(`shared-prop:${id}`);
    const mark = annotation(finding, source.venueVersionId);
    return mark ? { ...item, placementStatus: mark.status, placementRepair: mark } : item;
  });
  if (Array.isArray(editor.walls)) editor.walls = editor.walls.map((item, i) => {
    const id = text(item && (item.name || i));
    const finding = index.get(`wall-style:${id}`);
    const mark = annotation(finding, source.venueVersionId);
    return mark ? { ...item, compatibilityStatus: mark.status, compatibilityRepair: mark } : item;
  });
  content.editor = editor;

  const localLights = object(content.localLights);
  if (localLights && Array.isArray(localLights.lights)) {
    localLights.lights = localLights.lights.map((item, i) => {
      const id = text(item && (item.id || item.name || i));
      const finding = index.get(`local-light:${id}`);
      const mark = annotation(finding, source.venueVersionId);
      return mark ? { ...item, placementStatus: mark.status, placementRepair: mark } : item;
    });
  }

  return root;
}


export function captureStatePreservationInventory(state) {
  const content = contentOf(state);
  const editor = object(content.editor) || {};
  const key = (value, fallback = "") => text(value) || text(fallback);
  const unique = (values) => Array.from(new Set(values.map(text).filter(Boolean))).sort();
  return Object.freeze({
    artworks: unique(array(editor.artworks).map((item, index) => key(item && (item.artworkId || item.name), `artwork:${index}`))),
    sculptures: unique(array(editor.spheres).map((item, index) => key(item && (item.slotId || item.name), `sculpture:${index}`))),
    sharedProps: unique(array(editor.assetInstances).map((item, index) => key(item && (item.instanceId || item.id), `prop:${index}`))),
    localLights: unique(array(object(content.localLights) && object(content.localLights).lights).map((item, index) => key(item && (item.id || item.name), `light:${index}`)))
  });
}

export function compareStatePreservationInventory(sourceState, candidateState) {
  const source = captureStatePreservationInventory(sourceState);
  const candidate = captureStatePreservationInventory(candidateState);
  const families = ["artworks", "sculptures", "sharedProps", "localLights"];
  const missing = {};
  let missingCount = 0;
  for (const family of families) {
    const current = new Set(candidate[family]);
    missing[family] = source[family].filter((id) => !current.has(id));
    missingCount += missing[family].length;
  }
  return Object.freeze({
    schema: "exhibition-platform-state-preservation-inventory.v1",
    preserved: missingCount === 0,
    missingCount,
    source,
    candidate,
    missing: Object.freeze(missing)
  });
}

export function summarizeSameGalleryCompatibility(plan) {
  const value = object(plan) || {};
  const counts = object(value.counts) || {};
  return Object.freeze({
    schema: SAME_GALLERY_COMPATIBILITY_SCHEMA,
    stage: SAME_GALLERY_COMPATIBILITY_STAGE,
    mode: text(value.mode),
    classification: text(value.classification),
    safeToApply: value.safeToApply === true,
    requiresRepair: value.requiresRepair === true,
    requiresReview: value.requiresReview === true,
    preserve: Number(counts.PRESERVE) || 0,
    repair: Number(counts.REPAIR) || 0,
    review: Number(counts.REVIEW) || 0,
    sourceVenueId: text(value.source && value.source.venueId) || null,
    sourceVenueVersionId: text(value.source && value.source.venueVersionId) || null,
    currentVenueId: text(value.current && value.current.venueId) || null,
    currentVenueVersionId: text(value.current && value.current.venueVersionId) || null
  });
}
