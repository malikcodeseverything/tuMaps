"use client";
import { useEffect, useRef, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type {
  RoutesResponse,
  IncidentCollection,
  RiskSegmentCollection,
  RouteMode,
  SelectingMode,
} from "@/types";

const TEMPLE_CENTER: [number, number] = [-75.1557, 39.9812];
const ROUTE_COLORS: Record<RouteMode, string> = {
  safest: "#22c55e",
  fastest: "#3b82f6",
  balanced: "#a855f7",
};

const EMPTY_FC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

interface Props {
  routes: RoutesResponse | null;
  selectedMode: RouteMode;
  incidents: IncidentCollection | null;
  riskSegments: RiskSegmentCollection | null;
  origin: [number, number] | null;
  destination: [number, number] | null;
  selectingMode: SelectingMode;
  onMapClick: (lngLat: [number, number]) => void;
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

  // Incident heatmap
  map.addLayer({
    id: "incidents-heatmap",
    type: "heatmap",
    source: "incidents",
    paint: {
      "heatmap-weight": ["coalesce", ["get", "severity"], 0.2],
      "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 12, 0.5, 16, 1.5],
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
  onMapClick,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const readyRef = useRef(false);
  const originMarker = useRef<mapboxgl.Marker | null>(null);
  const destMarker = useRef<mapboxgl.Marker | null>(null);
  const onClickRef = useRef(onMapClick);

  useEffect(() => { onClickRef.current = onMapClick; }, [onMapClick]);

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

    map.on("load", () => {
      initSources(map);
      initLayers(map);
      readyRef.current = true;
    });

    map.on("click", (e) => {
      onClickRef.current([e.lngLat.lng, e.lngLat.lat]);
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
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
    }
  }, [origin]);

  // Destination marker
  useEffect(() => {
    destMarker.current?.remove();
    destMarker.current = null;
    if (destination && mapRef.current) {
      destMarker.current = new mapboxgl.Marker({ color: "#ef4444" })
        .setLngLat(destination)
        .addTo(mapRef.current);
    }
  }, [destination]);

  // Incident heatmap
  useEffect(() => {
    if (!readyRef.current || !mapRef.current || !incidents) return;
    const src = mapRef.current.getSource("incidents") as mapboxgl.GeoJSONSource | undefined;
    src?.setData(incidents as unknown as GeoJSON.FeatureCollection);
  }, [incidents]);

  // Road risk layer
  useEffect(() => {
    if (!readyRef.current || !mapRef.current || !riskSegments) return;
    const src = mapRef.current.getSource("road-risk") as mapboxgl.GeoJSONSource | undefined;
    src?.setData(riskSegments as unknown as GeoJSON.FeatureCollection);
  }, [riskSegments]);

  // Routes
  useEffect(() => {
    if (!readyRef.current || !mapRef.current) return;
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
    if (selected && selected.geometry.coordinates.length > 0) {
      const coords = selected.geometry.coordinates as [number, number][];
      const bounds = coords.reduce(
        (b, c) => b.extend(c),
        new mapboxgl.LngLatBounds(coords[0], coords[0]),
      );
      map.fitBounds(bounds, { padding: 80, maxZoom: 17 });
    }
  }, [routes, selectedMode]);

  // Selected mode opacity
  useEffect(() => {
    if (!readyRef.current || !mapRef.current || !routes) return;
    updateRouteOpacity(mapRef.current, selectedMode);
  }, [selectedMode, routes]);

  return <div ref={containerRef} className="absolute inset-0" />;
}
