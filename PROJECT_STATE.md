# TuMaps — Project State

## Phase 1 (MVP) — ✅ Complete

**Goal:** Fullscreen map with historical-data route safety estimation around Temple University campus.

### What was built

| Layer | Status | Notes |
|---|---|---|
| Next.js 16 + Mapbox GL JS frontend | ✅ | Dark-theme fullscreen map, side panel |
| FastAPI backend | ✅ | `/api/routes`, `/api/incidents`, `/api/segments/risk`, `/health` |
| PostgreSQL DB model | ✅ | `incidents` table with lat/lng columns (PostGIS not required) |
| OSM road graph (walk network) | ✅ | 2.2 km radius from Temple, built into the Docker image (`scripts/build_graph.py`); every edge at walking speed (4.5 km/h) |
| Philly Open Data ingestion | ✅ | Carto SQL API, last 3 years, bbox matches the graph area, keyset-paginated so no rows are dropped |
| Automatic data refresh | ✅ | Background task checks daily and re-ingests when the newest incident is over 2 days old, then recomputes risk |
| Lean map payloads | ✅ | Incidents merged by location into weighted heatmap points; rounded coordinates; in-memory cache + `Cache-Control` |
| Resilient startup | ✅ | Waits for Postgres; starts in degraded mode and retries if the road graph can't be loaded |
| Fast cold starts | ✅ | Risk scores and heatmap precomputed per data refresh and stored in an `artifacts` table; no OSMnx/GeoPandas at runtime; ready ~1.2 s after process start |
| Scale-to-zero hosting | ✅ | Railway Serverless (API) + Neon (Postgres); no connection pool so both can sleep |
| Landing page with warm-up | ✅ | `/` pings `/health` and prefetches map data; map moved to `/map`; API calls retry through cold starts |
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

### Why build `graph.pkl` into the Docker image?
OSMnx downloads from the Overpass API (about 15 to 30 s). A sleeping service wakes into a fresh container, so a runtime download would add that to every cold start. Building the graph during `docker build` moves the download to deploy time; the graph layer is cached unless `graph.py` or the build script change. If Overpass is down during a build, the build fails and the previous deployment stays live. The pickle is not committed to git (see `.gitignore`).

### Why scale to zero instead of always-on?
A portfolio demo gets a few visits a week. Always-on hosting bills for idle time; Railway's Free plan credit ($1/month) can't cover an always-on API plus Postgres. Sleeping makes it nearly free, at the cost of a cold start, which the startup work above shrinks to a few seconds and the landing page hides.

### Why keep Postgres (on Neon) instead of files?
Storing precomputed results as files on a volume would remove the database entirely, but Postgres keeps SQL access to the raw incidents (needed for time-of-day weighting), supports future features that need writes (accounts, saved routes, user reports), and avoids single-writer file handling. Neon's free tier scales to zero, so keeping it costs nothing. Supabase's free tier was ruled out because projects pause after a week of inactivity and need a manual restore.

### Why fixed walking speed instead of `ox.add_edge_speeds()`?
`add_edge_speeds()` imputes driving speeds from `maxspeed` and road type, which made walk times several times too short and biased "fastest" toward arterials. A single pedestrian speed also keeps the A* heuristic (straight-line distance / walking speed) admissible.

### Why merge incidents by location for the heatmap?
Philly geocodes many incidents to the same block point. Mapbox heatmaps sum point weights, so sending one point per location with the summed severity renders identically while cutting the payload from 8.2 MB (a 50k sample) to 3.3 MB for the full 67k-incident dataset.

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
