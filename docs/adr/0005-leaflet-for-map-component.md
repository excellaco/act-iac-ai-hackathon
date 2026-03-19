# ADR-0005: Leaflet (`react-leaflet`) for Map Component

**Status:** Accepted
**Date:** 2026-03-18
**Deciders:** Parcela Hackathon Team (decision reached in design sync, March 18, 2026; documented in issue #95)

---

## Context

Epics E5 (Search & Map UI) and E6 (Score Panel UI) require an interactive choropleth map with two modes:

1. **National/state heat map (E5-3):** US map rendered behind the search bar with state-level RIS shading; not interactive at this stage.
2. **County zoom (E6-1):** After a jurisdiction is selected, the map zooms to the county with district-level choropleth shading.
3. **Zoom-out (E5-5):** Control to return from county view to the national/state map.
4. **Color legend (E5-4):** Always-visible legend showing the RIS scale (0–100) with low/medium/high labels.

The map component also needs to support a second color palette for delta/comparison views (E7 — Comparison View, E8 — What-If Simulation), where shading indicates change rather than absolute score.

The team evaluated three candidate libraries before starting implementation of E5-3 and E6-1.

---

## Decision

We will use **Leaflet** via `react-leaflet` for all map rendering in Parcela.

**Color palettes:**
- **Primary:** BuPu (blue-purple), 5 stops — for absolute RIS score shading on all jurisdiction views.
- **Secondary (diverging):** Pink-to-green — for delta views in what-if simulation (E8) and cross-jurisdiction comparison (E7). Exact breakpoints per user story to be determined when those stories are implemented.

The 5-stop BuPu scale stops should reflect meaningful categorical distinctions in RIS score bands rather than arbitrary equal intervals (e.g., not simply 0/25/50/75/100). Exact stops to be finalized when RIS score distributions across the peer set are known.

---

## Rationale

### Library choice: Leaflet over Mapbox and react-simple-maps

- **Proven in the zoning atlas domain:** Leaflet (and its predecessor) was used in the Connecticut Zoning Atlas — the project that preceded the Virginia Zoning Atlas and established the NZA methodology. This provides direct validation that Leaflet is sufficient for the choropleth use case Parcela requires.
- **No API key required:** Mapbox GL JS requires a Mapbox account and API key, with usage metered against a free tier (~50,000 map loads/month). Leaflet uses OpenStreetMap tiles by default — no key, no usage limits, no billing risk during the demo.
- **Lower implementation complexity for MVP:** Mapbox provides higher visual fidelity and smoother pan/zoom but requires more setup (style definitions, data-driven expressions, GL context management). Leaflet's GeoJSON overlay approach for choropleth shading is simpler and sufficient for the demo's interactivity requirements.
- **Open source with active ecosystem:** `react-leaflet` v4 provides React component wrappers for Leaflet, keeping the implementation consistent with the Next.js/React application stack (ADR-0001).
- **Tool positioning:** The team agreed that Parcela should be designed as complementary to — not a replacement for — the GIS platforms Val already uses. A production-quality tile-based map is not a differentiator for Parcela's value proposition; the RIS score panel and what-if simulation are. Investing in Mapbox polish does not improve demo impact relative to the effort cost.

### Primary palette: BuPu (blue-purple)

- Mimi's recommendation, agreed by the team.
- BuPu is a sequential palette well-suited for single-variable choropleth maps where a continuous range (0–100 RIS) is encoded in color intensity.
- Blue-purple avoids the red/green connotations of a traffic-light palette, which would imply a normative stance on what RIS score is "good" or "bad." Parcela's disclaimer (E6-6) states the RIS is descriptive, not prescriptive — the palette supports this by avoiding loaded color associations.
- 5 stops is appropriate for MVP; standard guidance recommends 5–7 stops for choropleth maps. 5 was chosen to keep the legend readable given the score panel layout constraints.

### Secondary palette: diverging (pink-to-green)

- Used for delta views where the value being encoded is a *change* from baseline, not an absolute score.
- Pink-to-green is a conventional diverging palette for before/after comparisons where neither direction is inherently negative.
- Applies to: (1) what-if simulation (E8) — shading shows how a jurisdiction's score changes as sliders are adjusted; (2) comparison views (E7) — shading shows relative difference between compared jurisdictions.
- Exact application per story (which specific fields are shaded, what the neutral midpoint represents) to be determined during E7 and E8 implementation.

---

## Alternatives Considered

### Option A: `react-simple-maps`
- SVG-based; no tile layer; no API key required.
- Well-suited for static choropleth shading (E5-3 only).
- Limited interactivity — no smooth pan/zoom, no tile-based basemap, no county-level zoom (E6-1).
- Ruled out because it cannot support the county zoom interaction required by E6-1 without significant custom work.

### Option B: Mapbox GL JS (`react-map-gl`)
- Highest visual quality; tile-based with smooth zoom; satellite and street basemap options.
- Requires a Mapbox API key and has usage-based billing on the free tier.
- Supports county-level fill layers with data-driven color expressions.
- Ruled out due to API key requirement (billing risk for demo), higher implementation complexity, and the team's assessment that Mapbox's visual quality advantages are not a differentiator for Parcela's value proposition at MVP scope.

---

## Consequences

- **E5-3 and E6-1 can proceed** — the library decision was the blocking dependency for these stories. Both can now be implemented against `react-leaflet`.
- **GeoJSON boundary data required:** Leaflet choropleth requires GeoJSON files for state and county boundaries. US state-level GeoJSON is publicly available (Census TIGER/Line shapefiles); county-level GeoJSON for the 3 demo jurisdictions (Fairfax, Arlington, Loudoun) is similarly available. These will need to be included in `public/` or fetched at runtime.
- **Issue #95 can be closed** once this ADR is merged.
- **Secondary palette breakpoints are deferred:** The diverging palette's exact stop values and application will be defined when E7 and E8 are implemented, using the actual RIS score distributions from the peer set.
- **Color palette can be revisited post-hackathon** without changing the library — the BuPu and diverging palettes are applied as data-driven style values in the Leaflet GeoJSON layer, not baked into the library itself.
- **No Mapbox account or key setup required** — removes an onboarding step for new contributors and eliminates billing risk during the demo period.
