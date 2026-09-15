import fs from "node:fs";
import assert from "node:assert/strict";

const sql = fs.readFileSync(new URL("../../../OUTSIDE_REPO/SQL/ALL_IN_ONE.sql", import.meta.url), "utf8");
const api = fs.readFileSync(new URL("../src/data/exhibition-api.js", import.meta.url), "utf8");
const workspace = fs.readFileSync(new URL("../src/bootstrap/admin-workspace-bootstrap.js", import.meta.url), "utf8");

const lastSaveStart = sql.lastIndexOf("create or replace function public.save_exhibition_runtime_state(");
const lastSaveEnd = sql.indexOf("\n$$;", lastSaveStart);
const lastSave = sql.slice(lastSaveStart, lastSaveEnd + 4);
const lastPublishStart = sql.lastIndexOf("create or replace function public.admin_publish_exhibition_bundle(");
const lastPublishEnd = sql.indexOf("create or replace function public.admin_set_exhibition_runtime_visibility", lastPublishStart);
const lastPublish = sql.slice(lastPublishStart, lastPublishEnd);

assert.ok(lastSave.includes("Save is Draft-only"), "V14.2.6 Save contract marker missing");
assert.ok(!lastSave.includes("publish_exhibition_state("), "Runtime Save must not auto-publish state");
assert.ok(lastSave.includes("saved_es.published_revision"), "Runtime Save should report existing Published revision without changing it");
assert.ok(lastSave.includes(",false;"), "Runtime Save compatibility published flag must be false");

assert.ok(lastPublish.includes("state_changed"), "Bundle Publish must calculate state delta");
assert.ok(lastPublish.includes("card_changed"), "Bundle Publish must calculate card delta");
assert.ok(lastPublish.includes("status_changed"), "Bundle Publish must calculate visibility delta");
assert.ok(lastPublish.includes("if state_changed then"), "State history must only rotate when state changed");
assert.ok(lastPublish.includes("if card_changed then"), "Card history must only rotate when card changed");
assert.ok(lastPublish.includes("'changed',changed"), "Publish must return truthful changed flag");
assert.ok(lastPublish.includes("stateChanged',state_changed"), "Publish must report stateChanged");
assert.ok(lastPublish.includes("cardChanged',card_changed"), "Publish must report cardChanged");

assert.ok(api.includes('admin_publish_exhibition_bundle'), "Canonical adapter must keep atomic bundle Publish RPC");
assert.ok(workspace.includes("PUBLISHED / UNPUBLISHED CHANGES"), "Admin must expose truthful unpublished-change state");
assert.ok(workspace.includes("PUBLISHED / UP TO DATE"), "Admin must expose up-to-date Published state");
assert.ok(workspace.includes("PUBLISH CHANGES"), "Admin must distinguish publishing saved Draft changes");
assert.ok(workspace.includes('detail.reason === "save-finished"'), "Admin must refresh publication truth after Draft save");

console.log("V14.2.6 canonical Draft/Publish model tests: PASS");
