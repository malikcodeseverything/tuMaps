"use client";
import { useState, useEffect } from "react";
import { fetchRoutes, fetchIncidents, fetchRiskSegments } from "@/services/api";
import type { RoutesResponse, IncidentCollection, RiskSegmentCollection } from "@/types";

export function useRoute(
  origin: [number, number] | null,
  destination: [number, number] | null,
) {
  const [routes, setRoutes] = useState<RoutesResponse | null>(null);
  const [incidents, setIncidents] = useState<IncidentCollection | null>(null);
  const [riskSegments, setRiskSegments] = useState<RiskSegmentCollection | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  // True while a route request is waiting for a sleeping backend to start.
  const [isMapWaking, setIsMapWaking] = useState(false);
  const [isWaking, setIsWaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Map overlays are optional: routing still works without them.
    let cancelled = false;
    fetchIncidents(() => {
      if (!cancelled) setIsMapWaking(true);
    })
      .then((data) => {
        if (!cancelled) setIncidents(data);
      })
      .catch((e) => console.warn("Incident heatmap unavailable:", e))
      .finally(() => {
        if (!cancelled) setIsMapWaking(false);
      });
    fetchRiskSegments()
      .then(setRiskSegments)
      .catch((e) => console.warn("Road risk layer unavailable:", e));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!origin || !destination) {
      setRoutes(null);
      setError(null);
      return;
    }
    setIsLoading(true);
    setIsWaking(false);
    setError(null);
    fetchRoutes(origin, destination, () => setIsWaking(true))
      .then(setRoutes)
      .catch((e) => setError(e.message))
      .finally(() => {
        setIsLoading(false);
        setIsWaking(false);
      });
  }, [origin, destination]);

  return {
    routes,
    incidents,
    riskSegments,
    dataThrough: incidents?.meta?.data_through ?? null,
    isLoading,
    isWaking,
    isMapWaking,
    error,
  };
}
