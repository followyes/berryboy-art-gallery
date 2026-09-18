/*
  Exhibition Platform — C6C8C25 Cross-Space Runtime / Exhibition ↔ Gallery Assignment
  Canonical Exhibition/Venue data adapter. Runtime code talks to this adapter instead of
  reading/writing legacy gallery_exhibitions / gallery_state directly.
*/

import { buildSpaceDefinition } from "../runtime/space-definition-resolver.js?v=c6c8c25_cross_space_runtime";
import { isExhibitionGalleryMigrationPending } from "./exhibition-gallery-assignment.js?v=c6c8c25_cross_space_runtime";
import { collectSharedAssetIds, hydrateSharedAssetReferencesWithCurrentVersions } from "../runtime/shared-asset-state.js?v=v14_4_3_canonical_shared_asset_replace";

export const EXHIBITION_STATE_SCHEMA = "exhibition-platform-exhibition-state.v1";
export const CANONICAL_GALLERY_RESOLUTION_STAGE = "V14.3.5";

function galleryStructuralSnapshotFromVersion(version) {
  if (!version || typeof version !== "object") return null;
  const assets = Array.isArray(version.assets) ? version.assets : [];
  return {
    venueId: text(version.venue_id),
    venueVersionId: text(version.id),
    versionNumber: text(version.version_number),
    assets: assets.map((asset) => ({
      role: text(asset && asset.role),
      asset_id: text(asset && asset.asset_id),
      file_hash: text(asset && asset.file_hash) || null,
      file_size: asset && asset.file_size != null ? Number(asset.file_size) : null,
      metadata: asset && asset.metadata && typeof asset.metadata === "object" ? asset.metadata : {}
    }))
  };
}

function createStateCompatibilityContext({ provenance, sourceSnapshot = null, currentSnapshot = null, currentVenueId = "", currentVenueVersionId = "", currentVersionNumber = "" } = {}) {
  if (!provenance) return null;
  return Object.freeze({
    stage: CANONICAL_GALLERY_RESOLUTION_STAGE,
    provenance: Object.freeze({ ...provenance }),
    source: Object.freeze({
      venueId: text(provenance.venueId),
      venueVersionId: text(provenance.venueVersionId),
      versionNumber: text(provenance.versionNumber),
      snapshot: sourceSnapshot || null
    }),
    current: Object.freeze({
      venueId: text(currentVenueId),
      venueVersionId: text(currentVenueVersionId),
      versionNumber: text(currentVersionNumber),
      snapshot: currentSnapshot || null
    })
  });
}

function text(value) { return String(value == null ? "" : value).trim(); }
function isUuid(value) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value)); }
function asRows(response) {
  if (response && response.error) throw response.error;
  if (!response) return [];
  return Array.isArray(response.data) ? response.data : (response.data ? [response.data] : []);
}

async function removeStorageItemsOrThrow(supabase, items) {
  const grouped = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const bucket = text(item && item.bucket);
    const path = text(item && item.path);
    if (!bucket || !path) continue;
    if (!grouped.has(bucket)) grouped.set(bucket, []);
    grouped.get(bucket).push(path);
  }
  let removed = 0;
  for (const [bucket, paths] of grouped.entries()) {
    const unique = [...new Set(paths)];
    for (let i = 0; i < unique.length; i += 100) {
      const batch = unique.slice(i, i + 100);
      const response = await supabase.storage.from(bucket).remove(batch);
      if (response && response.error) throw response.error;
      removed += batch.length;
    }
  }
  return removed;
}
function rpcOne(response) { return asRows(response)[0] || null; }
function unwrapState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (value.content && typeof value.content === "object" && !Array.isArray(value.content)) return value.content;
  return value;
}
function storagePrefixFor(exhibition) {
  const slug = text(exhibition && exhibition.slug);
  const id = text(exhibition && exhibition.id);
  return slug === "main" ? "main" : `exhibitions/${id}`;
}
function canonicalToRuntimeExhibition(record, options = {}) {
  if (!record || !record.id) return null;
  const status = text(record.status || "draft");
  const spaceId = text(options.spaceId || record.venue_slug || record.space_id);
  return {
    id: text(record.id),
    name: text(record.title || record.name || record.slug || record.id),
    slug: text(record.slug || record.id),
    description: text(record.short_description || record.description),
    cover_path: options.coverPath || record.cover_path || null,
    is_published: status === "published" || status === "scheduled",
    status,
    sort_order: Number(record.display_order != null ? record.display_order : record.sort_order) || 0,
    storage_prefix: options.storagePrefix || storagePrefixFor(record),
    space_id: spaceId,
    venue_id: text(record.database_venue_id || record.venue_id || options.venueId),
    venue_version_id: text(record.database_venue_version_id || options.venueVersionId),
    venue_version_number: text(record.venue_version_number || options.venueVersionNumber),
    created_at: record.created_at || null,
    updated_at: record.updated_at || null
  };
}

async function resolveLogicalSharedAssetState(supabase, state, venueId) {
  const content = unwrapState(state);
  if (!content) return content;
  const assetIds = collectSharedAssetIds(content);
  if (!assetIds.length) return content;
  const rows = asRows(await supabase.rpc("resolve_shared_asset_current_versions", {
    p_asset_ids: assetIds,
    p_venue_id: venueId || null
  }));
  return hydrateSharedAssetReferencesWithCurrentVersions(content, rows);
}

async function fetchCoverPath(supabase, coverMediaId) {
  if (!coverMediaId) return null;
  const response = await supabase.from("media_library")
    .select("id, storage_bucket, original_path, desktop_avif_path, preview_avif_path, archived_at, deleted_at")
    .eq("id", coverMediaId).limit(1);
  const row = rpcOne(response);
  if (!row || row.deleted_at || row.archived_at) return null;
  return row.original_path || row.desktop_avif_path || row.preview_avif_path || null;
}

async function adminListRaw(supabase) {
  const response = await supabase.rpc("admin_list_exhibitions", { p_venue_id: null, p_status: null, p_search: null });
  return asRows(response);
}

async function findAdminId(supabase, reference) {
  const ref = text(reference || "main") || "main";
  if (isUuid(ref)) return ref;
  const rows = await adminListRaw(supabase);
  const match = rows.find((row) => text(row.slug) === ref) || rows.find((row) => text(row.id) === ref);
  if (match) return text(match.id);
  if (ref === "main" && rows.length) {
    const main = rows.find((row) => text(row.slug) === "main") || rows[0];
    return text(main.id);
  }
  return "";
}

async function loadAdminRuntime(supabase, reference) {
  const id = await findAdminId(supabase, reference);
  if (!id) throw new Error(`Exhibition not found: ${text(reference)}`);
  const detail = rpcOne(await supabase.rpc("admin_get_exhibition", { p_exhibition_id: id }));
  if (!detail || !detail.exhibition) throw new Error(`Exhibition not found: ${text(reference)}`);
  const e = detail.exhibition;
  const s = detail.state || {};
  const venueDetail = rpcOne(await supabase.rpc("admin_get_venue", { p_venue_id: e.venue_id }));
  if (!venueDetail || !venueDetail.venue) throw new Error("Venue could not be resolved for Exhibition.");
  const sourceVersionId = text(s.draft_venue_version_id);
  if (!sourceVersionId) throw new Error("Exhibition Draft has no exact Gallery provenance.");
  const targetVersionId = text(venueDetail.venue.published_version_id);
  if (!targetVersionId) throw new Error("Gallery has no current Published Version.");
  const versions = Array.isArray(venueDetail.versions) ? venueDetail.versions : [];
  const sourceVersion = versions.find((item) => text(item.id) === sourceVersionId) || null;
  const version = versions.find((item) => text(item.id) === targetVersionId) || null;
  if (!sourceVersion) throw new Error("Draft source Gallery Version could not be resolved for Exhibition.");
  if (!version || text(version.status) !== "published" || !version.frozen_at) throw new Error("Gallery current Published Version could not be resolved for Exhibition.");
  const coverPath = await fetchCoverPath(supabase, e.cover_media_id).catch(() => null);
  const exhibition = canonicalToRuntimeExhibition(e, {
    coverPath,
    spaceId: venueDetail.venue.slug,
    venueId: venueDetail.venue.id,
    venueVersionId: version.id,
    venueVersionNumber: version.version_number
  });
  return {
    mode: "admin",
    exhibition,
    state: await resolveLogicalSharedAssetState(supabase, s.draft_state || s.published_state, venueDetail.venue.id),
    stateProvenance: Object.freeze({
      kind: "relational-channel",
      channel: "draft",
      venueId: text(sourceVersion.venue_id || e.venue_id),
      venueVersionId: sourceVersionId,
      versionNumber: text(sourceVersion.version_number),
      source: "exhibition_states.draft_venue_version_id"
    }),
    stateCompatibilityContext: createStateCompatibilityContext({
      provenance: {
        kind: "relational-channel", channel: "draft",
        venueId: text(sourceVersion.venue_id || e.venue_id),
        venueVersionId: sourceVersionId,
        versionNumber: text(sourceVersion.version_number),
        source: "exhibition_states.draft_venue_version_id"
      },
      sourceSnapshot: galleryStructuralSnapshotFromVersion(sourceVersion),
      currentSnapshot: galleryStructuralSnapshotFromVersion(version),
      currentVenueId: text(e.venue_id),
      currentVenueVersionId: text(version.id),
      currentVersionNumber: text(version.version_number)
    }),
    revision: Number(s.draft_revision) || 0,
    lockVersion: Number(s.lock_version) || 0,
    updatedAt: s.draft_updated_at || s.updated_at || null,
    rowExists: !!detail.state,
    venue: venueDetail.venue,
    venueVersion: version,
    manifest: version.manifest || null,
    adminDetail: detail,
    galleryBindings: detail.galleryBindings || {},
    availableVenues: Array.isArray(detail.availableVenues) ? detail.availableVenues : [],
    migration: detail.migration || null,
    migrationPending: isExhibitionGalleryMigrationPending(detail),
    spaceDefinition: buildSpaceDefinition({ supabase, venue: venueDetail.venue, venueVersion: version, manifest: version.manifest || null })
  };
}

async function resolvePublicRuntime(supabase, reference) {
  const ref = text(reference || "main") || "main";
  let response = null;
  if (isUuid(ref)) {
    response = await supabase.rpc("resolve_published_exhibition", { p_exhibition_id: ref, p_exhibition_slug: null });
  } else {
    response = await supabase.rpc("resolve_published_exhibition", { p_exhibition_id: null, p_exhibition_slug: ref });
  }
  let row = rpcOne(response);
  if (!row) {
    const list = asRows(await supabase.rpc("list_published_exhibitions"));
    const fallback = list[0] || null;
    if (!fallback) throw new Error("No published Exhibition is available.");
    row = rpcOne(await supabase.rpc("resolve_published_exhibition", { p_exhibition_id: fallback.id, p_exhibition_slug: null }));
  }
  if (!row) throw new Error("Published Exhibition could not be resolved.");
  const venue = { id: row.database_venue_id, slug: row.venue_slug, name: row.venue_name };
  const venueVersion = { id: row.database_venue_version_id, version_number: row.venue_version_number, manifest: row.manifest };
  const exhibition = canonicalToRuntimeExhibition(row, {
    spaceId: row.venue_slug,
    venueId: row.database_venue_id,
    venueVersionId: row.database_venue_version_id,
    venueVersionNumber: row.venue_version_number
  });
  return {
    mode: "public",
    exhibition,
    state: await resolveLogicalSharedAssetState(supabase, row.published_state, row.database_venue_id),
    stateProvenance: Object.freeze({
      kind: "relational-channel",
      channel: "published",
      venueId: text(row.state_venue_id || row.database_venue_id),
      venueVersionId: text(row.state_venue_version_id),
      versionNumber: text(row.state_venue_version_number),
      source: "exhibition_states.published_venue_version_id"
    }),
    stateCompatibilityContext: createStateCompatibilityContext({
      provenance: {
        kind: "relational-channel", channel: "published",
        venueId: text(row.state_venue_id || row.database_venue_id),
        venueVersionId: text(row.state_venue_version_id),
        versionNumber: text(row.state_venue_version_number),
        source: "exhibition_states.published_venue_version_id"
      },
      sourceSnapshot: row.state_gallery_snapshot || null,
      currentSnapshot: row.current_gallery_snapshot || null,
      currentVenueId: text(row.database_venue_id),
      currentVenueVersionId: text(row.database_venue_version_id),
      currentVersionNumber: text(row.venue_version_number)
    }),
    revision: Number(row.published_revision) || 0,
    lockVersion: Number(row.lock_version) || 0,
    updatedAt: row.published_at || null,
    rowExists: !!row.published_state,
    venue,
    venueVersion,
    manifest: row.manifest || null,
    spaceDefinition: buildSpaceDefinition({ supabase, venue, venueVersion, manifest: row.manifest || null })
  };
}

async function saveCanonicalState(supabase, runtime, state) {
  const response = await supabase.rpc("admin_save_exhibition_runtime_product", {
    p_exhibition_id: runtime.exhibition.id,
    p_expected_draft_revision: Number(runtime.revision) || 0,
    p_expected_lock_version: Number(runtime.lockVersion) || 0,
    p_state: state
  });
  const result = rpcOne(response);
  if (!result) throw new Error("Canonical Exhibition save returned no result.");
  runtime.revision = Number(result.draft_revision != null ? result.draft_revision : result.draftRevision) || 0;
  runtime.lockVersion = Number(result.lock_version != null ? result.lock_version : result.lockVersion) || 0;
  runtime.updatedAt = result.updated_at || result.updatedAt || new Date().toISOString();
  runtime.state = state;
  runtime.rowExists = true;
  return {
    state,
    revision: runtime.revision,
    lockVersion: runtime.lockVersion,
    updatedAt: runtime.updatedAt,
    rowExists: true,
    published: result.published === true
  };
}

export async function listPublicExhibitionCards(supabase) {
  if (!supabase) throw new Error("Supabase client is required for Exhibition discovery.");
  return asRows(await supabase.rpc("list_public_exhibition_cards")).map((row) => ({
    id: text(row.id),
    slug: text(row.slug || row.id),
    title: text(row.title || row.slug || row.id),
    subtitle: text(row.subtitle),
    description: text(row.short_description),
    buttonLabel: text(row.button_label || "Enter gallery"),
    curator: text(row.curator),
    status: text(row.status),
    displayOrder: Number(row.display_order) || 0,
    venueName: text(row.venue_name),
    startDate: row.start_date || null,
    endDate: row.end_date || null,
    coverUrl: row.cover_url || null,
    mobileCoverUrl: row.mobile_cover_url || null,
    logoUrl: row.logo_url || null,
    theme: row.theme || {}
  }));
}

export async function resolveInitialPublicRuntime(supabase, reference) {
  return resolvePublicRuntime(supabase, reference);
}

export async function resolveInitialAdminRuntime(supabase, reference) {
  return loadAdminRuntime(supabase, reference);
}

export function createExhibitionDataAdapter({ supabase, mode = "public", initialRuntime = null }) {
  if (!supabase) throw new Error("Supabase client is required for canonical Exhibition data.");
  // C6C8C25: Public and Admin can legitimately resolve the same Exhibition to different
  // immutable Venue Versions (Published vs Draft). Cache them in separate channels.
  const runtimeByKey = new Map();
  const pendingProductSaveByExhibition = new Map();
  let lastProductSaveResult = null;
  let modeName = mode === "admin" ? "admin" : "public";
  const runtimeKey = (modeValue, id) => `${modeValue === "admin" ? "admin" : "public"}:${text(id)}`;
  function cacheRuntime(runtime, modeValue = modeName) {
    if (runtime && runtime.exhibition && runtime.exhibition.id) runtimeByKey.set(runtimeKey(modeValue, runtime.exhibition.id), runtime);
    return runtime;
  }
  if (initialRuntime && initialRuntime.exhibition) cacheRuntime(initialRuntime, initialRuntime.mode || modeName);

  function normalizeProductSavePayload(payload = {}) {
    const metadataPatch = payload.metadataPatch && typeof payload.metadataPatch === "object" && !Array.isArray(payload.metadataPatch)
      ? { ...payload.metadataPatch }
      : {};
    const coverPatch = payload.coverPatch && typeof payload.coverPatch === "object" && !Array.isArray(payload.coverPatch)
      ? { ...payload.coverPatch }
      : null;
    return {
      metadataPatch,
      coverPatch,
      runtimeChanged: payload.runtimeChanged === true
    };
  }

  function getRuntimeCardRevision(runtime) {
    const card = runtime && runtime.adminDetail && runtime.adminDetail.card ? runtime.adminDetail.card : {};
    return {
      revision: Number(card.draft_revision) || 0,
      lockVersion: Number(card.lock_version) || 0
    };
  }

  function applyCompositeSaveResult(runtime, result, state, payload) {
    if (!runtime || !result) return result;
    runtime.revision = Number(result.stateDraftRevision != null ? result.stateDraftRevision : runtime.revision) || 0;
    runtime.lockVersion = Number(result.stateLockVersion != null ? result.stateLockVersion : runtime.lockVersion) || 0;
    runtime.updatedAt = result.updatedAt || runtime.updatedAt || new Date().toISOString();
    if (payload && payload.runtimeChanged === true && state) runtime.state = state;
    runtime.rowExists = true;
    runtime.adminDetail = runtime.adminDetail || {};
    runtime.adminDetail.state = Object.assign({}, runtime.adminDetail.state || {}, {
      draft_revision: runtime.revision,
      lock_version: runtime.lockVersion,
      updated_at: runtime.updatedAt
    });
    runtime.adminDetail.card = Object.assign({}, runtime.adminDetail.card || {}, {
      draft_revision: Number(result.cardDraftRevision != null ? result.cardDraftRevision : (runtime.adminDetail.card && runtime.adminDetail.card.draft_revision)) || 0,
      lock_version: Number(result.cardLockVersion != null ? result.cardLockVersion : (runtime.adminDetail.card && runtime.adminDetail.card.lock_version)) || 0
    });
    if (result.exhibition && typeof result.exhibition === "object") {
      runtime.exhibition = canonicalToRuntimeExhibition(result.exhibition, {
        coverPath: payload && payload.coverPatch && payload.coverPatch.mode === "replace"
          ? text(payload.coverPatch.storagePath)
          : payload && payload.coverPatch && payload.coverPatch.mode === "remove"
            ? null
            : runtime.exhibition.cover_path,
        spaceId: runtime.exhibition.space_id,
        venueId: runtime.exhibition.venue_id,
        venueVersionId: runtime.exhibition.venue_version_id,
        venueVersionNumber: runtime.exhibition.venue_version_number,
        storagePrefix: runtime.exhibition.storage_prefix
      });
    }
    return result;
  }

  async function saveCompositeProduct(runtime, state, payload) {
    const normalized = normalizeProductSavePayload(payload);
    const card = getRuntimeCardRevision(runtime);
    const response = rpcOne(await supabase.rpc("admin_save_exhibition_product", {
      p_exhibition_id: runtime.exhibition.id,
      p_expected_draft_revision: Number(runtime.revision) || 0,
      p_expected_state_lock_version: Number(runtime.lockVersion) || 0,
      p_expected_card_revision: card.revision,
      p_expected_card_lock_version: card.lockVersion,
      p_metadata_patch: normalized.metadataPatch,
      p_state: normalized.runtimeChanged ? state : null,
      p_cover_patch: normalized.coverPatch
    }));
    if (!response || response.saved !== true) throw new Error("Unified Exhibition product Save returned no result.");
    lastProductSaveResult = applyCompositeSaveResult(runtime, response, state, normalized);
    return lastProductSaveResult;
  }

  async function resolve(reference, force = false) {
    const ref = text(reference || "main") || "main";
    if (!force) {
      for (const [key, cached] of runtimeByKey.entries()) {
        if (!key.startsWith(`${modeName}:`)) continue;
        if (cached && cached.exhibition && (cached.exhibition.id === ref || cached.exhibition.slug === ref)) return cached;
      }
    }
    const runtime = modeName === "admin" ? await loadAdminRuntime(supabase, ref) : await resolvePublicRuntime(supabase, ref);
    return cacheRuntime(runtime, modeName);
  }

  return Object.freeze({
    schema: "exhibition-platform-canonical-data-adapter.v1",
    get mode() { return modeName; },
    setMode(nextMode) { modeName = nextMode === "admin" ? "admin" : "public"; return modeName; },
    async list() {
      if (modeName === "public") {
        const rows = asRows(await supabase.rpc("list_published_exhibitions"));
        return rows.map((row) => canonicalToRuntimeExhibition(row, { spaceId: row.venue_slug, venueId: row.database_venue_id }));
      }
      const rows = await adminListRaw(supabase);
      const results = [];
      for (const row of rows) {
        let coverPath = null;
        let spaceId = "";
        try {
          const detail = await loadAdminRuntime(supabase, row.id);
          cacheRuntime(detail, "admin");
          coverPath = detail.exhibition.cover_path;
          spaceId = detail.exhibition.space_id;
        } catch (_error) {}
        results.push(canonicalToRuntimeExhibition(row, { coverPath, spaceId, venueId: row.venue_id }));
      }
      return results.filter(Boolean);
    },
    async resolve(reference, options = {}) {
      const runtime = await resolve(reference, options.force === true);
      return { ...runtime.exhibition };
    },
    async loadState(reference, options = {}) {
      const runtime = await resolve(reference, options.force === true);
      return {
        id: runtime.exhibition.id,
        state: runtime.state,
        updated_at: runtime.updatedAt,
        revision: runtime.revision,
        lock_version: runtime.lockVersion,
        rowExists: runtime.rowExists !== false,
        provenance: runtime.stateProvenance ? { ...runtime.stateProvenance } : null,
        exhibition: { ...runtime.exhibition }
      };
    },
    async saveState(reference, state) {
      if (modeName !== "admin") throw new Error("Public Viewer cannot save Exhibition state.");
      const runtime = await resolve(reference, false);
      const pending = pendingProductSaveByExhibition.get(runtime.exhibition.id) || null;
      if (!pending) return saveCanonicalState(supabase, runtime, state);
      try {
        const result = await saveCompositeProduct(runtime, state, pending);
        pendingProductSaveByExhibition.delete(runtime.exhibition.id);
        return {
          state,
          revision: runtime.revision,
          lockVersion: runtime.lockVersion,
          updatedAt: runtime.updatedAt,
          rowExists: true,
          published: result.autoPublished === true,
          productSave: result
        };
      } catch (error) {
        throw error;
      }
    },
    async saveProduct(reference, payload = {}) {
      if (modeName !== "admin") throw new Error("Public Viewer cannot save Exhibition product state.");
      const runtime = await resolve(reference, false);
      const normalized = normalizeProductSavePayload(payload);
      normalized.runtimeChanged = false;
      return saveCompositeProduct(runtime, null, normalized);
    },
    async stageProductSave(reference, payload = {}) {
      if (modeName !== "admin") throw new Error("Public Viewer cannot stage Exhibition product Save data.");
      const runtime = await resolve(reference, false);
      const normalized = normalizeProductSavePayload(payload);
      pendingProductSaveByExhibition.set(runtime.exhibition.id, normalized);
      return normalized;
    },
    clearProductSaveStage(reference) {
      const ref = text(reference);
      for (const [key, runtime] of runtimeByKey.entries()) {
        if (!key.startsWith("admin:")) continue;
        if (runtime && runtime.exhibition && (runtime.exhibition.id === ref || runtime.exhibition.slug === ref)) {
          pendingProductSaveByExhibition.delete(runtime.exhibition.id);
          return true;
        }
      }
      pendingProductSaveByExhibition.delete(ref);
      return true;
    },
    getLastProductSaveResult() { return lastProductSaveResult ? { ...lastProductSaveResult } : null; },
    async listCreationTargets() {
      if (modeName !== "admin") throw new Error("Public Viewer cannot list Exhibition creation targets.");
      const venues = asRows(await supabase.rpc("admin_list_venues", { p_status: null, p_search: null }));
      return venues.map((venue) => {
        const venueId = text(venue && venue.id);
        const venueStatus = text(venue && venue.status);
        const venueVersionId = text(venue && venue.published_version_id);
        const versions = Array.isArray(venue && venue.versions) ? venue.versions : [];
        const publishedVersion = versions.find((version) => text(version && version.id) === venueVersionId) || null;
        if (!venueId || !["published", "hidden"].includes(venueStatus) || !venueVersionId || !publishedVersion || text(publishedVersion.status) !== "published") return null;
        return {
          venueId,
          venueVersionId,
          venueName: text(venue.name || venue.slug || venueId),
          venueSlug: text(venue.slug),
          versionNumber: text(publishedVersion.version_number || venueVersionId),
          publicationStatus: venueStatus
        };
      }).filter(Boolean);
    },
    async create(input) {
      if (modeName !== "admin") throw new Error("Public Viewer cannot create Exhibitions.");
      const request = input && typeof input === "object" ? input : {};
      const name = text(request.name);
      const venueId = text(request.venueId);
      const venueVersionId = text(request.venueVersionId);
      if (!name) throw new Error("Exhibition name is required.");
      if (!venueId) throw new Error("Choose a Gallery with a current Published snapshot before creating an Exhibition.");
      const id = globalThis.crypto && typeof globalThis.crypto.randomUUID === "function" ? globalThis.crypto.randomUUID() : null;
      const suffix = id ? id.slice(-6) : Date.now().toString(36).slice(-6);
      const base = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 56) || "exhibition";
      const slug = `${base}-${suffix}`;
      const created = rpcOne(await supabase.rpc("admin_create_exhibition", {
        p_venue_id: venueId,
        p_venue_version_id: venueVersionId || null,
        p_slug: slug,
        p_title: name,
        p_patch: { display_order: 0 }
      }));
      if (!created || !created.id) throw new Error("Exhibition creation returned no record.");
      const runtime = await loadAdminRuntime(supabase, created.id);
      cacheRuntime(runtime, "admin");
      return { ...runtime.exhibition };
    },
    async deletePermanent(reference) {
      if (modeName !== "admin") throw new Error("Public Viewer cannot delete Exhibitions.");
      const runtime = await resolve(reference, true);
      const exhibitionId = runtime.exhibition.id;
      let prepared = false;
      try {
        const plan = rpcOne(await supabase.rpc("admin_prepare_exhibition_delete", { p_exhibition_id: exhibitionId }));
        if (!plan) throw new Error("Exhibition delete preparation returned no result.");
        prepared = true;
        await removeStorageItemsOrThrow(supabase, plan.storageItems || []);
        const result = rpcOne(await supabase.rpc("admin_delete_exhibition", { p_exhibition_id: exhibitionId }));
        if (!result || result.deleted !== true) throw new Error("Exhibition delete returned no confirmation.");
        this.invalidate(exhibitionId);
        return result;
      } catch (error) {
        if (prepared) await supabase.rpc("admin_cancel_exhibition_delete", { p_exhibition_id: exhibitionId }).catch(() => null);
        throw error;
      }
    },
    async updateMetadata(reference, patch = {}) {
      if (modeName !== "admin") throw new Error("Public Viewer cannot update Exhibition metadata.");
      const runtime = await resolve(reference, false);
      const detailsPatch = {};
      if (patch.name !== undefined) detailsPatch.title = text(patch.name);
      if (patch.description !== undefined) detailsPatch.short_description = text(patch.description);
      if (patch.sort_order !== undefined) detailsPatch.display_order = Number(patch.sort_order) || 0;
      if (Object.keys(detailsPatch).length) {
        const detail = rpcOne(await supabase.rpc("admin_get_exhibition", { p_exhibition_id: runtime.exhibition.id }));
        if (!detail) throw new Error("Exhibition detail returned no record before product Save.");
        const state = detail.state || {};
        const card = detail.card || {};
        const response = rpcOne(await supabase.rpc("admin_save_exhibition_product_details", {
          p_exhibition_id: runtime.exhibition.id,
          p_patch: detailsPatch,
          p_expected_draft_revision: Number(state.draft_revision) || 0,
          p_expected_state_lock_version: Number(state.lock_version) || 0,
          p_expected_card_revision: Number(card.draft_revision) || 0,
          p_expected_card_lock_version: Number(card.lock_version) || 0
        }));
        if (!response || response.saved !== true) throw new Error("Exhibition product Save returned no result.");
      }
      if (patch.cover_path !== undefined) {
        const detail = rpcOne(await supabase.rpc("admin_get_exhibition", { p_exhibition_id: runtime.exhibition.id }));
        if (!detail) throw new Error("Exhibition detail returned no record before poster Save.");
        const card = detail.card || {};
        const response = rpcOne(await supabase.rpc("admin_set_exhibition_runtime_cover_product", {
          p_exhibition_id: runtime.exhibition.id,
          p_storage_path: patch.cover_path ? text(patch.cover_path) : null,
          p_mime_type: patch.cover_mime_type ? text(patch.cover_mime_type) : null,
          p_file_size: patch.cover_file_size != null ? Number(patch.cover_file_size) : null,
          p_expected_card_revision: Number(card.draft_revision) || 0,
          p_expected_card_lock_version: Number(card.lock_version) || 0
        }));
        if (!response || response.saved !== true) throw new Error("Exhibition poster product Save returned no result.");
      }
      const refreshed = await loadAdminRuntime(supabase, runtime.exhibition.id);
      cacheRuntime(refreshed, "admin");
      return { ...refreshed.exhibition };
    },
    async updateCover(reference, patch = {}) {
      if (modeName !== "admin") throw new Error("Public Viewer cannot update Exhibition poster.");
      const runtime = await resolve(reference, false);
      const detail = rpcOne(await supabase.rpc("admin_get_exhibition", { p_exhibition_id: runtime.exhibition.id }));
      if (!detail) throw new Error("Exhibition detail returned no record before poster Save.");
      const card = detail.card || {};
      const result = rpcOne(await supabase.rpc("admin_set_exhibition_runtime_cover_product", {
        p_exhibition_id: runtime.exhibition.id,
        p_storage_path: patch.cover_path ? text(patch.cover_path) : null,
        p_mime_type: patch.cover_mime_type ? text(patch.cover_mime_type) : null,
        p_file_size: patch.cover_file_size != null ? Number(patch.cover_file_size) : null,
        p_expected_card_revision: Number(card.draft_revision) || 0,
        p_expected_card_lock_version: Number(card.lock_version) || 0
      }));
      if (!result || result.saved !== true) throw new Error("Exhibition poster product Save returned no result.");
      const refreshed = await loadAdminRuntime(supabase, runtime.exhibition.id);
      cacheRuntime(refreshed, "admin");
      return { ...result, exhibition: { ...refreshed.exhibition } };
    },
    async getAdminDetail(reference) {
      if (modeName !== "admin") throw new Error("Public Viewer cannot read Admin Exhibition detail.");
      const id = await findAdminId(supabase, reference);
      if (!id) throw new Error(`Exhibition not found: ${text(reference)}`);
      const detail = rpcOne(await supabase.rpc("admin_get_exhibition", { p_exhibition_id: id }));
      if (!detail) throw new Error("Exhibition detail returned no record.");
      return detail;
    },
    async assignGallery(reference, target = {}) {
      if (modeName !== "admin") throw new Error("Public Viewer cannot assign Galleries.");
      const runtime = await resolve(reference, true);
      const response = rpcOne(await supabase.rpc("admin_assign_exhibition_gallery", {
        p_exhibition_id: runtime.exhibition.id,
        p_venue_id: text(target.venueId),
        p_venue_version_id: text(target.venueVersionId) || null,
        p_expected_draft_revision: Number(runtime.revision) || 0,
        p_expected_lock_version: Number(runtime.lockVersion) || 0
      }));
      if (!response) throw new Error("Gallery assignment returned no result.");
      runtimeByKey.delete(runtimeKey("admin", runtime.exhibition.id));
      return response;
    },
    async confirmGalleryLayout(reference) {
      if (modeName !== "admin") throw new Error("Public Viewer cannot confirm Gallery migration.");
      const runtime = await resolve(reference, true);
      const response = rpcOne(await supabase.rpc("admin_confirm_exhibition_gallery_layout", {
        p_exhibition_id: runtime.exhibition.id,
        p_expected_draft_revision: Number(runtime.revision) || 0,
        p_expected_lock_version: Number(runtime.lockVersion) || 0
      }));
      if (!response) throw new Error("Gallery layout confirmation returned no result.");
      runtimeByKey.delete(runtimeKey("admin", runtime.exhibition.id));
      return response;
    },
    async publishBundle(reference) {
      if (modeName !== "admin") throw new Error("Public Viewer cannot publish Exhibitions.");
      const detail = await this.getAdminDetail(reference);
      const state = detail.state || {};
      const card = detail.card || {};
      const response = rpcOne(await supabase.rpc("admin_publish_exhibition_bundle", {
        p_exhibition_id: detail.exhibition.id,
        p_expected_draft_revision: Number(state.draft_revision) || 0,
        p_expected_card_revision: Number(card.draft_revision) || 0,
        p_expected_state_lock_version: Number(state.lock_version) || 0,
        p_expected_card_lock_version: Number(card.lock_version) || 0
      }));
      if (!response) throw new Error("Exhibition publish returned no result.");
      runtimeByKey.delete(runtimeKey("admin", detail.exhibition.id));
      return response;
    },
    async setPublished(reference, published) {
      if (modeName !== "admin") throw new Error("Public Viewer cannot change Exhibition visibility.");
      const runtime = await resolve(reference, true);
      const response = rpcOne(await supabase.rpc("admin_set_exhibition_runtime_visibility", {
        p_exhibition_id: runtime.exhibition.id,
        p_published: published === true
      }));
      if (!response) throw new Error("Exhibition Published visibility update returned no result.");
      runtimeByKey.delete(runtimeKey("admin", runtime.exhibition.id));
      runtimeByKey.delete(runtimeKey("public", runtime.exhibition.id));
      return response;
    },
    async unpublish(reference) {
      return this.setPublished(reference, false);
    },
    async rollbackBundle(reference) {
      if (modeName !== "admin") throw new Error("Public Viewer cannot rollback Exhibitions.");
      const detail = await this.getAdminDetail(reference);
      const response = rpcOne(await supabase.rpc("admin_rollback_exhibition_bundle", { p_exhibition_id: detail.exhibition.id }));
      if (!response) throw new Error("Exhibition rollback returned no result.");
      runtimeByKey.delete(runtimeKey("admin", detail.exhibition.id));
      return response;
    },
    async resolveRuntime(reference, options = {}) {
      return resolve(reference, options.force === true);
    },
    getRuntime(reference, options = {}) {
      const ref = text(reference);
      const requestedMode = options.mode === "admin" ? "admin" : options.mode === "public" ? "public" : modeName;
      for (const [key, runtime] of runtimeByKey.entries()) {
        if (!key.startsWith(`${requestedMode}:`)) continue;
        if (runtime && runtime.exhibition && (runtime.exhibition.id === ref || runtime.exhibition.slug === ref)) return runtime;
      }
      return null;
    },
    invalidate(reference, options = {}) {
      const ref = text(reference);
      const modes = options.mode ? [options.mode === "admin" ? "admin" : "public"] : ["public", "admin"];
      let removed = 0;
      for (const modeValue of modes) {
        for (const [key, runtime] of Array.from(runtimeByKey.entries())) {
          if (!key.startsWith(`${modeValue}:`)) continue;
          if (runtime && runtime.exhibition && (runtime.exhibition.id === ref || runtime.exhibition.slug === ref)) {
            runtimeByKey.delete(key); removed += 1;
          }
        }
      }
      return removed;
    }
  });
}
