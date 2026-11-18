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
  onMapClick: (lngLat: [number, number]) => void;
  onUserLocation: (lngLat: [number, number]) => void;
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

  // Navigation: follow the walker, tilted so the street ahead is visible.
  useEffect(() => {
    const map = mapRef.current;
    const geolocate = geolocateRef.current;
    if (!map || !geolocate || !mapReady) return;
    if (navigating) {
      if (!trackingRef.current) geolocate.trigger();
      map.easeTo({ pitch: 45, duration: 800 });
    } else {
      map.easeTo({ pitch: 0, duration: 600 });
    }
  }, [navigating, mapReady]);

  return <div ref={containerRef} className="absolute inset-0" />;
}
