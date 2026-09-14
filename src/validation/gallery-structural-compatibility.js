/*
  Exhibition Platform — V14.3.3 Gallery Structural Compatibility Foundation.
  Pure comparison helpers. No Supabase, Babylon or DOM dependencies.
*/

export const GALLERY_STRUCTURAL_SIGNATURE_SCHEMA = "exhibition-platform-gallery-runtime-mesh-signatures.v1";
export const GALLERY_STRUCTURAL_COMPATIBILITY_SCHEMA = "exhibition-platform-gallery-structural-compatibility.v1";
export const GALLERY_STRUCTURAL_COMPATIBILITY_STAGE = "V14.3.3";
export const GALLERY_STRUCTURAL_ROLES = Object.freeze(["floor", "walls", "ceiling", "props"]);
export const GALLERY_MESH_COMPATIBILITY_CLASSES = Object.freeze(["UNCHANGED", "MOVED", "CHANGED", "REMOVED", "ADDED"]);

function text(value) { return String(value == null ? "" : value).trim(); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : null; }
function validationOf(assetOrValidation) {
  const value = object(assetOrValidation);
  if (!value) return null;
  if (object(value.glb) && text(value.fileHash)) return value;
  const metadata = object(value.metadata);
  return metadata && object(metadata.c23ModelValidation) ? metadata.c23ModelValidation : null;
}
function hashOf(assetOrValidation) {
  const value = object(assetOrValidation);
  const validation = validationOf(value);
  return text((validation && validation.fileHash) || (value && value.file_hash)).toLowerCase();
}
function roleOf(assetOrValidation, fallback = "") {
  const value = object(assetOrValidation);
  const validation = validationOf(value);
  return text((validation && validation.role) || (value && (value.role || value.asset_id)) || fallback).toLowerCase();
}

export function getGalleryRuntimeMeshSignatures(assetOrValidation) {
  const validation = validationOf(assetOrValidation);
  const glb = validation && object(validation.glb);
  if (!glb || glb.structuralSignatureSchema !== GALLERY_STRUCTURAL_SIGNATURE_SCHEMA || !Array.isArray(glb.runtimeMeshes)) return null;
  const map = new Map();
  for (const raw of glb.runtimeMeshes) {
    const mesh = object(raw);
    const name = text(mesh && mesh.name);
    if (!name || map.has(name)) return null;
    const geometryFingerprint = text(mesh.geometryFingerprint).toLowerCase();
    const transformFingerprint = text(mesh.transformFingerprint).toLowerCase();
    if (!/^sha256:[0-9a-f]{64}$/.test(geometryFingerprint) || !/^sha256:[0-9a-f]{64}$/.test(transformFingerprint)) return null;
    map.set(name, mesh);
  }
  return map;
}

export function hasGalleryStructuralSignatures(assetOrValidation) {
  return getGalleryRuntimeMeshSignatures(assetOrValidation) instanceof Map;
}

function compareRuntimeMesh(source, current) {
  if (!source) return { name: text(current && current.name), classification: "ADDED", source: null, current };
  if (!current) return { name: text(source && source.name), classification: "REMOVED", source, current: null };
  const sameGeometry = text(source.geometryFingerprint).toLowerCase() === text(current.geometryFingerprint).toLowerCase();
  const sameTransform = text(source.transformFingerprint).toLowerCase() === text(current.transformFingerprint).toLowerCase();
  return {
    name: text(current.name || source.name),
    classification: sameGeometry ? (sameTransform ? "UNCHANGED" : "MOVED") : "CHANGED",
    source,
    current
  };
}

export function compareGalleryRoleStructures(sourceAssetOrValidation, currentAssetOrValidation, options = {}) {
  const role = roleOf(currentAssetOrValidation, roleOf(sourceAssetOrValidation, options.role));
  const source = validationOf(sourceAssetOrValidation);
  const current = validationOf(currentAssetOrValidation);
  const sourceHash = hashOf(sourceAssetOrValidation);
  const currentHash = hashOf(currentAssetOrValidation);
  const checkedAt = new Date().toISOString();

  const base = {
    schema: GALLERY_STRUCTURAL_COMPATIBILITY_SCHEMA,
    stage: GALLERY_STRUCTURAL_COMPATIBILITY_STAGE,
    role,
    sourceFileHash: sourceHash || null,
    currentFileHash: currentHash || null,
    checkedAt
  };

  if (!source && !current) return { ...base, classification: "UNCHANGED", evidence: "ROLE_ABSENT_BOTH", verifiable: true, counts: {}, meshes: [] };
  if (!source && current) return { ...base, classification: "ADDED", evidence: "ROLE_ADDED", verifiable: true, counts: { ADDED: 1 }, meshes: [] };
  if (source && !current) return { ...base, classification: "REMOVED", evidence: "ROLE_REMOVED", verifiable: true, counts: { REMOVED: 1 }, meshes: [] };

  // Byte identity is stronger than structural metadata and intentionally supports legacy Galleries.
  if (sourceHash && currentHash && sourceHash === currentHash) {
    return { ...base, classification: "UNCHANGED", evidence: "IDENTICAL_FILE_HASH", verifiable: true, counts: { UNCHANGED: 1 }, meshes: [] };
  }

  const sourceMeshes = getGalleryRuntimeMeshSignatures(source);
  const currentMeshes = getGalleryRuntimeMeshSignatures(current);
  if (!sourceMeshes || !currentMeshes) {
    return {
      ...base,
      classification: "UNVERIFIABLE",
      evidence: "STRUCTURAL_SIGNATURES_MISSING",
      verifiable: false,
      counts: {},
      meshes: []
    };
  }

  const names = [...new Set([...sourceMeshes.keys(), ...currentMeshes.keys()])].sort((a, b) => a.localeCompare(b));
  const meshes = names.map((name) => compareRuntimeMesh(sourceMeshes.get(name), currentMeshes.get(name)));
  const counts = Object.fromEntries(GALLERY_MESH_COMPATIBILITY_CLASSES.map((key) => [key, meshes.filter((item) => item.classification === key).length]));
  let classification = "UNCHANGED";
  if (counts.REMOVED && !currentMeshes.size) classification = "REMOVED";
  else if (counts.ADDED && !sourceMeshes.size) classification = "ADDED";
  else if (counts.CHANGED || counts.REMOVED || counts.ADDED) classification = "CHANGED";
  else if (counts.MOVED) classification = "MOVED";

  return { ...base, classification, evidence: "RUNTIME_MESH_SIGNATURES", verifiable: true, counts, meshes };
}

function assetForRole(snapshot, role) {
  if (!snapshot) return null;
  if (Array.isArray(snapshot)) return snapshot.find((asset) => roleOf(asset) === role) || null;
  if (object(snapshot) && Array.isArray(snapshot.assets)) return snapshot.assets.find((asset) => roleOf(asset) === role) || null;
  if (object(snapshot) && object(snapshot[role])) return snapshot[role];
  return null;
}

export function compareGalleryStructuralSnapshots(sourceSnapshot, currentSnapshot) {
  const roles = GALLERY_STRUCTURAL_ROLES.map((role) => compareGalleryRoleStructures(assetForRole(sourceSnapshot, role), assetForRole(currentSnapshot, role), { role }));
  const counts = {
    UNCHANGED: roles.filter((item) => item.classification === "UNCHANGED").length,
    MOVED: roles.filter((item) => item.classification === "MOVED").length,
    CHANGED: roles.filter((item) => item.classification === "CHANGED").length,
    REMOVED: roles.filter((item) => item.classification === "REMOVED").length,
    ADDED: roles.filter((item) => item.classification === "ADDED").length,
    UNVERIFIABLE: roles.filter((item) => item.classification === "UNVERIFIABLE").length
  };
  let classification = "UNCHANGED";
  if (counts.UNVERIFIABLE) classification = "UNVERIFIABLE";
  else if (counts.CHANGED || counts.REMOVED || counts.ADDED) classification = "CHANGED";
  else if (counts.MOVED) classification = "MOVED";
  return {
    schema: GALLERY_STRUCTURAL_COMPATIBILITY_SCHEMA,
    stage: GALLERY_STRUCTURAL_COMPATIBILITY_STAGE,
    classification,
    verifiable: counts.UNVERIFIABLE === 0,
    counts,
    roles
  };
}
