import fs from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);
const pkg = JSON.parse(fs.readFileSync(new URL('package.json', root), 'utf8'));
const adminHtml = fs.readFileSync(new URL('admin.html', root), 'utf8');
const viewer = fs.readFileSync(new URL('src/bootstrap/gallery-viewer-bootstrap.js', root), 'utf8');
const admin = fs.readFileSync(new URL('src/bootstrap/admin-workspace-bootstrap.js', root), 'utf8');
const exhibitionApi = fs.readFileSync(new URL('src/data/exhibition-api.js', root), 'utf8');
const galleryApi = fs.readFileSync(new URL('src/data/gallery-management-api.js', root), 'utf8');
const sql = fs.readFileSync(new URL('../../../OUTSIDE_REPO/SQL/V14_2_5_CONTENT_LIFECYCLE_SAFE_DELETION.sql', import.meta.url), 'utf8');

assert.equal(pkg.version, '0.14.2-v14-2-6-canonical-draft-publish-model');
assert.ok(adminHtml.includes('id="deleteExhibitionButton"'));
assert.ok(viewer.includes('id="deleteExhibitionButton"'));
assert.ok(admin.includes('handleDeleteExhibition') && admin.includes('deletePermanent(deleting.id)'));
assert.ok(exhibitionApi.includes('admin_prepare_exhibition_delete') && exhibitionApi.includes('admin_delete_exhibition') && exhibitionApi.includes('admin_cancel_exhibition_delete'));
assert.ok(galleryApi.includes('admin_prepare_venue_delete') && galleryApi.includes('admin_delete_venue') && galleryApi.includes('admin_cancel_venue_delete'));
assert.ok(galleryApi.includes('deleteAssetSlot') && !galleryApi.includes('clearOptionalAssetSlot'));
assert.ok(admin.includes('DELETE GALLERY') && !admin.includes('id="archiveGalleryButton"') && !admin.includes('id="restoreGalleryButton"'));
assert.ok(admin.includes('deleteAssetSlot(draft.id, role)') && admin.includes('The Draft will not be publishable until this required model is uploaded again.'));
assert.ok(sql.includes('deletion_pending_at') && sql.includes('admin_prepare_exhibition_delete') && sql.includes('admin_delete_exhibition'));
assert.ok(sql.includes('admin_prepare_venue_delete') && sql.includes('admin_delete_venue'));
assert.ok(sql.includes("role_name not in ('floor','walls','ceiling','props')"));
assert.ok(sql.includes("Shared Asset(s) still belong to this Gallery") && sql.includes('Exhibition reference(s) still use this Gallery'));
assert.ok(sql.includes('storageObjectCount') && sql.includes("storage.objects"));
console.log('V14.2.5 safe deletion regression passed.');
