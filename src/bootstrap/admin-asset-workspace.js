/* Exhibition Platform — V14.4.7.1 Modular Frame Rail Layout + V14.3.9 Unified Asset Placement.
   Asset catalog remains in the left workspace; Props and Frames share one pointer-driven drag model. */

import { createSharedAssetApi } from "../data/shared-asset-api.js?v=v14_4_7_2_gallery_version_rebase_preservation";
import { getDefaultSharedAssetRuntimeMetadata } from "../validation/shared-asset-validation.js?v=v14_4_7_2_gallery_version_rebase_preservation";

export const ADMIN_ASSET_WORKSPACE_STAGE = "V14.4.3";

const MAX_THUMBNAIL_SOURCE_BYTES = 12 * 1024 * 1024;
const THUMBNAIL_MAX_SIDE = 640;
const THUMBNAIL_QUALITY = 0.82;

function text(value) { return String(value == null ? "" : value).trim(); }
function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
function titleCase(value) {
  return text(value).replace(/[-_]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}
function statusLabel(value) {
  const v = text(value).toLowerCase();
  if (v === "archived") return "Archived";
  if (v === "active") return "Active";
  return titleCase(v || "active");
}
function safeNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function assetMetadata(row) { return row && row.metadata && typeof row.metadata === "object" ? row.metadata : {}; }
function versionStatusClass(status) {
  const value = text(status).toLowerCase();
  if (value === "published") return "published";
  if (value === "draft") return "draft";
  if (value === "previous") return "previous";
  return "";
}
function assetTypeGlyph(type) { return text(type).toLowerCase() === "frame" ? "▣" : "◆"; }

async function decodeImage(file) {
  if (typeof createImageBitmap === "function") {
    try { return await createImageBitmap(file); } catch (_error) {}
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not decode thumbnail image.")); };
    image.src = url;
  });
}

async function optimizeThumbnail(file) {
  if (!file || !/^image\//i.test(file.type || "")) throw new Error("Choose an image file for the thumbnail.");
  if (Number(file.size || 0) > MAX_THUMBNAIL_SOURCE_BYTES) throw new Error("Thumbnail source is too large. Maximum input size is 12 MB.");
  const source = await decodeImage(file);
  const width = Number(source.width || source.naturalWidth) || 1;
  const height = Number(source.height || source.naturalHeight) || 1;
  const scale = Math.min(1, THUMBNAIL_MAX_SIDE / Math.max(width, height));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext("2d", { alpha: false, desynchronized: true });
  if (!context) throw new Error("Could not create thumbnail optimizer canvas.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.fillStyle = "#111412";
  context.fillRect(0, 0, targetWidth, targetHeight);
  context.drawImage(source, 0, 0, targetWidth, targetHeight);
  if (source && typeof source.close === "function") source.close();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", THUMBNAIL_QUALITY));
  canvas.width = 1;
  canvas.height = 1;
  if (!blob) throw new Error("Could not encode optimized thumbnail.");
  return { blob, width: targetWidth, height: targetHeight, mimeType: "image/webp", fileSize: Number(blob.size) || 0 };
}

function ensureStyles() {
  if (document.getElementById("v13AssetWorkspaceStyles")) return;
  const style = document.createElement("style");
  style.id = "v13AssetWorkspaceStyles";
  style.textContent = `
    .assetManagementSection.hidden{display:none!important}
    .assetWorkspaceBody{display:grid;gap:10px}
    .assetWorkspaceHostNote{padding:9px 10px;border:1px solid rgba(255,255,255,.10);border-radius:10px;background:rgba(255,255,255,.025);font-size:10px;line-height:1.45;color:rgba(255,255,255,.62)}
    .assetWorkspaceHostNote strong{color:rgba(255,255,255,.92)}
    .assetToolbar{display:grid;gap:8px}
    .assetSearchRow{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px}
    .assetFilterRow{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
    .assetFilterButton{height:32px;border:1px solid rgba(255,255,255,.10);border-radius:9px;background:rgba(255,255,255,.025);color:rgba(255,255,255,.62);font-size:9px;font-weight:800;letter-spacing:.08em;cursor:pointer}
    .assetFilterButton.active{background:rgba(125,160,127,.16);border-color:rgba(154,180,155,.38);color:rgba(255,255,255,.92)}
    .assetCategoryRow{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px;align-items:center}.assetCategoryRow.assetCategoryOnly{grid-template-columns:minmax(0,1fr)}
    .assetSelect{height:38px;width:100%;border:1px solid rgba(255,255,255,.18);border-radius:10px;background:#202321;color:rgba(255,255,255,.92);padding:0 10px;font:inherit;outline:none}
    .assetToggle{display:flex;align-items:center;gap:6px;font-size:9px;color:rgba(255,255,255,.62);white-space:nowrap}
    .assetCatalog{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;max-height:420px;overflow:auto;padding-right:2px}
    .assetTile{min-width:0;display:grid;grid-template-rows:92px auto;gap:7px;padding:7px;border:1px solid transparent;border-radius:12px;background:rgba(255,255,255,.02);color:rgba(255,255,255,.92);text-align:left;cursor:pointer}
    .assetTile:hover{background:rgba(255,255,255,.045)}
    .assetTile.active{border-color:rgba(154,180,155,.42);background:rgba(125,160,127,.13)}
    .assetTile.is-placeable,.assetTile.is-bindable{cursor:grab;touch-action:pan-y}.assetTile.is-placeable:active,.assetTile.is-bindable:active,.assetTile.is-pointer-dragging{cursor:grabbing}.assetTile.is-placeable .assetThumb,.assetTile.is-bindable .assetThumb{box-shadow:inset 0 0 0 1px rgba(154,180,155,.18)}
    .assetTile.is-placement-active,.assetTile.is-binding-target{border-color:rgba(180,205,181,.72);background:rgba(125,160,127,.20)}
    .assetPlaceHint{position:absolute;right:6px;top:6px;padding:3px 5px;border-radius:6px;background:rgba(83,111,85,.90);font-size:8px;font-weight:800;letter-spacing:.07em;color:#edf4ee}
    .assetPlacementPanel{display:grid;gap:7px;padding:10px;border:1px solid rgba(154,180,155,.28);border-radius:10px;background:rgba(125,160,127,.075)}
    .assetPlacementPanel strong{font-size:10px}.assetPlacementPanel .assetMuted{margin:0}
    .assetThumb{position:relative;display:grid;place-items:center;width:100%;height:92px;overflow:hidden;border:1px solid rgba(255,255,255,.10);border-radius:9px;background:linear-gradient(145deg,rgba(255,255,255,.055),rgba(255,255,255,.015))}
    .assetThumb img{width:100%;height:100%;object-fit:cover;display:block}
    .assetThumbGlyph{font-size:24px;opacity:.72}.assetThumbType{position:absolute;left:6px;bottom:6px;padding:3px 5px;border-radius:6px;background:rgba(5,7,6,.78);font-size:8px;font-weight:800;letter-spacing:.08em}
    .assetTileMeta{min-width:0}.assetTileMeta strong{display:block;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.assetTileMeta span{display:block;margin-top:3px;font-size:9px;line-height:1.35;color:rgba(255,255,255,.58);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .assetEmpty{grid-column:1/-1;padding:14px 10px;border:1px dashed rgba(255,255,255,.12);border-radius:10px;color:rgba(255,255,255,.58);font-size:10px;line-height:1.5;text-align:center}
    .assetCreatePanel,.assetDetailPanel{display:grid;gap:10px}
    .assetCreateGrid,.assetDetailGrid{display:grid;gap:9px}
    .assetTwoCols{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .assetTypeLock{padding:9px 10px;border:1px solid rgba(255,255,255,.10);border-radius:10px;background:rgba(255,255,255,.025);font-size:10px;color:rgba(255,255,255,.62)}
    .assetTypeLock strong{color:rgba(255,255,255,.92)}
    .assetDetailHead{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.assetDetailHead h3{margin:0;font-size:12px}.assetDetailHead p{margin:4px 0 0;font-size:9px;color:rgba(255,255,255,.58);line-height:1.4}
    .assetBadgeRow{display:flex;flex-wrap:wrap;gap:5px}.assetBadge{padding:4px 6px;border:1px solid rgba(255,255,255,.10);border-radius:999px;background:rgba(255,255,255,.025);font-size:8px;font-weight:800;letter-spacing:.06em;color:rgba(255,255,255,.68)}
    .assetBadge.published{border-color:rgba(127,169,130,.35);color:#bcd7be}.assetBadge.draft{border-color:rgba(199,176,105,.35);color:#e3d3a3}.assetBadge.archived{border-color:rgba(209,139,139,.35);color:#e0b2b2}
    .assetThumbnailCard{display:grid;grid-template-columns:94px minmax(0,1fr);gap:10px}.assetThumbnailPreview{width:94px;height:94px;border:1px solid rgba(255,255,255,.10);border-radius:10px;overflow:hidden;background:rgba(255,255,255,.025);display:grid;place-items:center}.assetThumbnailPreview img{width:100%;height:100%;object-fit:cover}.assetThumbnailActions{display:grid;align-content:start;gap:7px}
    .assetHiddenInput{display:none}
    .assetProgress{display:none;height:5px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden}.assetProgress.active{display:block}.assetProgress>span{display:block;height:100%;width:0;background:rgba(154,180,155,.72);transition:width .08s linear}
    .assetRuntimeFields{display:grid;gap:8px;padding:9px;border:1px solid rgba(255,255,255,.10);border-radius:10px;background:rgba(255,255,255,.018)}
    .assetRuntimeFields h4{margin:0;font-size:9px;letter-spacing:.08em;text-transform:uppercase}.assetRuntimeGrid{display:grid;grid-template-columns:1fr 1fr;gap:7px}
    .assetVersionList,.assetUsageList{display:grid;gap:6px}.assetVersionRow,.assetUsageRow{display:grid;gap:5px;padding:8px 9px;border:1px solid rgba(255,255,255,.08);border-radius:9px;background:rgba(255,255,255,.018);font-size:9px}.assetVersionLine,.assetUsageLine{display:flex;align-items:center;justify-content:space-between;gap:8px}.assetVersionLine strong,.assetUsageLine strong{font-size:9px}.assetVersionRow span,.assetUsageRow span{color:rgba(255,255,255,.58);line-height:1.4}
    .assetActionRow{display:flex;flex-wrap:wrap;gap:7px}.assetActionRowRight{justify-content:flex-end}.assetDeleteButton{min-width:38px;padding:0 10px}.assetFileInput{padding:8px;height:auto}.assetDangerNote{font-size:9px;color:#d8a7a7;line-height:1.45}.assetMuted{font-size:9px;color:rgba(255,255,255,.58);line-height:1.45}
    .assetManagementSection .adminButton.small{min-height:31px;padding:0 9px;font-size:9px}
    @media(max-width:520px){.assetCatalog{grid-template-columns:1fr}.assetTwoCols,.assetRuntimeGrid{grid-template-columns:1fr}.assetThumbnailCard{grid-template-columns:74px minmax(0,1fr)}.assetThumbnailPreview{width:74px;height:74px}}
  `;
  document.head.appendChild(style);
}

export function createAdminAssetWorkspace({
  supabase,
  sidebar,
  showToast = () => {},
  loadVenueOptions = async () => [],
  onUiStateChange = () => {},
  getPlacementContext = () => null,
  onBeginPropPlacement = async () => false,
  onCancelPropPlacement = () => {},
  onUpdatePropPointerPlacement = () => false,
  onCommitPropPointerPlacement = async () => false,
  getFrameBindingContext = () => null,
  onBeginFrameDrag = async () => false,
  onCancelFrameDrag = () => {},
  onUpdateFramePointerDrag = () => false,
  onCommitFramePointerDrag = async () => false,
  onBindFrame = async () => false,
  onFrameBindingComplete = () => {},
  onAssetModelReplaced = async () => ({ refreshed: false, reason: "no-refresh-bridge" })
} = {}) {
  if (!supabase) throw new Error("Supabase client is required for the Asset Workspace.");
  if (!sidebar) throw new Error("Canonical Admin sidebar is required for the Asset Workspace.");
  ensureStyles();
  const api = createSharedAssetApi({ supabase });

  const state = {
    visible: false,
    hostSection: "exhibitions",
    returnSection: "exhibitions",
    catalog: [],
    venues: [],
    selectedAssetId: "",
    selectedDetail: null,
    usages: [],
    filter: "all",
    category: "all",
    search: "",
    busy: false,
    requestId: 0,
    placementDescriptor: null,
    frameDragDescriptor: null,
    frameBindingTarget: null
  };

  const catalogSection = document.createElement("section");
  catalogSection.className = "workspaceSection assetManagementSection hidden";
  catalogSection.innerHTML = `
    <div class="sectionHead"><div><h2>Asset Library</h2><p>Reusable Props and artwork-only Frames.</p></div><button id="refreshSharedAssetsButton" class="adminButton" type="button">↻</button></div>
    <div class="sectionBody assetWorkspaceBody">
      <div id="assetWorkspaceHostNote" class="assetWorkspaceHostNote"></div>
      <div class="assetToolbar">
        <div class="assetSearchRow"><input id="sharedAssetSearch" class="adminInput" maxlength="120" placeholder="Search assets…" autocomplete="off"><button id="addSharedAssetButton" class="adminButton primary" type="button">+ ADD</button></div>
        <div id="sharedAssetFilterRow" class="assetFilterRow"><button class="assetFilterButton active" type="button" data-asset-filter="all">ALL</button><button class="assetFilterButton" type="button" data-asset-filter="prop">PROPS</button><button class="assetFilterButton" type="button" data-asset-filter="frame">FRAMES</button></div>
        <div class="assetCategoryRow assetCategoryOnly"><select id="sharedAssetCategory" class="assetSelect"><option value="all">All categories</option></select></div>
      </div>
      <div id="sharedAssetCatalog" class="assetCatalog"><div class="assetEmpty">Loading Asset Library…</div></div>
    </div>`;

  const detailSection = document.createElement("section");
  detailSection.className = "workspaceSection assetManagementSection hidden";
  detailSection.innerHTML = `<div class="sectionHead"><div><h2>Asset details</h2><p>Edit, replace the model, use it, or delete it safely.</p></div></div><div id="sharedAssetDetailBody" class="sectionBody"><div class="assetMuted">Select an asset.</div></div>`;

  sidebar.append(catalogSection, detailSection);

  const $ = (id) => document.getElementById(id);
  const catalogEl = () => $("sharedAssetCatalog");
  const detailEl = () => $("sharedAssetDetailBody");

  function emitUiState() {
    onUiStateChange({
      hostSection: state.hostSection,
      returnSection: state.returnSection,
      selectedAssetId: state.selectedAssetId || null,
      filter: state.filter === "all" ? null : state.filter
    });
  }

  function setBusy(busy) {
    state.busy = !!busy;
    [catalogSection, detailSection].forEach((root) => root.querySelectorAll("button,input,select,textarea").forEach((node) => {
      if (busy) {
        if (!Object.prototype.hasOwnProperty.call(node.dataset, "assetBusyDisabled")) node.dataset.assetBusyDisabled = node.disabled ? "1" : "0";
        node.disabled = true;
      } else if (Object.prototype.hasOwnProperty.call(node.dataset, "assetBusyDisabled")) {
        node.disabled = node.dataset.assetBusyDisabled === "1";
        delete node.dataset.assetBusyDisabled;
      }
    }));
  }

  async function withBusy(operation) {
    if (state.busy) return null;
    setBusy(true);
    try { return await operation(); }
    finally { setBusy(false); }
  }

  function currentThumbnailUrl(row) {
    const metadata = assetMetadata(row && row.asset ? row.asset : row);
    const bucket = text(metadata.thumbnailStorageBucket || metadata.thumbnail_storage_bucket || "shared-assets") || "shared-assets";
    const path = text(metadata.thumbnailStoragePath || metadata.thumbnail_storage_path);
    if (!path) return "";
    const response = supabase.storage.from(bucket).getPublicUrl(path);
    return response && response.data ? text(response.data.publicUrl) : "";
  }

  function filteredCatalog() {
    const query = state.search.toLowerCase();
    return state.catalog.filter((row) => {
      const type = text(row.asset_type).toLowerCase();
      const category = text(row.category);
      if (state.filter !== "all" && type !== state.filter) return false;
      if (state.category !== "all" && category !== state.category) return false;
      if (query && !`${row.name || ""} ${row.slug || ""} ${row.category || ""}`.toLowerCase().includes(query)) return false;
      return true;
    });
  }

  function readPlacementContext() {
    const context = getPlacementContext ? getPlacementContext() : null;
    return context && typeof context === "object" ? context : null;
  }

  function getPublishedVersion(source) {
    const asset = source && source.asset ? source.asset : source;
    const versions = Array.isArray(source && source.versions) ? source.versions : [];
    if (!asset) return null;
    const detailed = versions.find((version) => version.id === asset.published_version_id) || versions.find((version) => version.status === "published") || null;
    if (detailed) return detailed;
    if (!asset.published_version_id || !asset.published_storage_path) return null;
    return {
      id: asset.published_version_id,
      version_number: asset.published_version_number,
      status: "published",
      storage_bucket: asset.published_storage_bucket || api.bucket || "shared-assets",
      storage_path: asset.published_storage_path,
      file_hash: asset.published_file_hash || null,
      runtime_metadata: asset.published_runtime_metadata && typeof asset.published_runtime_metadata === "object"
        ? asset.published_runtime_metadata
        : null
    };
  }

  function buildPropPlacementDescriptor(source) {
    const asset = source && source.asset ? source.asset : source;
    const version = getPublishedVersion(source);
    if (!asset || text(asset.asset_type).toLowerCase() !== "prop" || !version || !version.id || !version.storage_path) return null;
    const runtimeMetadata = version.runtime_metadata && typeof version.runtime_metadata === "object" ? version.runtime_metadata : getDefaultSharedAssetRuntimeMetadata("prop");
    return {
      schema: "exhibition-platform-prop-placement.v1",
      assetId: asset.id,
      assetVersionId: version.id,
      assetVersionNumber: Number(version.version_number) || null,
      assetType: "prop",
      assetName: asset.name || asset.slug || "Prop",
      category: asset.category || "",
      scopeType: asset.scope_type || "platform",
      scopeVenueId: asset.scope_venue_id || null,
      storageBucket: version.storage_bucket || api.bucket || "shared-assets",
      storagePath: version.storage_path,
      publicUrl: api.getPublicVersionUrl(version),
      fileHash: version.file_hash || null,
      runtimeMetadata
    };
  }

  function buildFrameBindingDescriptor(source) {
    const asset = source && source.asset ? source.asset : source;
    const version = getPublishedVersion(source);
    if (!asset || text(asset.asset_type).toLowerCase() !== "frame" || !version || !version.id || !version.storage_path) return null;
    const runtimeMetadata = version.runtime_metadata && typeof version.runtime_metadata === "object" ? version.runtime_metadata : getDefaultSharedAssetRuntimeMetadata("frame");
    if (text(runtimeMetadata.placementMode || runtimeMetadata.placement_mode).toLowerCase() !== "artwork-only") return null;
    return {
      schema: "exhibition-platform-frame-binding.v1",
      assetId: asset.id,
      assetVersionId: version.id,
      assetVersionNumber: Number(version.version_number) || null,
      assetType: "frame",
      assetName: asset.name || asset.slug || "Frame",
      label: asset.name || asset.slug || "Frame",
      category: asset.category || "",
      scopeType: asset.scope_type || "platform",
      scopeVenueId: asset.scope_venue_id || null,
      storageBucket: version.storage_bucket || api.bucket || "shared-assets",
      storagePath: version.storage_path,
      publicUrl: api.getPublicVersionUrl(version),
      fileHash: version.file_hash || null,
      runtimeMetadata
    };
  }

  function getFrameDragCapability(source) {
    const descriptor = buildFrameBindingDescriptor(source);
    const asset = source && source.asset ? source.asset : source;
    if (asset && text(asset.status).toLowerCase() === "archived") return { allowed: false, reason: "Restore this Frame before assigning it.", descriptor, context: readPlacementContext() };
    if (state.hostSection !== "exhibitions") return { allowed: false, reason: "Open Assets from an Exhibition to assign Frames.", descriptor, context: null };
    const context = readPlacementContext();
    if (!context || !context.exhibitionId) return { allowed: false, reason: "No active Exhibition Frame context.", descriptor, context };
    if (!descriptor) return { allowed: false, reason: "Publish a validated Frame version before assignment.", descriptor: null, context };
    if (descriptor.scopeType === "venue" && (!context.venueId || String(descriptor.scopeVenueId) !== String(context.venueId))) {
      return { allowed: false, reason: "This Frame is scoped to another Gallery.", descriptor, context };
    }
    return { allowed: true, reason: "Drag this Frame onto an artwork.", descriptor, context };
  }

  async function bindFrameToTarget(source) {
    const target = state.frameBindingTarget;
    if (!target) throw new Error("No artwork is waiting for a Frame selection.");
    const capability = getFrameDragCapability(source);
    if (!capability.allowed || !capability.descriptor) throw new Error(capability.reason);
    const liveTarget = getFrameBindingContext ? getFrameBindingContext() : null;
    if (!liveTarget || String(liveTarget.artworkId || "") !== String(target.artworkId || "")) throw new Error("Artwork selection changed. Use FRAME → CHANGE again.");
    if (target.exhibitionId && String(liveTarget.exhibitionId || "") !== String(target.exhibitionId)) throw new Error("Exhibition changed. Use FRAME → CHANGE again.");
    if (target.venueVersionId && String(liveTarget.venueVersionId || "") !== String(target.venueVersionId)) throw new Error("Gallery Version changed. Use FRAME → CHANGE again.");
    const ok = await onBindFrame(capability.descriptor, { target: liveTarget, context: capability.context || null, source: "browser-click" });
    if (ok === false) return false;
    state.frameBindingTarget = null;
    renderHostNote();
    renderCatalog();
    showToast(`Frame assigned: ${capability.descriptor.assetName}.`);
    onFrameBindingComplete({ target: liveTarget, descriptor: capability.descriptor });
    return true;
  }

  function getPropPlacementCapability(detail) {
    const descriptor = buildPropPlacementDescriptor(detail);
    const asset = detail && detail.asset ? detail.asset : detail;
    if (asset && text(asset.status).toLowerCase() === "archived") return { allowed: false, reason: "Restore this Asset before placing new instances.", descriptor, context: readPlacementContext() };
    if (state.hostSection !== "exhibitions") return { allowed: false, reason: "Open Assets from an Exhibition to place Props.", descriptor, context: null };
    const context = readPlacementContext();
    if (!context || !context.exhibitionId) return { allowed: false, reason: "No active Exhibition placement context.", descriptor, context };
    if (!descriptor) return { allowed: false, reason: "Publish a validated Prop version before placement.", descriptor: null, context };
    if (descriptor.scopeType === "venue" && (!context.venueId || String(descriptor.scopeVenueId) !== String(context.venueId))) {
      return { allowed: false, reason: "This Prop is scoped to another Gallery.", descriptor, context };
    }
    return { allowed: true, reason: "Drag this Prop onto the Gallery floor.", descriptor, context };
  }


  function renderHostNote() {
    const note = $("assetWorkspaceHostNote");
    if (!note) return;
    if (state.hostSection === "galleries") {
      note.innerHTML = `<strong>Gallery preview preserved.</strong> Library management is available. Exhibition Prop placement and Frame binding stay disabled in Gallery context.`;
    } else if (state.frameBindingTarget) {
      const label = escapeHtml(state.frameBindingTarget.artworkLabel || state.frameBindingTarget.artworkId || "selected artwork");
      note.innerHTML = `<strong>Choose a Frame for ${label}.</strong> Click a Published Frame to bind it. The artwork selection and unsaved Exhibition Draft stay active.`;
    } else {
      note.innerHTML = `<strong>Exhibition preview preserved.</strong> Drag Props onto the floor and Frames onto artworks with mouse, pen or touch. FRAME → CHANGE remains available as a compatibility shortcut.`;
    }
  }

  function rebuildCategoryOptions() {
    const select = $("sharedAssetCategory");
    if (!select) return;
    const values = [...new Set(state.catalog.map((row) => text(row.category)).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const selected = values.includes(state.category) ? state.category : "all";
    select.replaceChildren(new Option("All categories", "all"), ...values.map((value) => new Option(value, value)));
    select.value = selected;
    state.category = selected;
  }

  function installUnifiedPointerPlacement(tile, row, kind) {
    const isProp = kind === "prop";
    const capabilityFor = isProp ? getPropPlacementCapability : getFrameDragCapability;
    const begin = isProp ? onBeginPropPlacement : onBeginFrameDrag;
    const cancel = isProp ? onCancelPropPlacement : onCancelFrameDrag;
    const update = isProp ? onUpdatePropPointerPlacement : onUpdateFramePointerDrag;
    const commit = isProp ? onCommitPropPointerPlacement : onCommitFramePointerDrag;
    const threshold = 8;
    let session = null;
    let suppressNextClick = false;

    const clearDescriptor = () => {
      if (isProp) state.placementDescriptor = null;
      else state.frameDragDescriptor = null;
    };

    const finish = async (event, canceled) => {
      if (!session || !event || event.pointerId !== session.pointerId) return;
      const current = session;
      session = null;
      try { if (tile.hasPointerCapture && tile.hasPointerCapture(current.pointerId)) tile.releasePointerCapture(current.pointerId); } catch (_error) {}
      tile.classList.remove("is-pointer-dragging");
      if (!current.active || canceled) {
        cancel({ reason: canceled ? "pointer-cancel" : "pointer-click" });
        clearDescriptor();
        return;
      }
      suppressNextClick = true;
      event.preventDefault();
      try {
        const begun = await current.beginPromise;
        if (begun === false) throw new Error(isProp ? "Prop placement context is no longer valid." : "Frame assignment context is no longer valid.");
        const result = await commit(event.clientX, event.clientY, { descriptor: current.descriptor, context: current.context, pointerType: event.pointerType || "mouse" });
        if (result === false) showToast(isProp ? "Drop the Prop on the Gallery floor." : "Drop the Frame directly on an artwork.");
      } catch (error) {
        cancel({ reason: "pointer-drop-failed" });
        showToast(error && error.message ? error.message : String(error));
      } finally {
        clearDescriptor();
        renderCatalog();
      }
    };

    tile.addEventListener("pointerdown", (event) => {
      if (event.isPrimary === false || (event.button != null && event.button !== 0)) return;
      const capability = capabilityFor(row);
      if (!capability.allowed || !capability.descriptor) return;
      const descriptor = capability.descriptor;
      if (isProp) state.placementDescriptor = descriptor;
      else state.frameDragDescriptor = descriptor;
      const beginPromise = Promise.resolve(begin(descriptor, { drag: true, pointer: true, context: capability.context || null })).catch((error) => {
        clearDescriptor();
        cancel({ reason: "pointer-begin-failed" });
        showToast(error && error.message ? error.message : String(error));
        return false;
      });
      session = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        active: false,
        descriptor,
        context: capability.context || null,
        beginPromise
      };
      try { tile.setPointerCapture(event.pointerId); } catch (_error) {}
    });

    tile.addEventListener("pointermove", (event) => {
      if (!session || event.pointerId !== session.pointerId) return;
      const distance = Math.hypot(event.clientX - session.startX, event.clientY - session.startY);
      if (!session.active && distance < threshold) return;
      if (!session.active) {
        session.active = true;
        tile.classList.add("is-pointer-dragging");
      }
      event.preventDefault();
      try { update(event.clientX, event.clientY, { descriptor: session.descriptor, context: session.context, pointerType: event.pointerType || "mouse" }); }
      catch (_error) {}
    });

    tile.addEventListener("pointerup", (event) => { void finish(event, false); });
    tile.addEventListener("pointercancel", (event) => { void finish(event, true); });
    tile.addEventListener("lostpointercapture", (event) => {
      if (session && event.pointerId === session.pointerId) void finish(event, true);
    });
    tile.addEventListener("click", (event) => {
      if (!suppressNextClick) return;
      suppressNextClick = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
  }

  function renderCatalog() {
    rebuildCategoryOptions();
    const root = catalogEl();
    if (!root) return;
    root.replaceChildren();
    const rows = filteredCatalog();
    if (!rows.length) {
      const empty = document.createElement("div");
      empty.className = "assetEmpty";
      empty.textContent = state.catalog.length ? "No Assets match the current filters." : "No Shared Assets found. Use + ADD to create the first catalog item.";
      root.appendChild(empty);
      return;
    }
    rows.forEach((row) => {
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = "assetTile" + (row.id === state.selectedAssetId ? " active" : "");
      tile.dataset.assetId = row.id;
      const rowType = text(row.asset_type).toLowerCase();
      const rowPlacementCandidate = state.hostSection === "exhibitions" && rowType === "prop" && !!row.published_version_number && row.status !== "archived";
      const rowFrameCandidate = state.hostSection === "exhibitions" && rowType === "frame" && !!row.published_version_number && row.status !== "archived";
      if (rowPlacementCandidate) tile.classList.add("is-placeable");
      if (rowFrameCandidate) tile.classList.add("is-bindable");
      if (state.placementDescriptor && state.placementDescriptor.assetId === row.id) tile.classList.add("is-placement-active");
      if (state.frameBindingTarget && rowFrameCandidate) tile.classList.add("is-binding-target");
      const thumb = document.createElement("div");
      thumb.className = "assetThumb";
      const url = currentThumbnailUrl(row);
      if (url) {
        const image = document.createElement("img");
        image.loading = "lazy";
        image.decoding = "async";
        image.alt = "";
        image.src = url;
        thumb.appendChild(image);
      } else {
        const glyph = document.createElement("div"); glyph.className = "assetThumbGlyph"; glyph.textContent = assetTypeGlyph(row.asset_type); thumb.appendChild(glyph);
      }
      const type = document.createElement("span"); type.className = "assetThumbType"; type.textContent = text(row.asset_type).toUpperCase(); thumb.appendChild(type);
      if (rowPlacementCandidate || rowFrameCandidate) { const hint = document.createElement("span"); hint.className = "assetPlaceHint"; hint.textContent = rowFrameCandidate ? "DRAG TO ART" : "DRAG"; thumb.appendChild(hint); }
      const meta = document.createElement("div"); meta.className = "assetTileMeta";
      const name = document.createElement("strong"); name.textContent = row.name || row.slug || "Untitled Asset";
      const line = document.createElement("span");
      line.textContent = `${row.category || "Uncategorized"} · ${row.scope_type === "venue" ? "Gallery" : "Shared"} · ${row.published_version_number ? "Ready" : "Needs model"}`;
      meta.append(name, line); tile.append(thumb, meta);
      tile.addEventListener("click", () => {
        if (state.frameBindingTarget && rowFrameCandidate) void bindFrameToTarget(row).catch((error) => showToast(error.message || String(error)));
        else void selectAsset(row.id);
      });
      if (rowPlacementCandidate) installUnifiedPointerPlacement(tile, row, "prop");
      else if (rowFrameCandidate) installUnifiedPointerPlacement(tile, row, "frame");
      root.appendChild(tile);
    });
  }

  function runtimeFieldsMarkup(assetType, defaults) {
    if (assetType === "frame") {
      const canonical = { ...getDefaultSharedAssetRuntimeMetadata("frame"), ...(defaults && typeof defaults === "object" ? defaults : {}), frameLayout: "modular-rails-v1" };
      return `<div class="assetRuntimeFields"><h4>Frame layout</h4><div class="assetRuntimeGrid">
        <label class="fieldLabel">Layout<input class="adminInput" value="Modular rails v1" readonly></label>
        <label class="fieldLabel">Depth overlap<input id="assetRuntimeDepthOverlap" class="adminInput" type="number" min="0" max="1" step="0.01" value="${canonical.depthOverlapRatio}"></label>
        <label class="fieldLabel">Z rotation<input id="assetRuntimeZRotation" class="adminInput" type="number" step="1" value="${canonical.zRotationDegrees}"></label>
        <label class="fieldLabel">Y facing<input id="assetRuntimeYFacing" class="adminInput" type="number" step="1" value="${canonical.yFacingDegrees}"></label>
      </div><div class="assetMuted">New Frame models must contain exactly 8 named parts: 4 CORNER_* meshes and 4 RAIL_* meshes. Corners keep their proportions; only rails stretch along their measured length axis.</div></div>`;
    }
    return `<div class="assetRuntimeFields"><h4>Prop defaults</h4><div class="assetRuntimeGrid"><label class="fieldLabel">Default scale<input id="assetRuntimeDefaultScale" class="adminInput" type="number" min="0.001" step="0.01" value="${defaults.defaultScale}"></label><label class="fieldLabel">Placement<input class="adminInput" value="Floor" readonly></label></div><div class="assetMuted">Published Props are placed per Exhibition. Default scale is applied to every new instance.</div></div>`;
  }

  function readRuntimeMetadata(assetType) {
    const defaults = getDefaultSharedAssetRuntimeMetadata(assetType);
    if (assetType === "frame") {
      return {
        ...defaults,
        placementMode: "artwork-only",
        frameLayout: "modular-rails-v1",
        depthOverlapRatio: safeNumber($("assetRuntimeDepthOverlap") && $("assetRuntimeDepthOverlap").value, defaults.depthOverlapRatio),
        zRotationDegrees: safeNumber($("assetRuntimeZRotation") && $("assetRuntimeZRotation").value, defaults.zRotationDegrees),
        yFacingDegrees: safeNumber($("assetRuntimeYFacing") && $("assetRuntimeYFacing").value, defaults.yFacingDegrees)
      };
    }
    return { ...defaults, defaultScale: safeNumber($("assetRuntimeDefaultScale") && $("assetRuntimeDefaultScale").value, defaults.defaultScale) };
  }

  function bindDetailActions(detail) {
    const asset = detail.asset;
    const metadataForm = $("sharedAssetMetadataForm");
    if (metadataForm) metadataForm.addEventListener("submit", (event) => {
      event.preventDefault();
      void withBusy(async () => {
        const updated = await api.update(asset.id, {
          name: text($("sharedAssetDetailName").value),
          category: text($("sharedAssetDetailCategory").value),
          metadata: { ...assetMetadata(asset), description: text($("sharedAssetDetailDescription").value) }
        });
        showToast("Asset details saved.");
        await refreshCatalog({ preserveSelection: true, forceDetail: true, localAsset: updated });
      }).catch((error) => showToast(error.message || String(error)));
    });

    const thumbnailInput = $("sharedAssetThumbnailInput");
    const chooseThumbnail = $("sharedAssetChooseThumbnail");
    if (chooseThumbnail && thumbnailInput) chooseThumbnail.addEventListener("click", () => thumbnailInput.click());
    if (thumbnailInput) thumbnailInput.addEventListener("change", () => {
      const file = thumbnailInput.files && thumbnailInput.files[0]; thumbnailInput.value = "";
      if (!file) return;
      void withBusy(async () => {
        const optimized = await optimizeThumbnail(file);
        await api.uploadThumbnail(asset.id, optimized.blob, { mimeType: optimized.mimeType, width: optimized.width, height: optimized.height });
        showToast("Asset thumbnail updated.");
        await refreshCatalog({ preserveSelection: true, forceDetail: true });
      }).catch((error) => showToast(error.message || String(error)));
    });
    const removeThumbnail = $("sharedAssetRemoveThumbnail");
    if (removeThumbnail) removeThumbnail.addEventListener("click", () => {
      void withBusy(async () => {
        await api.removeThumbnail(asset.id);
        showToast("Asset thumbnail removed.");
        await refreshCatalog({ preserveSelection: true, forceDetail: true });
      }).catch((error) => showToast(error.message || String(error)));
    });

    const versionInput = $("sharedAssetVersionInput");
    const chooseVersion = $("sharedAssetChooseVersion");
    if (chooseVersion && versionInput) chooseVersion.addEventListener("click", () => versionInput.click());
    if (versionInput) versionInput.addEventListener("change", () => {
      const file = versionInput.files && versionInput.files[0]; versionInput.value = "";
      if (!file) return;
      void withBusy(async () => {
        const progress = $("sharedAssetUploadProgress");
        const bar = progress && progress.querySelector("span");
        if (progress) progress.classList.add("active");
        if (bar) bar.style.width = "4%";
        try {
          const replaced = await api.replaceModel(asset.id, file, {
            runtimeMetadata: readRuntimeMetadata(asset.asset_type),
            onProgress: ({ loaded, total }) => {
              if (!bar) return;
              const percent = total ? Math.max(4, Math.min(92, Math.round((loaded / total) * 92))) : 32;
              bar.style.width = `${percent}%`;
            }
          });
          if (bar) bar.style.width = "100%";
          const currentDescriptor = text(asset.asset_type).toLowerCase() === "frame"
            ? buildFrameBindingDescriptor({ asset: replaced.asset, versions: [replaced.version] })
            : buildPropPlacementDescriptor({ asset: replaced.asset, versions: [replaced.version] });
          let propagation = null;
          if (asset.published_version_id && currentDescriptor) {
            try {
              propagation = await onAssetModelReplaced(currentDescriptor, {
                assetId: asset.id,
                assetType: text(asset.asset_type).toLowerCase(),
                previousVersionId: replaced.previousVersionId || asset.published_version_id || null,
                currentVersionId: replaced.version && replaced.version.id ? replaced.version.id : null
              });
            } catch (refreshError) {
              propagation = { refreshedCount: 0, failedCount: 1, reason: "live-runtime-refresh-error" };
              console.warn("Shared Asset Replace succeeded but live Admin refresh failed:", refreshError);
            }
          }
          showToast(asset.published_version_id
            ? (propagation && Number(propagation.failedCount) > 0
                ? "Asset model replaced. Some visible uses could not refresh; reload or switch the Exhibition to resolve the current model."
                : propagation && Number(propagation.refreshedCount) > 0
                  ? `Asset model replaced · refreshed ${Number(propagation.refreshedCount)} visible use${Number(propagation.refreshedCount) === 1 ? "" : "s"}.`
                  : "Asset model replaced.")
            : "Asset model added.");
          await refreshCatalog({ preserveSelection: true, forceDetail: true });
        } finally {
          if (progress) setTimeout(() => progress.classList.remove("active"), 250);
        }
      }).catch((error) => showToast(error.message || String(error)));
    });

    const deleteButton = $("sharedAssetDeleteButton");
    if (deleteButton) deleteButton.addEventListener("click", () => {
      const referenceCount = state.usages.length || Number(detail.usageCount) || 0;
      if (referenceCount > 0) {
        showToast(`Delete blocked: this Asset is still used by ${referenceCount} retained Exhibition state reference${referenceCount === 1 ? "" : "s"}.`);
        return;
      }
      if (!window.confirm(`Permanently delete ${asset.name || "this Asset"} and its stored model/thumbnail files? This cannot be undone.`)) return;
      void withBusy(async () => {
        await api.deletePermanent(asset.id);
        state.selectedAssetId = "";
        state.selectedDetail = null;
        state.usages = [];
        showToast("Asset deleted.");
        await refreshCatalog({ preserveSelection: false });
        renderDetail();
        emitUiState();
      }).catch((error) => showToast(error.message || String(error)));
    });

  }

  function renderDetail() {
    const root = detailEl();
    if (!root) return;
    if (!state.selectedDetail || !state.selectedDetail.asset) {
      root.innerHTML = `<div class="assetMuted">Select an asset.</div>`;
      return;
    }
    const detail = state.selectedDetail;
    const asset = detail.asset;
    const versions = Array.isArray(detail.versions) ? detail.versions : [];
    const published = versions.find((version) => version.id === asset.published_version_id) || versions.find((version) => version.status === "published") || null;
    const defaults = getDefaultSharedAssetRuntimeMetadata(asset.asset_type);
    const thumbUrl = currentThumbnailUrl(asset);
    const scope = asset.scope_type === "venue" ? `Gallery scoped · ${state.venues.find((v) => v.id === asset.scope_venue_id)?.name || asset.scope_venue_id || "Gallery"}` : "Shared across Galleries";
    const description = text(assetMetadata(asset).description);
    const placement = getPropPlacementCapability(detail);
    const placementMarkup = text(asset.asset_type).toLowerCase() === "prop" ? `<div class="assetPlacementPanel"><strong>Use in Exhibition</strong><p class="assetMuted">${escapeHtml(placement.reason)}</p></div>` : "";
    root.innerHTML = `<div class="assetDetailPanel">
      <div class="assetDetailHead"><div><h3>${escapeHtml(asset.name || asset.slug || "Asset")}</h3><p>${escapeHtml(scope)}</p></div><div class="assetBadgeRow"><span class="assetBadge">${escapeHtml(text(asset.asset_type).toUpperCase())}</span>${published ? `<span class="assetBadge published">READY</span>` : `<span class="assetBadge">NEEDS MODEL</span>`}</div></div>
      ${placementMarkup}
      <form id="sharedAssetMetadataForm" class="assetDetailGrid"><label class="fieldLabel">Name<input id="sharedAssetDetailName" class="adminInput" maxlength="120" value="${escapeHtml(asset.name || "")}"></label><div class="assetTwoCols"><label class="fieldLabel">Category<input id="sharedAssetDetailCategory" class="adminInput" maxlength="80" value="${escapeHtml(asset.category || "")}"></label><div class="assetTypeLock">Type / scope<br><strong>${escapeHtml(text(asset.asset_type).toUpperCase())} · ${escapeHtml(asset.scope_type === "venue" ? "GALLERY" : "SHARED")}</strong></div></div><label class="fieldLabel">Description<textarea id="sharedAssetDetailDescription" class="adminTextarea" maxlength="1000" placeholder="Internal catalog note">${escapeHtml(description)}</textarea></label><button class="adminButton" type="submit">SAVE ASSET DETAILS</button></form>
      <div><div class="fieldLabel" style="margin-bottom:7px">Thumbnail</div><div class="assetThumbnailCard"><div class="assetThumbnailPreview">${thumbUrl ? `<img src="${escapeHtml(thumbUrl)}" alt="">` : `<span class="assetThumbGlyph">${assetTypeGlyph(asset.asset_type)}</span>`}</div><div class="assetThumbnailActions"><button id="sharedAssetChooseThumbnail" class="adminButton small" type="button">UPLOAD THUMBNAIL</button><button id="sharedAssetRemoveThumbnail" class="adminButton small danger" type="button" ${thumbUrl ? "" : "disabled"}>REMOVE</button><input id="sharedAssetThumbnailInput" class="assetHiddenInput" type="file" accept="image/jpeg,image/png,image/webp,image/avif"><div class="assetMuted">Images are optimized locally to WebP; the catalog never downloads GLBs just to draw tiles.</div></div></div></div>
      <div><div class="fieldLabel" style="margin-bottom:7px">Model</div>${runtimeFieldsMarkup(asset.asset_type, published && published.runtime_metadata && typeof published.runtime_metadata === "object" ? published.runtime_metadata : defaults)}<div style="height:8px"></div><button id="sharedAssetChooseVersion" class="adminButton primary" type="button">${published ? "REPLACE MODEL" : "ADD MODEL"}</button><input id="sharedAssetVersionInput" class="assetHiddenInput" type="file" accept=".glb,model/gltf-binary"><div id="sharedAssetUploadProgress" class="assetProgress"><span></span></div></div>
      <div class="assetActionRow assetActionRowRight"><button id="sharedAssetDeleteButton" class="adminButton small danger assetDeleteButton" type="button" title="Delete" aria-label="Delete">🗑</button></div>
    </div>`;
    bindDetailActions(detail);
  }

  async function selectAsset(assetId, { emit = true } = {}) {
    const id = text(assetId);
    if (!id) { state.selectedAssetId = ""; state.selectedDetail = null; state.usages = []; renderCatalog(); renderDetail(); if (emit) emitUiState(); return; }
    const request = ++state.requestId;
    state.selectedAssetId = id;
    renderCatalog();
    const [detail, usages] = await Promise.all([api.get(id), api.listUsages(id)]);
    if (request !== state.requestId) return;
    state.selectedDetail = detail;
    state.usages = usages;
    renderDetail();
    if (emit) emitUiState();
  }

  async function refreshCatalog({ preserveSelection = true, forceDetail = false, localAsset = null } = {}) {
    const rows = await api.list({ includeArchived: false });
    state.catalog = rows;
    if (localAsset && localAsset.id) {
      const index = state.catalog.findIndex((item) => item.id === localAsset.id);
      if (index >= 0) state.catalog[index] = { ...state.catalog[index], ...localAsset };
    }
    renderCatalog();
    const wanted = preserveSelection ? state.selectedAssetId : "";
    if (wanted && (forceDetail || !state.selectedDetail || state.selectedDetail.asset.id !== wanted)) {
      if (state.catalog.some((item) => item.id === wanted)) await selectAsset(wanted, { emit: false });
      else await selectAsset("", { emit: false });
    } else if (wanted && !state.catalog.some((item) => item.id === wanted)) {
      await selectAsset("", { emit: false });
    }
  }

  async function loadVenues() {
    const rows = await loadVenueOptions();
    state.venues = (Array.isArray(rows) ? rows : []).map((row) => ({ id: row.id, name: row.name || row.slug || row.id, status: row.status || "active" }));
    return state.venues;
  }

  async function showCreateForm() {
    await loadVenues();
    const root = detailEl();
    if (!root) return;
    root.innerHTML = `<form id="sharedAssetCreateForm" class="assetCreatePanel"><div class="assetDetailHead"><div><h3>Add Asset</h3><p>Create one reusable Prop or Frame.</p></div></div><div class="assetCreateGrid"><label class="fieldLabel">Name<input id="newSharedAssetName" class="adminInput" maxlength="120" required placeholder="Wooden Bench"></label><div class="assetTwoCols"><label class="fieldLabel">Type<select id="newSharedAssetType" class="assetSelect"><option value="prop">PROP</option><option value="frame">FRAME</option></select></label><label class="fieldLabel">Category<input id="newSharedAssetCategory" class="adminInput" maxlength="80" placeholder="Furniture"></label></div><label class="fieldLabel">Scope<select id="newSharedAssetScope" class="assetSelect"><option value="platform">SHARED — all Galleries</option><option value="venue">GALLERY — one Gallery</option></select></label><label id="newSharedAssetVenueLabel" class="fieldLabel hidden">Gallery<select id="newSharedAssetVenue" class="assetSelect"><option value="">Choose Gallery…</option>${state.venues.filter((v) => v.status !== "archived").map((v) => `<option value="${escapeHtml(v.id)}">${escapeHtml(v.name)}</option>`).join("")}</select></label><label class="fieldLabel">Description<textarea id="newSharedAssetDescription" class="adminTextarea" maxlength="1000" placeholder="Internal catalog note (optional)"></textarea></label><label class="fieldLabel">Model GLB<input id="newSharedAssetModel" class="adminInput assetFileInput" type="file" accept=".glb,model/gltf-binary" required></label><div id="newSharedAssetProgress" class="assetProgress"><span></span></div><button class="adminButton primary" type="submit">ADD ASSET</button><button id="cancelSharedAssetCreate" class="adminButton" type="button">CANCEL</button></div></form>`;
    const scope = $("newSharedAssetScope");
    const venueLabel = $("newSharedAssetVenueLabel");
    scope.addEventListener("change", () => venueLabel.classList.toggle("hidden", scope.value !== "venue"));
    $("cancelSharedAssetCreate").addEventListener("click", () => renderDetail());
    $("sharedAssetCreateForm").addEventListener("submit", (event) => {
      event.preventDefault();
      void withBusy(async () => {
        const scopeType = scope.value;
        const scopeVenueId = scopeType === "venue" ? text($("newSharedAssetVenue").value) : null;
        if (scopeType === "venue" && !scopeVenueId) throw new Error("Choose the Gallery scope for this Asset.");
        const file = $("newSharedAssetModel").files && $("newSharedAssetModel").files[0];
        if (!file) throw new Error("Choose a GLB model for the Asset.");
        const type = $("newSharedAssetType").value;
        const progress = $("newSharedAssetProgress");
        const bar = progress && progress.querySelector("span");
        if (progress) progress.classList.add("active");
        if (bar) bar.style.width = "4%";
        const created = await api.addWithModel({
          name: text($("newSharedAssetName").value),
          assetType: type,
          category: text($("newSharedAssetCategory").value),
          scopeType,
          scopeVenueId,
          metadata: { description: text($("newSharedAssetDescription").value) },
          file,
          runtimeMetadata: getDefaultSharedAssetRuntimeMetadata(type),
          onProgress: ({ loaded, total }) => {
            if (!bar) return;
            const percent = total ? Math.max(4, Math.min(92, Math.round((loaded / total) * 92))) : 32;
            bar.style.width = `${percent}%`;
          }
        });
        if (bar) bar.style.width = "100%";
        state.selectedAssetId = created.asset.id;
        showToast("Asset added and ready to use.");
        await refreshCatalog({ preserveSelection: true, forceDetail: true });
        emitUiState();
      }).catch((error) => showToast(error.message || String(error)));
    });
  }

  $("refreshSharedAssetsButton").addEventListener("click", () => { void withBusy(() => refreshCatalog({ preserveSelection: true, forceDetail: true })).catch((error) => showToast(error.message || String(error))); });
  $("addSharedAssetButton").addEventListener("click", () => { void showCreateForm().catch((error) => showToast(error.message || String(error))); });
  $("sharedAssetSearch").addEventListener("input", (event) => { state.search = text(event.target.value); renderCatalog(); });
  $("sharedAssetCategory").addEventListener("change", (event) => { state.category = event.target.value || "all"; renderCatalog(); });
  $("sharedAssetFilterRow").querySelectorAll("[data-asset-filter]").forEach((button) => button.addEventListener("click", () => {
    state.filter = button.dataset.assetFilter || "all";
    $("sharedAssetFilterRow").querySelectorAll("[data-asset-filter]").forEach((node) => node.classList.toggle("active", node === button));
    renderCatalog(); emitUiState();
  }));

  return Object.freeze({
    stage: ADMIN_ASSET_WORKSPACE_STAGE,
    getState() { return { ...state, catalog: undefined, selectedDetail: undefined, usages: undefined, venues: undefined, placementDescriptor: state.placementDescriptor ? { ...state.placementDescriptor } : null, frameDragDescriptor: state.frameDragDescriptor ? { ...state.frameDragDescriptor } : null, frameBindingTarget: state.frameBindingTarget ? { ...state.frameBindingTarget } : null }; },
    async show({ hostSection = "exhibitions", returnSection = hostSection, selectedAssetId = null, filter = null } = {}) {
      state.visible = true;
      state.hostSection = hostSection === "galleries" ? "galleries" : "exhibitions";
      state.returnSection = returnSection === "galleries" ? "galleries" : "exhibitions";
      if (filter === "prop" || filter === "frame") state.filter = filter; else if (filter === "all") state.filter = "all";
      $("sharedAssetFilterRow").querySelectorAll("[data-asset-filter]").forEach((node) => node.classList.toggle("active", node.dataset.assetFilter === state.filter));
      catalogSection.classList.remove("hidden"); detailSection.classList.remove("hidden");
      renderHostNote();
      await Promise.all([loadVenues(), refreshCatalog({ preserveSelection: true })]);
      const wanted = text(selectedAssetId || state.selectedAssetId);
      if (wanted) await selectAsset(wanted, { emit: false }); else renderDetail();
      emitUiState();
      return true;
    },
    hide() { state.visible = false; state.placementDescriptor = null; state.frameDragDescriptor = null; state.frameBindingTarget = null; onCancelPropPlacement({ reason: "workspace-hidden" }); onCancelFrameDrag({ reason: "workspace-hidden" }); catalogSection.classList.add("hidden"); detailSection.classList.add("hidden"); return true; },
    async refresh() { return refreshCatalog({ preserveSelection: true, forceDetail: true }); },
    async select(assetId) { return selectAsset(assetId); },
    beginFrameBinding(target) {
      if (!target || !text(target.artworkId)) throw new Error("Frame binding requires a selected artwork.");
      state.frameBindingTarget = { ...target };
      state.filter = "frame";
      state.category = "all";
      $("sharedAssetFilterRow").querySelectorAll("[data-asset-filter]").forEach((node) => node.classList.toggle("active", node.dataset.assetFilter === "frame"));
      renderHostNote(); renderCatalog(); emitUiState();
      return true;
    },
    cancelFrameBinding() { state.frameBindingTarget = null; renderHostNote(); renderCatalog(); return true; },
    setFilter(filter) {
      const value = filter === "prop" || filter === "frame" ? filter : "all";
      state.filter = value;
      $("sharedAssetFilterRow").querySelectorAll("[data-asset-filter]").forEach((node) => node.classList.toggle("active", node.dataset.assetFilter === value));
      renderCatalog(); emitUiState();
    }
  });
}
