# Exhibition Platform

Current repository release: **C6C8C21 — Multi-Space Foundation**.

This repository contains the deployable Babylon.js 3D Exhibition Platform plus repository-local build and regression tooling. Database migration/deployment SQL is intentionally kept outside `REPO` in the documented release package.

## Product model

- **Venue / Gallery** is the reusable physical 3D environment.
- **Venue Version** is an immutable published version of that environment and its runtime manifest/assets.
- **Space** is the runtime representation of the resolved Venue Version passed into the Babylon scene.
- **Exhibition** is the content/publication layer shown inside a Venue.
- Multiple Exhibitions can belong to one Venue.
- A future cross-Venue transition is a Babylon Scene lifecycle boundary; same-Venue Exhibition switching retains the existing fast/resident path.

Specific gallery names are data. They are not platform/runtime branding.

## Main entries

- `index.html` — Public Viewer.
- `admin.html` — direct/fallback Admin Workspace.
- `src/Gallery_V0_11.js` — main Babylon.js runtime source.
- `src/Gallery_V0_11.min.js` — generated production runtime.
- `src/data/exhibition-api.js` — canonical Venue/Exhibition data adapter.
- `src/runtime/space-definition-resolver.js` — validates/resolves a canonical Venue Version manifest into the small Space contract consumed by the engine.
- `src/config/space-fixture.js` — local/login-disabled test fixture only; it is not the production Space source.
- `src/bootstrap/` — Viewer/Admin/editor/cache/transition bootstraps.
- `asset-cache-sw.js` — persistent asset cache / delivery layer.
- `src/workers/` + `src/vendor/gallery-avif-encoder.mjs` — artwork/media AVIF processing.
- `tools/` — repository build, verifier and consolidated regression suites.

## C6C8C21 canonical startup path

Production startup no longer imports a static building config. The canonical flow is:

```text
Exhibition
  -> Venue
  -> Venue Version
  -> Venue Manifest / Venue Assets
  -> Space Definition
  -> Gallery_V0_11 createScene()
```

The engine receives `runtimeOptions.spaceDefinition`; it does not need to know Supabase table names or fixed production GLB URLs.

The active canonical database model is:

```text
venues
  -> venue_versions
     -> venue_assets

exhibitions
  -> exhibition_states
  -> exhibition_cards
```

The C6C8C20 `gallery_exhibitions` / `gallery_state` model is no longer a normal runtime dependency in this repository. Those production tables are deliberately retained only as C21 rollback evidence until later Multi-Space closure.

## Venue manifest / Space contract

C6C8C21 uses the neutral manifest identifier:

`exhibition-platform-venue-manifest.v1`

The current required building roles are exactly:

- `floor`
- `walls`
- `ceiling`
- `props`

The manifest also requires Y-up, meter units and a safe visitor spawn point. Bucket/path metadata is canonical; delivery URLs are resolved outside the engine.

The resolver can recognize the historical `berryboy-venue-manifest.v1` identifier only when an explicit legacy-compatibility option is requested. New active Venue data must use the neutral schema.

## Runtime behavior retained

C6C8C21 is a foundation/cutover stage, not a rendering rewrite. It retains the accepted behavior from C6C8C20, including:

- same-runtime Public/Admin transitions,
- persistent draft preview,
- same-Space Exhibition residency/delta switching,
- hard Space/Preview readiness,
- bounded background Full texture/model hydration,
- persistent asset caching/egress guards,
- frame runtime,
- collision/lighting behavior,
- mobile UI regressions,
- C6C8C20 Current-Zone Model Fast Lane.

## Backend dependency

The application currently uses **Supabase** for Auth, Postgres/RLS/RPC data access and Storage. C6C8C21 does not migrate the project to Cloudflare.

Release SQL, migrations, prechecks/postchecks, rollback synchronizer and operator queries are not repository runtime files. In the release package they live under:

`OUTSIDE_REPO/SQL/`

## Compatibility identifiers

Some old internal/debug aliases, localStorage keys, CSS/DOM identifiers and historical physical Storage names still contain `Berryboy`. They are retained only where changing them would risk breaking accepted browser state, diagnostics or the existing physical asset location. They are **not** the current platform identity and must not be used for new technical contracts.

Primary new globals/contracts use neutral `ExhibitionPlatform...` naming. Compatibility aliases may remain until a dedicated low-risk retirement stage.

## Validation

Run from the repository root:

```bash
npm run check
```

This performs:

- production build,
- syntax checks,
- repository verifier,
- core runtime regressions,
- media regressions,
- platform regressions including the C6C8C21 canonical Multi-Space contract,
- performance regressions,
- workspace regressions.

SQL package validation is intentionally separate and is run from the release-package root with:

```bash
node OUTSIDE_REPO/TOOLS/verify-sql-package.mjs
```

## Documentation

`README.md` describes the current application architecture/capabilities. It is not the changelog. Release status, database procedure, QA evidence and continuation state live under `OUTSIDE_REPO/`.
