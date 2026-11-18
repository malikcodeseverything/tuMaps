"use client";
import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type {
  RoutesResponse,
  IncidentCollection,
  RiskSegmentCollection,
  RouteMode,
  SelectingMode,
  Place,
} from "@/types";

const TEMPLE_CENTER: [number, number] = [-75.1557, 39.9812];
const ROUTE_COLORS: Record<RouteMode, string> = {
  safest: "#22c55e",
  fastest: "#3b82f6",
  balanced: "#a855f7",
};

const SEARCH_PIN_COLOR = "#a41e35"; // Temple cherry

const EMPTY_FC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

interface Props {
  routes: RoutesResponse | null;
  selectedMode: RouteMode;
  incidents: IncidentCollection | null;
  riskSegments: RiskSegmentCollection | null;
  origin: [number, number] | null;
  destination: [number, number] | null;
  selectingMode: SelectingMode;
  searchedPlace: Place | null;
  navigating: boolean;
  userPos: [number, number] | null;
  heading: number | null;
  onMapClick: (lngLat: [number, number]) => void;
  onUserLocation: (lngLat: [number, number]) => void;
}

const NAV_PITCH = 50;
const PITCH_KEY = "tumaps.navPitch";

function readNavPitch(): number {
  try {
    const v = Number(localStorage.getItem(PITCH_KEY));
    return Number.isFinite(v) && v >= 0 && v <= 60 && localStorage.getItem(PITCH_KEY) !== null ? v : NAV_PITCH;
  } catch {
    return NAV_PITCH;
  }
}

function saveNavPitch(p: number) {
  try { localStorage.setItem(PITCH_KEY, String(p)); } catch { /* private mode */ }
}

/** Shortest signed turn from a to b, in degrees (-180..180). */
function angleDelta(a: number, b: number): number {
  return ((b - a + 540) % 360) - 180;
}

/** Frame-rate independent easing factor for a time constant in seconds. */
function smooth(dt: number, tau: number): number {
  return 1 - Math.exp(-dt / tau);
}

/** Arrow drawn at the walker's position while navigating. */
function makeArrow(): HTMLDivElement {
  const el = document.createElement("div");
  el.setAttribute("aria-label", "Your position and direction");
  el.style.width = "38px";
  el.style.height = "38px";
  el.innerHTML =
    '<svg viewBox="0 0 38 38" width="38" height="38" aria-hidden="true">' +
    '<circle cx="19" cy="19" r="17" fill="#2563eb" fill-opacity="0.18"/>' +
    '<path d="M19 6 L29 30 L19 24.5 L9 30 Z" fill="#2563eb" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/>' +
    "</svg>";
  return el;
}

/** Pan to a point only if it's off screen, so picking a place never loses it. */
function revealPoint(map: mapboxgl.Map, pt: [number, number]) {
  if (!map.getBounds()?.contains(pt)) map.easeTo({ center: pt, duration: 600 });
}

function initSources(map: mapboxgl.Map) {
  const sources: Array<[string, GeoJSON.FeatureCollection]> = [
    ["incidents", EMPTY_FC],
    ["road-risk", EMPTY_FC],
    ["route-safest", EMPTY_FC],
    ["route-fastest", EMPTY_FC],
    ["route-balanced", EMPTY_FC],
  ];
  sources.forEach(([id, data]) => {
    map.addSource(id, { type: "geojson", data });
  });
}

function initLayers(map: mapboxgl.Map) {
  // Road risk colouring — drawn below route layers
  map.addLayer({
    id: "road-risk-line",
    type: "line",
    source: "road-risk",
    layout: { "line-join": "round", "line-cap": "round" },
    paint: {
      "line-color": [
        "interpolate", ["linear"], ["get", "risk"],
        0, "#22c55e",
        0.3, "#eab308",
        0.6, "#f97316",
        1, "#ef4444",
      ],
      "line-width": 3,
      "line-opacity": 0.65,
    },
  });

  // Incident heatmap. Each point's weight is the summed severity of all
  // incidents at that location, which renders the same as one point per incident.
  // Intensity is tuned for the full dataset of the routed area (~70k incidents).
  map.addLayer({
    id: "incidents-heatmap",
    type: "heatmap",
    source: "incidents",
    paint: {
      "heatmap-weight": ["coalesce", ["get", "weight"], 0.2],
      "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 12, 0.2, 16, 0.6],
      "heatmap-color": [
        "interpolate", ["linear"], ["heatmap-density"],
        0, "rgba(0,0,0,0)",
        0.2, "rgba(59,130,246,0.5)",
        0.5, "rgba(234,179,8,0.7)",
        0.8, "rgba(249,115,22,0.8)",
        1, "rgba(239,68,68,0.9)",
      ],
      "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 12, 15, 16, 30],
      "heatmap-opacity": 0.7,
    },
  });

  // Route lines — one per mode
  (["safest", "fastest", "balanced"] as RouteMode[]).forEach((mode) => {
    map.addLayer({
      id: `route-${mode}-line`,
      type: "line",
      source: `route-${mode}`,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": ROUTE_COLORS[mode],
        "line-width": 5,
        "line-opacity": 0.3,
      },
    });
  });
}

function setRouteSource(map: mapboxgl.Map, mode: RouteMode, data: GeoJSON.FeatureCollection) {
  const src = map.getSource(`route-${mode}`) as mapboxgl.GeoJSONSource | undefined;
  src?.setData(data);
}

function updateRouteOpacity(map: mapboxgl.Map, selected: RouteMode) {
  (["safest", "fastest", "balanced"] as RouteMode[]).forEach((mode) => {
    if (!map.getLayer(`route-${mode}-line`)) return;
    const active = mode === selected;
    map.setPaintProperty(`route-${mode}-line`, "line-opacity", active ? 0.95 : 0.25);
    map.setPaintProperty(`route-${mode}-line`, "line-width", active ? 6 : 4);
  });
}

export default function MapView({
  routes,
  selectedMode,
  incidents,
  riskSegments,
  origin,
  destination,
  selectingMode,
  searchedPlace,
  navigating,
  userPos,
  heading,
  onMapClick,
  onUserLocation,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  // State (not a ref) so the data effects below re-run once the style loads.
  // With a ref, data that arrived before the map finished loading was dropped.
  const [mapReady, setMapReady] = useState(false);
  const originMarker = useRef<mapboxgl.Marker | null>(null);
  const destMarker = useRef<mapboxgl.Marker | null>(null);
  const searchMarker = useRef<mapboxgl.Marker | null>(null);
  const onClickRef = useRef(onMapClick);
  const onUserLocationRef = useRef(onUserLocation);
  const geolocateRef = useRef<mapboxgl.GeolocateControl | null>(null);
  const trackingRef = useRef(false);
  const navigatingRef = useRef(navigating);
  const arrowMarker = useRef<mapboxgl.Marker | null>(null);
  // Whether the camera follows the walker; dragging the map pauses it.
  const [following, setFollowing] = useState(true);

  useEffect(() => { onClickRef.current = onMapClick; }, [onMapClick]);
  useEffect(() => { onUserLocationRef.current = onUserLocation; }, [onUserLocation]);
  useEffect(() => { navigatingRef.current = navigating; }, [navigating]);

  // Initialise map once
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) {
      console.error("NEXT_PUBLIC_MAPBOX_TOKEN is not set");
      return;
    }
    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: TEMPLE_CENTER,
      zoom: 15,
    });

    map.addControl(new mapboxgl.NavigationControl(), "top-right");

    // Blue dot for the walker's position. Following it is what navigation uses.
    const geolocate = new mapboxgl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
      showUserHeading: true,
      fitBoundsOptions: { maxZoom: 17.5 },
    });
    map.addControl(geolocate, "top-right");
    geolocate.on("geolocate", (e: unknown) => {
      const { coords } = e as GeolocationPosition;
      onUserLocationRef.current([coords.longitude, coords.latitude]);
    });
    geolocate.on("trackuserlocationstart", () => { trackingRef.current = true; });
    geolocate.on("trackuserlocationend", () => { trackingRef.current = false; });
    geolocateRef.current = geolocate;

    map.on("load", () => {
      initSources(map);
      initLayers(map);
      setMapReady(true);
    });

    map.on("dragstart", (e) => {
      // One finger or the mouse pans away; two fingers are tilting or zooming.
      const oe = e.originalEvent as TouchEvent | MouseEvent | undefined;
      const multiTouch = !!oe && "touches" in oe && oe.touches.length > 1;
      if (navigatingRef.current && !multiTouch) setFollowing(false);
    });

    map.on("click", (e) => {
      onClickRef.current([e.lngLat.lng, e.lngLat.lat]);
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      geolocateRef.current = null;
      trackingRef.current = false;
      setMapReady(false);
    };
  }, []);

  // Cursor feedback when picking a location
  useEffect(() => {
    const canvas = mapRef.current?.getCanvas();
    if (canvas) canvas.style.cursor = selectingMode ? "crosshair" : "";
  }, [selectingMode]);

  // Origin marker
  useEffect(() => {
    originMarker.current?.remove();
    originMarker.current = null;
    if (origin && mapRef.current) {
      originMarker.current = new mapboxgl.Marker({ color: "#22c55e" })
        .setLngLat(origin)
        .addTo(mapRef.current);
      if (!destination) revealPoint(mapRef.current, origin);
    }
    // Only a new origin should pan the map, not a destination change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin]);

  // Destination marker
  useEffect(() => {
    destMarker.current?.remove();
    destMarker.current = null;
    if (destination && mapRef.current) {
      destMarker.current = new mapboxgl.Marker({ color: "#ef4444" })
        .setLngLat(destination)
        .addTo(mapRef.current);
      if (!origin) revealPoint(mapRef.current, destination);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination]);

  // Place found with the search bar: drop a pin and fly to it
  useEffect(() => {
    searchMarker.current?.remove();
    searchMarker.current = null;
    const map = mapRef.current;
    if (!searchedPlace || !map) return;
    searchMarker.current = new mapboxgl.Marker({ color: SEARCH_PIN_COLOR })
      .setLngLat(searchedPlace.center)
      .addTo(map);
    map.flyTo({ center: searchedPlace.center, zoom: Math.max(map.getZoom(), 17), duration: 900 });
  }, [searchedPlace]);

  // Incident heatmap
  useEffect(() => {
    if (!mapReady || !mapRef.current || !incidents) return;
    const src = mapRef.current.getSource("incidents") as mapboxgl.GeoJSONSource | undefined;
    src?.setData(incidents as unknown as GeoJSON.FeatureCollection);
  }, [incidents, mapReady]);

  // Road risk layer
  useEffect(() => {
    if (!mapReady || !mapRef.current || !riskSegments) return;
    const src = mapRef.current.getSource("road-risk") as mapboxgl.GeoJSONSource | undefined;
    src?.setData(riskSegments as unknown as GeoJSON.FeatureCollection);
  }, [riskSegments, mapReady]);

  // Routes
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;

    if (!routes) {
      (["safest", "fastest", "balanced"] as RouteMode[]).forEach((m) =>
        setRouteSource(map, m, EMPTY_FC),
      );
      return;
    }

    (["safest", "fastest", "balanced"] as RouteMode[]).forEach((m) => {
      const result = routes[m];
      if (!result) return;
      setRouteSource(map, m, {
        type: "FeatureCollection",
        features: [{ type: "Feature", geometry: result.geometry, properties: {} }],
      });
    });

    updateRouteOpacity(map, selectedMode);

    // Fit map to the selected route
    const selected = routes[selectedMode];
    // While navigating the camera follows the walker, even after a reroute.
    if (selected && selected.geometry.coordinates.length > 0 && !navigatingRef.current) {
      const coords = selected.geometry.coordinates as [number, number][];
      const bounds = coords.reduce(
        (b, c) => b.extend(c),
        new mapboxgl.LngLatBounds(coords[0], coords[0]),
      );
      // Keep the route clear of the panel: beside it on desktop, under the
      // compact summary on phones and small tablets.
      const narrow = window.matchMedia("(max-width: 1023px)").matches;
      const padding = narrow
        ? { top: Math.min(300, Math.round(window.innerHeight * 0.5)), bottom: 40, left: 32, right: 32 }
        : { top: 80, bottom: 80, left: 380, right: 80 };
      map.fitBounds(bounds, { padding, maxZoom: 17 });
    }
  }, [routes, selectedMode, mapReady]);

  // Selected mode opacity
  useEffect(() => {
    if (!mapReady || !mapRef.current || !routes) return;
    updateRouteOpacity(mapRef.current, selectedMode);
  }, [selectedMode, routes, mapReady]);

  // Navigation camera. One animation loop eases the map toward the walker's
  // position and heading every frame. Separate easeTo calls per GPS or compass
  // reading cancelled each other before they could turn the map.
  const userPosRef = useRef(userPos);
  const headingRef = useRef(heading);
  const followingRef = useRef(following);
  const interactingRef = useRef(false);
  const [tilted, setTilted] = useState(true);
  const pitchTarget = useRef(NAV_PITCH);
  const zoomTarget = useRef(17.5);

  useEffect(() => { userPosRef.current = userPos; }, [userPos]);
  useEffect(() => { headingRef.current = heading; }, [heading]);
  useEffect(() => { followingRef.current = following; }, [following]);

  // Two-finger tilt and pinch zoom are the walker's choice: pause the loop
  // while fingers are down, then keep whatever pitch and zoom they left.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const down = () => { interactingRef.current = true; };
    const up = (e: mapboxgl.MapTouchEvent) => {
      if (e.originalEvent.touches.length > 0) return;
      interactingRef.current = false;
      keepUserCamera();
    };
    // Only gestures carry an originalEvent; the follow loop's own moves don't.
    const keepUserCamera = () => {
      pitchTarget.current = map.getPitch();
      zoomTarget.current = map.getZoom();
      setTilted(map.getPitch() > 10);
      if (navigatingRef.current) saveNavPitch(map.getPitch());
    };
    // Mapbox's types leave originalEvent off these events, but it is set for gestures.
    const byUser = (e: unknown) => !!(e as { originalEvent?: Event }).originalEvent;
    const wheel = (e: unknown) => { if (byUser(e)) zoomTarget.current = map.getZoom(); };
    const pitched = (e: unknown) => { if (byUser(e)) keepUserCamera(); };
    const rotate = (e: unknown) => { if (byUser(e) && navigatingRef.current) setFollowing(false); };
    map.on("touchstart", down);
    map.on("touchend", up);
    map.on("touchcancel", up);
    map.on("zoomend", wheel);
    map.on("pitchend", pitched);
    map.on("rotatestart", rotate);
    return () => {
      map.off("touchstart", down);
      map.off("touchend", up);
      map.off("touchcancel", up);
      map.off("zoomend", wheel);
      map.off("pitchend", pitched);
      map.off("rotatestart", rotate);
    };
  }, [mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (!navigating) {
      arrowMarker.current?.remove();
      arrowMarker.current = null;
      map.easeTo({ pitch: 0, bearing: 0, padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: 600 });
      return;
    }
    setFollowing(true);
    // The location control's own follow mode would fight this camera.
    if (trackingRef.current) geolocateRef.current?.trigger();
    const saved = readNavPitch();
    pitchTarget.current = saved;
    setTilted(saved > 10);
    zoomTarget.current = Math.max(map.getZoom(), 17.5);
    // Sit the arrow low on screen so more of the route ahead shows.
    map.setPadding({ top: Math.round(map.getContainer().clientHeight * 0.4), bottom: 0, left: 0, right: 0 });

    let frame = 0;
    let last = performance.now();
    let shownHeading: number | null = null;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const pos = userPosRef.current;
      if (!pos) return;
      const target = headingRef.current;
      if (target !== null) {
        shownHeading = shownHeading === null ? target : shownHeading + angleDelta(shownHeading, target) * smooth(dt, 0.18);
      }
      if (!arrowMarker.current) {
        arrowMarker.current = new mapboxgl.Marker({ element: makeArrow(), rotationAlignment: "map", pitchAlignment: "map" })
          .setLngLat(pos)
          .addTo(map);
      }
      arrowMarker.current.setLngLat(pos).setRotation(shownHeading ?? 0);
      if (!followingRef.current || interactingRef.current) return;
      const c = map.getCenter();
      const k = smooth(dt, 0.3);
      const bearing = shownHeading ?? map.getBearing();
      map.jumpTo({
        center: [c.lng + (pos[0] - c.lng) * k, c.lat + (pos[1] - c.lat) * k],
        bearing: map.getBearing() + angleDelta(map.getBearing(), bearing) * smooth(dt, 0.12),
        pitch: map.getPitch() + (pitchTarget.current - map.getPitch()) * smooth(dt, 0.2),
        zoom: map.getZoom() + (zoomTarget.current - map.getZoom()) * smooth(dt, 0.3),
      });
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [navigating, mapReady]);

  const toggleTilt = () => {
    const next = !tilted;
    setTilted(next);
    pitchTarget.current = next ? NAV_PITCH : 0;
    saveNavPitch(pitchTarget.current);
    if (!following) mapRef.current?.easeTo({ pitch: pitchTarget.current, duration: 500 });
  };

  return (
    <>
      <div ref={containerRef} className="absolute inset-0" />
      {navigating && !following && (
        <button
          type="button"
          onClick={() => setFollowing(true)}
          className="absolute z-20 bottom-8 left-1/2 -translate-x-1/2 rounded-full px-4 py-2 text-sm font-semibold text-white bg-blue-600 shadow-lg hover:bg-blue-500"
        >
          Recenter
        </button>
      )}
      {navigating && (
        <button
          type="button"
          onClick={toggleTilt}
          aria-label={tilted ? "Switch to top-down view" : "Switch to angled view"}
          className="absolute z-20 bottom-10 right-3 w-12 h-12 rounded-full text-sm font-bold text-gray-900 bg-white shadow-lg hover:bg-gray-100"
        >
          {tilted ? "2D" : "3D"}
        </button>
      )}
    </>
  );

}
