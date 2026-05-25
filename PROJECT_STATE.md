# TuMaps — Project State

## Phase 1 (MVP) — ✅ Complete

**Goal:** Fullscreen map with historical-data route safety estimation around Temple University campus.

### What was built

| Layer | Status | Notes |
|---|---|---|
| Next.js 15 + Mapbox GL JS frontend | ✅ | Dark-theme fullscreen map, side panel |
| FastAPI backend | ✅ | `/api/routes`, `/api/incidents`, `/api/segments/risk` |
| PostgreSQL + PostGIS DB model | ✅ | `incidents` table with spatial geometry |
| OSM road graph (walk network) | ✅ | 2.2 km radius from Temple, cached to `backend/data/graph.pkl` |
| Philly Open Data ingestion | ✅ | Carto SQL API, last 3 years, bbox-filtered |
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
Loading all incidents once at startup and querying a scipy KDTree is O(n log m) and avoids N+1 DB queries per edge. For 50k incidents × 10k edges this is ~5× faster than N individual PostGIS queries and keeps the risk computation self-contained in the graph service.

### Why OSMnx `walk` network?
Campus users are primarily pedestrians. Restricting to walkable edges also reduces graph size (~30%), improving A* speed.

### Why all three routes returned in one POST?
Avoids three sequential round-trips. All three paths share the same nearest-node lookup and the same in-memory graph, so computing them together adds negligible overhead.

### Why `graph.pkl` disk cache?
OSMnx downloads from the Overpass API (~15–30 s). Caching to disk means subsequent Railway restarts are instant. The cache is not committed to git (see `.gitignore`) but persists across Railway container restarts unless the service is re-deployed.

---

## Phase 2 — Planned

- [ ] Time-of-day risk weighting (multiply severity by hour-of-day factor)
- [ ] Segment-level route colouring on the map (render each `segments[]` entry separately)
- [ ] Risk score refresh endpoint (`POST /api/admin/refresh-risks`)
- [ ] Periodic ingest via Railway cron or external scheduler
- [ ] Expand Temple PD geocoder with named building → coordinates mapping

## Phase 3 — Future

- [ ] Live SEPTA disruption alerts layered on risk
- [ ] User-reported incidents (authenticated)
- [ ] ML-based time-series risk forecasting
