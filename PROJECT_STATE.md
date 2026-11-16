# TuMaps — Project State

## Phase 1 (MVP) — ✅ Complete

**Goal:** Fullscreen map with historical-data route safety estimation around Temple University campus.

### What was built

| Layer | Status | Notes |
|---|---|---|
| Next.js 16 + Mapbox GL JS frontend | ✅ | Dark-theme fullscreen map, side panel |
| FastAPI backend | ✅ | `/api/routes`, `/api/incidents`, `/api/segments/risk`, `/health` |
| PostgreSQL DB model | ✅ | `incidents` table with lat/lng columns (PostGIS not required) |
| OSM road graph (walk network) | ✅ | 2.2 km radius from Temple, cached to `backend/data/graph.pkl`; every edge at walking speed (4.5 km/h) |
| Philly Open Data ingestion | ✅ | Carto SQL API, last 3 years, bbox matches the graph area, keyset-paginated so no rows are dropped |
| Automatic data refresh | ✅ | Background task checks daily and re-ingests when the newest incident is over 2 days old, then recomputes risk |
| Lean map payloads | ✅ | Incidents merged by location into weighted heatmap points; rounded coordinates; in-memory cache + `Cache-Control` |
| Resilient startup | ✅ | Waits for Postgres; starts in degraded mode and retries if the OSM download fails |
| Temple PD log scraping | ✅ | Best-effort HTML parser; non-fatal if unavailable |
| Source deduplication | ✅ | Spatial (80 m) + temporal (2 day) dedup |
| Road segment risk scoring | ✅ | KD-tree, 75 m radius, recency-weighted (180-day half-life) |
| A* routing × 3 modes | ✅ | safest / fastest / balanced weight strategies |
| Route overlay + heatmap + risk coloring | ✅ | All rendered via Mapbox GL JS |
| Address geocoding | ✅ | Mapbox Geocoding v5 API, campus-biased |
| Map-click point selection | ✅ | Crosshair mode per point |
| docker-compose for local dev | ✅ | PostGIS 16 image |
| Dockerfile for Railway deploy | ✅ | |

### Deliberately excluded (Phase 2+)
- User authentication / accounts
- Live/real-time alerts
- ML prediction or crowd analysis
- User-submitted reports
- Mobile app
- Time-of-day weighting (data exists, not wired into weights yet)

---

## Architecture decisions

### Why KD-tree instead of PostGIS ST_DWithin for risk scoring?
Loading all incidents once at startup and querying a scipy KDTree is O(n log m) and avoids N+1 DB queries per edge. For ~70k incidents × ~37k edges this is ~5× faster than N individual PostGIS queries and keeps the risk computation self-contained in the graph service.

### Why OSMnx `walk` network?
Campus users are primarily pedestrians. Restricting to walkable edges also reduces graph size (~30%), improving A* speed.

### Why all three routes returned in one POST?
Avoids three sequential round-trips. All three paths share the same nearest-node lookup and the same in-memory graph, so computing them together adds negligible overhead.

### Why `graph.pkl` disk cache?
OSMnx downloads from the Overpass API (about 15 to 30 s). Caching to disk makes later loads instant. The cache is not committed to git (see `.gitignore`). On Railway the container filesystem is replaced on every deploy, so the cache only survives restarts of the same deployment; mounting a volume at `/app/data` would keep it across deploys.

### Why fixed walking speed instead of `ox.add_edge_speeds()`?
`add_edge_speeds()` imputes driving speeds from `maxspeed` and road type, which made walk times several times too short and biased "fastest" toward arterials. A single pedestrian speed also keeps the A* heuristic (straight-line distance / walking speed) admissible.

### Why merge incidents by location for the heatmap?
Philly geocodes many incidents to the same block point. Mapbox heatmaps sum point weights, so sending one point per location with the summed severity renders identically while cutting the payload from 8.2 MB to about 2.6 MB.

---

## Phase 2 — Planned

- [ ] Time-of-day risk weighting (multiply severity by hour-of-day factor)
- [ ] Segment-level route colouring on the map (render each `segments[]` entry separately)
- [ ] Risk score refresh endpoint (`POST /api/admin/refresh-risks`)
- [x] Periodic ingest (in-app daily refresh; no external scheduler needed)
- [ ] Pre-aggregated heatmap tiles (vector tiles) for an even smaller first load
- [ ] Expand Temple PD geocoder with named building → coordinates mapping

## Phase 3 — Future

- [ ] Live SEPTA disruption alerts layered on risk
- [ ] User-reported incidents (authenticated)
- [ ] ML-based time-series risk forecasting
