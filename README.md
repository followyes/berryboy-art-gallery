# Berryboy Art Gallery V0.11 — Stage 12C62S6D

Supabase Static Models Root.

Zmiana względem C62S6C:
- modele startowe nie jadą już z GitHub raw,
- Floor / Wall / Props / Ceiling są ładowane jako GLB z publicznego bucketu Supabase,
- wspólny root modeli:
  `https://bazbszvhoxmuekxahokc.supabase.co/storage/v1/object/public/berryboy-art-gallery-assets/Models/`
- pliki oczekiwane w buckecie:
  - `Models/Floor_segment.glb`
  - `Models/Wall_segments.glb`
  - `Models/Props.glb`
  - `Models/Ceiling.glb`

Bez zmian w logice Local Lights, retry loadera, mobile startup, popupów i Storage delete.
