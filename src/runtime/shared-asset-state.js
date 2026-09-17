/* Exhibition Platform — V14.4.2 Logical Shared Asset authority primitives.
   Product/runtime placement truth is the logical assetId. Exact assetVersionId values
   remain provenance/legacy compatibility only; current runtime binaries resolve through
   shared_assets.published_version_id before state reaches the Gallery engine. */

export const SHARED_ASSET_STATE_SCHEMA = "exhibition-platform-state-assets.v2";
export const SHARED_ASSET_AUTHORITY_STAGE = "V14.4.2";
export const SHARED_ASSET_TYPES = Object.freeze(["prop", "frame"]);

function text(value) { return String(value == null ? "" : value).trim(); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function array(value) { return Array.isArray(value) ? value : []; }
function uuidLike(value) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value)); }
function clone(value) { try { return JSON.parse(JSON.stringify(value)); } catch (_error) { return value; } }

export function normalizeSharedAssetVersionDescriptor(value) {
  const source = object(value);
  const assetId = text(source.assetId || source.asset_id);
  const assetVersionId = text(source.assetVersionId || source.asset_version_id || source.publishedVersionId || source.published_version_id || source.id);
  const assetType = text(source.assetType || source.asset_type).toLowerCase();
  const storageBucket = text(source.storageBucket || source.storage_bucket || source.publishedStorageBucket || source.published_storage_bucket);
  const storagePath = text(source.storagePath || source.storage_path || source.publishedStoragePath || source.published_storage_path).replace(/^\/+/, "");
  if (!uuidLike(assetId) || !uuidLike(assetVersionId) || !SHARED_ASSET_TYPES.includes(assetType) || !storageBucket || !storagePath) return null;
  return {
    assetId,
    assetVersionId,
    assetVersionNumber: Number(source.assetVersionNumber || source.asset_version_number || source.publishedVersionNumber || source.published_version_number) || null,
    assetType,
    assetName: text(source.assetName || source.asset_name || source.name) || null,
    category: text(source.category),
    scopeType: text(source.scopeType || source.scope_type || "platform") || "platform",
    scopeVenueId: text(source.scopeVenueId || source.scope_venue_id) || null,
    storageBucket,
    storagePath,
    fileHash: text(source.fileHash || source.file_hash) || null,
    runtimeMetadata: object(source.runtimeMetadata || source.runtime_metadata)
  };
}

export function normalizeSharedAssetManifest(value) {
  const source = object(value);
  const versions = object(source.versions);
  const normalized = {};
  Object.keys(versions).forEach((key) => {
    const entry = normalizeSharedAssetVersionDescriptor({ assetVersionId: key, ...object(versions[key]) });
    if (entry) normalized[entry.assetVersionId] = entry;
  });
  return { schema: SHARED_ASSET_STATE_SCHEMA, versions: normalized };
}

export function buildSharedAssetManifest(versionDescriptors = []) {
  const versions = {};
  (Array.isArray(versionDescriptors) ? versionDescriptors : []).forEach((value) => {
    const entry = normalizeSharedAssetVersionDescriptor(value);
    if (!entry) throw new Error("Shared Asset manifest contains an invalid version descriptor.");
    versions[entry.assetVersionId] = {
      assetId: entry.assetId,
      assetType: entry.assetType,
      storageBucket: entry.storageBucket,
      storagePath: entry.storagePath,
      fileHash: entry.fileHash,
      runtimeMetadata: entry.runtimeMetadata
    };
  });
  return { schema: SHARED_ASSET_STATE_SCHEMA, versions };
}

function stateContent(content) {
  const root = object(content && content.content && typeof content.content === "object" ? content.content : content);
  return root;
}

function propArrays(state) {
  const lists = [];
  if (Array.isArray(state.assetInstances)) lists.push(state.assetInstances);
  if (state.editor && Array.isArray(state.editor.assetInstances) && state.editor.assetInstances !== state.assetInstances) lists.push(state.editor.assetInstances);
  return lists;
}

function artworkArrays(state) {
  const lists = [];
  if (Array.isArray(state.artworks)) lists.push(state.artworks);
  if (state.editor && Array.isArray(state.editor.artworks) && state.editor.artworks !== state.artworks) lists.push(state.editor.artworks);
  return lists;
}

function logicalReference(source, expectedType) {
  const value = object(source);
  const assetId = text(value.assetId || value.asset_id);
  const provenanceVersionId = text(
    value.authoredAgainstAssetVersionId || value.authored_against_asset_version_id ||
    value.assetVersionId || value.asset_version_id
  );
  return {
    assetId: uuidLike(assetId) ? assetId : null,
    assetVersionId: uuidLike(provenanceVersionId) ? provenanceVersionId : null,
    assetType: expectedType
  };
}

export function collectSharedAssetReferences(content) {
  const state = stateContent(content);
  const refs = [];
  const seen = new Set();
  const instances = Array.isArray(state.assetInstances)
    ? state.assetInstances
    : (state.editor && Array.isArray(state.editor.assetInstances) ? state.editor.assetInstances : []);
  const artworks = Array.isArray(state.artworks)
    ? state.artworks
    : (state.editor && Array.isArray(state.editor.artworks) ? state.editor.artworks : []);

  instances.forEach((item, index) => {
    const source = object(item);
    const ref = logicalReference(source, "prop");
    if (!ref.assetId && !ref.assetVersionId) return;
    const usageKey = text(source.instanceId || source.id) || `prop-${index + 1}`;
    const key = `prop-instance:${usageKey}`;
    if (seen.has(key)) throw new Error(`Duplicate Shared Asset prop usage key: ${usageKey}.`);
    seen.add(key);
    refs.push({ assetId: ref.assetId, assetVersionId: ref.assetVersionId, usageType: "prop-instance", usageKey });
  });

  artworks.forEach((item, index) => {
    const artwork = object(item);
    const frame = object(artwork.frame);
    const ref = logicalReference(frame, "frame");
    if (!ref.assetId && !ref.assetVersionId) return;
    const usageKey = text(artwork.artworkId || artwork.name) || `artwork-${index + 1}`;
    const key = `artwork-frame:${usageKey}`;
    if (seen.has(key)) throw new Error(`Duplicate Shared Asset Frame usage key: ${usageKey}.`);
    seen.add(key);
    refs.push({ assetId: ref.assetId, assetVersionId: ref.assetVersionId, usageType: "artwork-frame", usageKey });
  });

  return refs;
}

export function collectSharedAssetIds(content) {
  return [...new Set(collectSharedAssetReferences(content).map((ref) => ref.assetId).filter(uuidLike))];
}

function currentDescriptorMap(rows) {
  const map = new Map();
  array(rows).forEach((row) => {
    const descriptor = normalizeSharedAssetVersionDescriptor(row);
    if (descriptor) map.set(descriptor.assetId, descriptor);
  });
  return map;
}

function applyCurrentDescriptor(target, descriptor) {
  if (!target || typeof target !== "object" || !descriptor) return target;
  const priorVersionId = text(
    target.authoredAgainstAssetVersionId || target.authored_against_asset_version_id ||
    target.assetVersionId || target.asset_version_id
  );
  if (uuidLike(priorVersionId) && !target.authoredAgainstAssetVersionId) target.authoredAgainstAssetVersionId = priorVersionId;
  target.assetId = descriptor.assetId;
  target.assetVersionId = descriptor.assetVersionId;
  target.assetVersionNumber = descriptor.assetVersionNumber;
  target.assetType = descriptor.assetType;
  if (descriptor.assetName) target.assetName = descriptor.assetName;
  target.category = descriptor.category || "";
  target.scopeType = descriptor.scopeType || "platform";
  target.scopeVenueId = descriptor.scopeVenueId || null;
  target.storageBucket = descriptor.storageBucket;
  target.storagePath = descriptor.storagePath;
  target.fileHash = descriptor.fileHash || null;
  target.runtimeMetadata = clone(descriptor.runtimeMetadata || {});
  return target;
}

export function hydrateSharedAssetReferencesWithCurrentVersions(content, currentRows) {
  const state = clone(stateContent(content));
  const map = currentDescriptorMap(currentRows);
  if (!map.size) return state;

  propArrays(state).forEach((instances) => {
    instances.forEach((item) => {
      const source = object(item);
      const assetId = text(source.assetId || source.asset_id);
      const descriptor = map.get(assetId);
      if (descriptor && descriptor.assetType === "prop") applyCurrentDescriptor(source, descriptor);
    });
  });

  artworkArrays(state).forEach((artworks) => {
    artworks.forEach((item) => {
      const frame = object(object(item).frame);
      const assetId = text(frame.assetId || frame.asset_id);
      const descriptor = map.get(assetId);
      if (descriptor && descriptor.assetType === "frame") applyCurrentDescriptor(frame, descriptor);
    });
  });

  return state;
}

export function findLegacyFrameCatalogMatch(frameState, catalogRows) {
  const frame = object(frameState);
  const bucket = text(frame.storageBucket || frame.storage_bucket || "gallery-artworks").toLowerCase();
  const path = text(frame.storagePath || frame.storage_path || frame.path).replace(/^\/+/, "").toLowerCase();
  if (!path) return null;
  return (Array.isArray(catalogRows) ? catalogRows : []).find((row) => {
    const rowBucket = text(row.published_storage_bucket || row.storage_bucket || row.storageBucket).toLowerCase();
    const rowPath = text(row.published_storage_path || row.storage_path || row.storagePath).replace(/^\/+/, "").toLowerCase();
    return rowBucket === bucket && rowPath === path;
  }) || null;
}
