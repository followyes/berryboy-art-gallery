import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const source = fs.readFileSync(new URL('src/Gallery_V0_11.js', root), 'utf8');
const admin = fs.readFileSync(new URL('src/bootstrap/admin-workspace-bootstrap.js', root), 'utf8');
const adminHtml = fs.readFileSync(new URL('admin.html', root), 'utf8');
const viewerBootstrap = fs.readFileSync(new URL('src/bootstrap/gallery-viewer-bootstrap.js', root), 'utf8');
const api = fs.readFileSync(new URL('src/data/gallery-management-api.js', root), 'utf8');
const testBootstrap = fs.readFileSync(new URL('src/bootstrap/gallery-test-bootstrap.js', root), 'utf8');
const testHtml = fs.readFileSync(new URL('gallery-test.html', root), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('package.json', root), 'utf8'));

function expect(label, ok) {
  if (!ok) throw new Error(`Gallery Management invariant failed: ${label}`);
  console.log(`✓ ${label}`);
}

function extractFunction(text, name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  let start = -1;
  for (const marker of markers) {
    start = text.indexOf(marker);
    if (start >= 0) break;
  }
  if (start < 0) throw new Error(`Missing function ${name}`);
  const brace = text.indexOf('{', start);
  let depth = 0;
  let state = 'code';
  let quote = '';
  for (let i = brace; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1] || '';
    if (state === 'code') {
      if (ch === '"' || ch === "'" || ch === '`') { state = 'string'; quote = ch; }
      else if (ch === '/' && next === '/') { state = 'line'; i++; }
      else if (ch === '/' && next === '*') { state = 'block'; i++; }
      else if (ch === '{') depth++;
      else if (ch === '}' && --depth === 0) return text.slice(start, i + 1);
    } else if (state === 'string') {
      if (ch === '\\') i++;
      else if (ch === quote) state = 'code';
    } else if (state === 'line' && ch === '\n') state = 'code';
    else if (state === 'block' && ch === '*' && next === '/') { state = 'code'; i++; }
  }
  throw new Error(`Unterminated function ${name}`);
}

const catalogRenderer = extractFunction(admin, 'renderGalleryCatalog');
const entryReader = extractFunction(admin, 'readRequiredFiniteGalleryNumber');
const mutationWrapper = extractFunction(admin, 'withGalleryMutation');
const detailRenderer = extractFunction(admin, 'renderGalleryDetail');
const startPositionHandler = extractFunction(admin, 'handleTestGallery');

expect('current V14.4.2 package preserves V14.2.5 safe deletion', pkg.version.includes('v14-4-7-wall-color-presets'));
expect('Core Admin release identity remains V14.1.10 while V14.3.7.1 corrective stage is explicit', admin.includes('const STAGE = "V14.1.10.1"') && admin.includes('ADMIN_PRODUCT_MODEL_STAGE = "V14.3.7"') && admin.includes('ADMIN_PRODUCT_CORRECTION_STAGE = "V14.3.7.1"'));
expect('Gallery data adapter uses canonical Venue RPCs', api.includes('admin_create_gallery_with_initial_draft') && api.includes('admin_begin_venue_draft') && api.includes('admin_set_venue_asset_slot'));
expect('V14.3.6 Gallery publication visibility adapter is present', api.includes('GALLERY_PUBLICATION_VISIBILITY_STAGE = "V14.3.6"') && api.includes('admin_set_venue_publication') && api.includes('async setPublication(venueId, published)'));
expect('V14.3.7.1 normal Gallery UI exposes one Save plus visibility, without technical Publish ceremony', detailRenderer.includes('editing ? "EDITING" : "EDIT"') && detailRenderer.includes('SAVE CHANGES') && detailRenderer.includes('PUBLISHED: ON') && detailRenderer.includes('SET START POSITION') && detailRenderer.includes('ADJUST') && !detailRenderer.includes('PUBLISH CHANGES') && !detailRenderer.includes('PUBLISH GALLERY') && !detailRenderer.includes('CREATE NEXT VERSION') && !detailRenderer.includes('EDIT DRAFT') && !detailRenderer.includes('DISCARD DRAFT') && !detailRenderer.includes('VALIDATE DRAFT') && !detailRenderer.includes('PUBLISH VERSION') && !detailRenderer.includes('ROLLBACK') && !detailRenderer.includes('Version history'));
expect('V14.3.7 hidden Draft opens through Edit without exposing Draft terminology', admin.includes('handleBeginGalleryDraft') && admin.includes('Gallery editing opened.') && detailRenderer.includes('const editing = canManage && !!draft') && detailRenderer.includes('Unpublished Gallery changes are being edited.'));
expect('V14.3.7 automatic model validation remains on Upload/Replace while manual validation ceremony is hidden', admin.includes('validateGalleryModelFile(file') && admin.includes('galleryManagement.uploadAssetSlot') && !detailRenderer.includes('validateGalleryButton') && !detailRenderer.includes('renderGalleryValidation('));
expect('V14.3.7.1 start position captures the mounted authoring camera and stages numeric adjustment for the main Save', detailRenderer.includes('SET START POSITION') && detailRenderer.includes('galleryEntryAdjustPanel') && detailRenderer.includes('class="hidden"') && !detailRenderer.includes('SAVE ADJUSTMENT') && admin.includes('GalleryApp.getCameraPose') && admin.includes('activeRuntime.context !== "gallery-authoring"') && !admin.includes('new URL("./gallery-test.html"'));
expect('V14.3.7.1 numeric Entry Point fields are hidden by shared Gallery CSS until ADJUST is used', admin.includes('#galleryEntryAdjustPanel.hidden{display:none!important}') && detailRenderer.includes('id="galleryEntryAdjustPanel" class="hidden"') && detailRenderer.includes('id="adjustGalleryEntryButton"') && detailRenderer.includes('aria-expanded="false"'));
expect('SET START POSITION stages camera values without expanding the ADJUST panel', startPositionHandler.includes('GalleryApp.getCameraPose') && startPositionHandler.includes('syncGalleryEntryDirty()') && !startPositionHandler.includes('galleryEntryAdjustPanel') && !startPositionHandler.includes('aria-expanded'));
expect('Exhibition publication actions align to the right in standalone and inline Admin shells', adminHtml.includes('.publicationActions { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:7px; }') && viewerBootstrap.includes('#inlineAdminWorkspace .publicationActions { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:7px; }'));
expect('Gallery Visibility and Actions rows alone use the right-aligned action modifier', detailRenderer.includes('<h3>Visibility</h3><div class="galleryActions galleryActionsRight">') && detailRenderer.includes('<h3>Actions</h3><div class="galleryActions galleryActionsRight">') && detailRenderer.includes('<h3>Start position</h3>\n        <div class="galleryActions">') && detailRenderer.includes('<form id="galleryDetailsForm" class="gallerySubsection">') && admin.includes('.galleryActionsRight{justify-content:flex-end}'));
expect('Gallery destructive action is rendered exactly once', (detailRenderer.match(/id="deleteGalleryButton"/g) || []).length === 1);
expect('V14.3.7 normal Gallery UI hides version numbers and technical history', !detailRenderer.includes('version_number') && !detailRenderer.includes('renderGalleryHistory(') && !catalogRenderer.includes('version_number'));
expect('V14.3.7 normal Exhibition UI uses one Published toggle and no Unpublish button', adminHtml.includes('toggleExhibitionPublishedButton') && adminHtml.includes('PUBLISHED: OFF') && !adminHtml.includes('unpublishExhibitionButton') && admin.includes('handleToggleExhibitionPublished'));
expect('V14.3.7 destructive Gallery/Exhibition controls use accessible trash icon actions', detailRenderer.includes('aria-label="Delete"') && detailRenderer.includes('title="Delete Gallery"') && adminHtml.includes('aria-label="Delete"') && adminHtml.includes('title="Delete Exhibition"'));
expect('Gallery OFF remains authorable when a current Published snapshot exists', admin.includes('venue.status !== "archived"') && admin.includes('Published OFF') && !admin.includes('Turn Gallery Published ON before creating an Exhibition in it.'));
expect('new asset paths are stable UUID owner paths, not Gallery names', api.includes('venues/${venue}/versions/${version}/assets/${normalizedRole}/') && !api.includes('venue.slug'));
expect('the controlled Gallery role contract remains exposed for C23', api.includes('["floor", "walls", "ceiling", "props"]'));
expect('replace uses immutable upload object before binding', api.includes('upsert: false') && api.includes('cleanupCandidates'));
expect('Admin imports the controlled role binding it executes', /import\s*\{[^}]*\bCONTROLLED_GALLERY_ASSET_ROLES\b[^}]*\}\s*from\s*["']\.\.\/data\/gallery-management-api\.js/.test(admin));
expect('Admin has Exhibition and Gallery section switch', admin.includes('EXHIBITIONS') && admin.includes('GALLERIES') && admin.includes('galleryManagementSection'));
expect('Admin renders the four controlled asset slots from the imported role contract', admin.includes('CONTROLLED_GALLERY_ASSET_ROLES.forEach((role) =>') && admin.includes('renderGalleryAssetSlots(detail, working, assets'));
expect('raw Manifest JSON editor is not present in normal Gallery UI', !admin.includes('galleryManifestTextarea') && !admin.includes('SAVE RAW MANIFEST'));
expect('Gallery names are rendered as text rather than interpolated HTML', !catalogRenderer.includes('row.innerHTML') && catalogRenderer.includes('title.textContent'));
expect('Entry Point numeric adjustment rejects blank/non-finite values', entryReader.includes('String(input.value).trim()') && entryReader.includes('if (!raw)') && entryReader.includes('Number.isFinite(value)'));
expect('Entry Point adjustment participates in dirty-state/unload protection', admin.includes('let galleryEntryDirty = false;') && admin.includes('syncGalleryEntryDirty();') && admin.includes('galleryMetadataDirty || galleryEntryDirty'));
expect('Gallery mutations use a shared in-flight lock', mutationWrapper.includes('galleryMutationInFlight') && mutationWrapper.includes('setGalleryMutationBusy(true)') && mutationWrapper.includes('setGalleryMutationBusy(false)'));
expect('Gallery URL state is cleared when returning to Exhibitions', admin.includes('url.searchParams.delete("section")') && admin.includes('url.searchParams.delete("gallery")') && admin.includes('clearGalleryUrl();'));
expect('Gallery render has a visible failure boundary', detailRenderer.includes('renderGalleryDetailError(body, error)'));
expect('Published/no-edit Gallery fields are read-only until Edit opens the hidden Draft', detailRenderer.includes('const metadataEditable = editing') && detailRenderer.includes('const entryEditable = editing'));
expect('Legacy Gallery Preview remains isolated for recovery but normal Admin no longer navigates to it', testHtml.includes('data-gallery-test="true"') && testHtml.includes('Gallery preview') && testHtml.includes('SET START POSITION') && !admin.includes('new URL("./gallery-test.html"'));
expect('Gallery Preview resolves exact Gallery Version internally only', testBootstrap.includes('galleryManagement.resolveTest') && !testBootstrap.includes('resolve_published_exhibition') && !testBootstrap.includes('admin_get_exhibition') && !testBootstrap.includes('exhibition_states'));
expect('Gallery Preview uses a local read-only Exhibition adapter', testBootstrap.includes('Gallery Preview is read-only') && testBootstrap.includes('loadState()'));
expect('Gallery Preview keeps shared Scene runtime host technical context', testBootstrap.includes('createSceneLoadingRuntimeHost') && testBootstrap.includes('loadingContext: "test-gallery"') && !testBootstrap.includes('waitForInteractionReady') && !testBootstrap.includes('engine.runRenderLoop'));
expect('Engine CRUD remains outside GalleryApp while camera bridge exists', source.includes('getCameraPose: function ()') && !source.includes('admin_create_gallery_with_initial_draft'));

console.log('V14.3.7.1 corrective Gallery product workflow invariants passed.');
