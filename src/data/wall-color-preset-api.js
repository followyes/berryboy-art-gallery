/*
  Exhibition Platform — V14.4.7 Wall Color Presets
  Global Admin convenience library. Presets never become Exhibition state authority:
  applying a preset only selects/copies its canonical #RRGGBB value into Wall Tint.
*/

function text(value) { return String(value == null ? "" : value).trim(); }
function canonicalHex(value) {
  let next = text(value).toUpperCase();
  if (next && !next.startsWith("#")) next = `#${next}`;
  return /^#[0-9A-F]{6}$/.test(next) ? next : "";
}
function rows(response) {
  if (response && response.error) throw response.error;
  if (!response || response.data == null) return [];
  return Array.isArray(response.data) ? response.data : [response.data];
}
function one(response) { return rows(response)[0] || null; }
function normalize(row) {
  if (!row || !row.id) return null;
  const tintHex = canonicalHex(row.tint_hex || row.tintHex);
  if (!tintHex) return null;
  return Object.freeze({
    id: text(row.id),
    tintHex,
    displayOrder: Number(row.display_order != null ? row.display_order : row.displayOrder) || 0,
    createdAt: row.created_at || row.createdAt || null,
    createdBy: row.created_by || row.createdBy || null
  });
}

export function createWallColorPresetApi({ supabase } = {}) {
  if (!supabase || typeof supabase.rpc !== "function") throw new Error("Wall Color Preset API requires Supabase.");
  return Object.freeze({
    async list() {
      return rows(await supabase.rpc("admin_list_wall_color_presets")).map(normalize).filter(Boolean);
    },
    async create(tintHex) {
      const canonical = canonicalHex(tintHex);
      if (!canonical) throw new Error("Wall color preset must use #RRGGBB.");
      return normalize(one(await supabase.rpc("admin_create_wall_color_preset", { p_tint_hex: canonical })));
    },
    async remove(presetId) {
      const id = text(presetId);
      if (!id) throw new Error("Wall color preset id is required.");
      return one(await supabase.rpc("admin_delete_wall_color_preset", { p_preset_id: id }));
    }
  });
}
