# Berryboy Art Gallery — Stage 12C62S6B

Full project package.

Stage 12C62S6B — Model3D Storage Delete / Reference Safe Cleanup.

## Base

Base: Stage 12C62S6A — Startup Order Rebuild / Storage First / Models / Final Lights / Popup Last.

## Fix

- `Delete Selected` for sculpture/model slots now checks `modelPath` before deleting the slot.
- If no other slot uses the same `modelPath`, the GLB file is removed from Supabase Storage.
- If another slot still uses the same GLB, only the slot is deleted and the file is kept.
- `REMOVE MODEL` uses the same reference-safe Storage cleanup.
- If Storage deletion fails, the slot/model is kept to avoid orphaned GLB files.

## Login split

- `src/Gallery_V0_11.js` — production, login enabled.
- `src/Gallery_V0_10.js` — production mirror, login enabled.
- `Gallery_V0_11_STAGE12C62S6B_MODEL3D_STORAGE_DELETE_REFERENCE_SAFE_LOGIN_DISABLED.txt` — test TXT, login disabled.

## Debug

- `BerryboyArtGalleryLoading.getDebug()`
- `BerryboyArtGalleryLoading.getRetryConfig()`
- `BerryboyArtGalleryMobile.getDebug()`
- `GalleryApp.getModel3dSlotDebug()`
