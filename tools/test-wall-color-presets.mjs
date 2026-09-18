import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createWallColorPresetApi } from '../src/data/wall-color-preset-api.js';

const root = new URL('../', import.meta.url);
const pkg = JSON.parse(fs.readFileSync(new URL('package.json', root), 'utf8'));
const source = fs.readFileSync(new URL('../src/Gallery_V0_11.js', import.meta.url), 'utf8');
const admin = fs.readFileSync(new URL('../src/bootstrap/admin-workspace-bootstrap.js', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../../../OUTSIDE_REPO/SQL/V14_4_7_WALL_COLOR_PRESETS.sql', import.meta.url), 'utf8');
const allInOne = fs.readFileSync(new URL('../../../OUTSIDE_REPO/SQL/ALL_IN_ONE.sql', import.meta.url), 'utf8');
const postcheck = fs.readFileSync(new URL('../../../OUTSIDE_REPO/SQL/V14_4_7_PRODUCTION_POSTCHECK.sql', import.meta.url), 'utf8');

assert.equal(pkg.version, '0.14.4-v14-4-7-3-modular-frame-3-axis');
assert.ok(pkg.description.includes('V14.4.7.3 Modular Frame 3-Axis Layout Hotfix'));

for (const fragment of [
  'create table public.wall_color_presets',
  "tint_hex ~ '^#[0-9A-F]{6}$'",
  'create function public.cms_can_manage_wall_color_presets',
  'create function public.admin_list_wall_color_presets()',
  'create function public.admin_create_wall_color_preset(p_tint_hex text)',
  'create function public.admin_delete_wall_color_preset(p_preset_id uuid)',
  'delete from public.wall_color_presets where id=rec.id',
  "grant execute on function public.admin_list_wall_color_presets() to authenticated"
]) assert.ok(migration.includes(fragment), `missing migration contract: ${fragment}`);
assert.ok(!migration.toLowerCase().includes('delete from storage.objects'));
assert.ok(!migration.includes('preset_id') || migration.includes('p_preset_id')); // no Exhibition preset reference
assert.ok(allInOne.includes('V14.4.7 Wall Color Presets'));
assert.ok(postcheck.includes('set transaction read only'));
assert.ok(postcheck.includes('rollback;'));
assert.ok(postcheck.includes("'exhibitionPresetForeignKeys'"));

assert.ok(source.includes('V14.4.7 — Wall Color Presets'));
assert.ok(source.includes('wallColorPresetAddButton.textContent = "+"'));
assert.ok(source.includes('saveCurrentWallColorPreset'));
assert.ok(source.includes('removeWallColorPreset'));
assert.ok(source.includes('setWallColorPresetApi'));
assert.ok(source.includes('setSelectedWallTintHex(preset.tintHex)'));
assert.ok(source.includes('Click a wall segment to apply it.'));
assert.ok(source.includes('tintHex: getWallTintHexForMesh(wallMesh)'));
assert.ok(!source.includes('wallColorPresetId'));
assert.ok(!source.includes('wall_color_preset_id'));
assert.ok(admin.includes('createWallColorPresetApi'));
assert.ok(admin.includes('window.ExhibitionPlatformWallColorPresetApi = wallColorPresetApi'));
assert.ok(admin.includes('wallColorPresetApi }'));
assert.ok(admin.includes('setWallColorPresetApi(wallColorPresetApi)'));

const calls = [];
const fakeSupabase = {
  async rpc(name, args) {
    calls.push([name, args]);
    if (name === 'admin_list_wall_color_presets') return { data: [{ id: '11111111-1111-4111-8111-111111111111', tint_hex: '#A47C58', display_order: 10, created_at: '2026-09-18T08:00:00Z' }], error: null };
    if (name === 'admin_create_wall_color_preset') return { data: { id: '22222222-2222-4222-8222-222222222222', tint_hex: '#00AAFF', display_order: 20, created_at: '2026-09-18T08:01:00Z' }, error: null };
    if (name === 'admin_delete_wall_color_preset') return { data: { deleted: true, presetId: args.p_preset_id, tintHex: '#00AAFF' }, error: null };
    throw new Error(`unexpected RPC ${name}`);
  }
};
const api = createWallColorPresetApi({ supabase: fakeSupabase });
const listed = await api.list();
assert.equal(listed.length, 1);
assert.equal(listed[0].tintHex, '#A47C58');
const created = await api.create('00aaff');
assert.equal(created.tintHex, '#00AAFF');
const removed = await api.remove(created.id);
assert.equal(removed.deleted, true);
assert.deepEqual(calls.map(([name]) => name), [
  'admin_list_wall_color_presets',
  'admin_create_wall_color_preset',
  'admin_delete_wall_color_preset'
]);
assert.equal(calls[1][1].p_tint_hex, '#00AAFF');

console.log('V14.4.7 Wall Color Presets regression passed.');
