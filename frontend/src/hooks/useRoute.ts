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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchIncidents().then(setIncidents).catch(() => null);
    fetchRiskSegments().then(setRiskSegments).catch(() => null);
  }, []);

  useEffect(() => {
    if (!origin || !destination) {
      setRoutes(null);
      setError(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    fetchRoutes(origin, destination)
      .then(setRoutes)
      .catch((e) => setError(e.message))
      .finally(() => setIsLoading(false));
  }, [origin, destination]);

  return { routes, incidents, riskSegments, isLoading, error };
}
