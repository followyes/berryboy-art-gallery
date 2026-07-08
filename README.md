# Berryboy Art Gallery — Stage 12C62S6C

Full project package.

Stage 12C62S6C — Ceiling + Props GLB Loader Path Fix.

## Base

Base: Stage 12C62S6B — Model3D Storage Delete / Reference Safe Cleanup.

## Fix

- Startup loader now uses `Ceiling.glb` instead of `Ceiling.gltf`.
- Startup loader now uses `Props.glb` instead of `Props.gltf`.
- URLs stay on `raw.githubusercontent.com`, not `github.com/.../blob/...`.
- `Wall_segments.gltf` and `Floor_segments.gltf` are unchanged.
- Retry / timeout / mobile startup order are unchanged.
- Local Lights, target assignment, UI theme and Model3D Storage delete are unchanged.

## Login split

- `src/Gallery_V0_11.js` — production, login enabled.
- `src/Gallery_V0_10.js` — production mirror, login enabled.
- `Gallery_V0_11_STAGE12C62S6C_CEILING_PROPS_GLB_LOADER_PATH_FIX_LOGIN_DISABLED.txt` — test TXT, login disabled.

## Debug

- `BerryboyArtGalleryLoading.getDebug()`
- `BerryboyArtGalleryLoading.getRetryConfig()`
- `BerryboyArtGalleryMobile.getDebug()`
- `GalleryApp.getModel3dSlotDebug()`
