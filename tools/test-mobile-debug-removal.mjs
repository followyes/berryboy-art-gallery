import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "src", "Gallery_V0_11.js"), "utf8");
const production = fs.readFileSync(path.join(root, "src", "Gallery_V0_11.min.js"), "utf8");
const viewer = fs.readFileSync(path.join(root, "src", "bootstrap", "gallery-viewer-bootstrap.js"), "utf8");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

function expect(label, condition) {
  if (!condition) throw new Error(`V14.4.7.8 mobile debug removal invariant failed: ${label}`);
  console.log(`✓ ${label}`);
}

expect("release identity", pkg.version === "0.14.4-v14-4-7-8-mobile-debug-ui-removal" && pkg.description.includes("V14.4.7.8 Mobile Survival Debug UI Removal"));
for (const token of [
  "berryboyMobileSurvivalDebugButton",
  "berryboyMobileSurvivalDebugBackdrop",
  "ensureGalleryMobileSurvivalDebugUi",
  "openGalleryMobileSurvivalDebugPanel",
  "closeGalleryMobileSurvivalDebugPanel",
  "renderGalleryMobileSurvivalDebugPanel",
  "formatGalleryMobileSurvivalSnapshot",
  "persistGalleryMobileSurvivalSnapshot",
  "readPreviousGalleryMobileSurvivalSnapshot",
  "stopGalleryMovementForSurvivalDebug",
  "BerryboyMobileSurvival",
  "gallery-mobile-survival-snapshot.v1",
  "berryboy_mobile_survival_last_snapshot_v1"
]) {
  expect(`source omits ${token}`, !source.includes(token));
  expect(`production omits ${token}`, !production.includes(token));
}
expect("mobile DBG label removed", !source.includes('button.textContent = "DBG"') && !production.includes('button.textContent = "DBG"'));
expect("survival panel hooks removed from MobileQuality global", !source.includes("getSurvivalSnapshot:") && !source.includes("openSurvivalPanel:"));
expect("core artwork residency remains", source.includes('schema: "gallery-artwork-residency.v3"') && source.includes("function enforceGalleryArtworkResidencyBudget") && source.includes("function getGalleryArtworkFullResidencyBudget"));
expect("adaptive mobile quality remains", source.includes('registerGalleryBeforeRenderObserver("adaptiveMobileQuality", updateGalleryAdaptiveMobileQuality)'));
expect("manual non-visual Mobile Quality Inspector API remains", source.includes("globalThis.BerryboyMobileQualityInspector") && source.includes("setGalleryMobileQualityInspectorVisible"));
expect("viewer forces fresh V14.4.7.8 engine cache key", viewer.includes('v14_4_7_8_mobile_debug_ui_removal_20260918'));

console.log("V14.4.7.8 Mobile Survival Debug UI Removal regression passed.");
