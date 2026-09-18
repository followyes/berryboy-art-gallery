import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const viewer = fs.readFileSync(path.join(root, "src", "bootstrap", "gallery-viewer-bootstrap.js"), "utf8");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");

function expect(label, condition) {
  if (!condition) throw new Error(`V14.4.4.2 mobile carousel regression failed: ${label}`);
  console.log(`✓ ${label}`);
}

const mobileStart = viewer.indexOf("@media(max-width:700px){");
const compactStart = viewer.indexOf("@media(max-width:700px) and (max-height:560px){");
expect("mobile breakpoint exists", mobileStart >= 0 && compactStart > mobileStart);
const mobileCss = viewer.slice(mobileStart, compactStart);
const compactCss = viewer.slice(compactStart, viewer.indexOf("`;", compactStart));

expect("mobile landing is bound to the dynamic viewport", mobileCss.includes("height:100dvh") && mobileCss.includes("min-height:100svh"));
expect("mobile card width leaves deterministic safe gutters", mobileCss.includes("--c26-mobile-card-width:min(calc(100vw - 32px),360px)") && mobileCss.includes("--c26-mobile-edge:max(16px,calc((100vw - var(--c26-mobile-card-width))/2))"));
expect("mobile track starts from exact edge padding instead of desktop centering", mobileCss.includes("#c26HomepageExhibitionTrack{height:100%;min-height:0;justify-content:flex-start") && mobileCss.includes("padding:2px var(--c26-mobile-edge) 8px"));
expect("mobile card consumes available carousel height instead of forcing vh minimum", mobileCss.includes("min-height:0;height:min(100%,480px);max-height:480px") && !mobileCss.includes("min-height:min(58vh,480px)"));
expect("touch snap remains strict per card", mobileCss.includes("scroll-snap-stop:always"));
expect("short mobile viewports get a compact layout", compactCss.includes("max-height:560px") && compactCss.includes("#c25HomepageExhibitionHeader p{display:none}"));
expect("desktop carousel contract is retained", viewer.includes("#c26HomepageExhibitionTrack{display:flex;align-items:stretch;justify-content:center") && viewer.includes(".c26CarouselNav{width:44px;height:44px"));
expect("viewer bootstrap cache key remains advanced through V14.4.7", index.includes("gallery-viewer-bootstrap.js?v=v14_4_7_8_mobile_debug_ui_removal"));

console.log("V14.4.4.2 Mobile Home Carousel responsive regression passed.");
