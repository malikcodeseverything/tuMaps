"use client";
import dynamic from "next/dynamic";
import { useState, useCallback } from "react";
import RoutePanel from "@/components/RoutePanel";
import { useRoute } from "@/hooks/useRoute";
import type { RouteMode, SelectingMode } from "@/types";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

export default function Home() {
  const [origin, setOrigin] = useState<[number, number] | null>(null);
  const [destination, setDestination] = useState<[number, number] | null>(null);
  const [selectedMode, setSelectedMode] = useState<RouteMode>("balanced");
  const [selectingMode, setSelectingMode] = useState<SelectingMode>(null);

  const { routes, incidents, riskSegments, dataThrough, isLoading, error } = useRoute(origin, destination);

  const handleMapClick = useCallback(
    (lngLat: [number, number]) => {
      if (selectingMode === "origin") {
        setOrigin(lngLat);
        setSelectingMode(null);
      } else if (selectingMode === "destination") {
        setDestination(lngLat);
        setSelectingMode(null);
      }
    },
    [selectingMode],
  );

  return (
    <div className="relative w-full h-screen">
      <MapView
        routes={routes}
        selectedMode={selectedMode}
        incidents={incidents}
        riskSegments={riskSegments}
        origin={origin}
        destination={destination}
        selectingMode={selectingMode}
        onMapClick={handleMapClick}
      />
      <RoutePanel
        dataThrough={dataThrough}
        origin={origin}
        destination={destination}
        selectedMode={selectedMode}
        routes={routes}
        isLoading={isLoading}
        error={error}
        selectingMode={selectingMode}
        onOriginChange={setOrigin}
        onDestinationChange={setDestination}
        onModeChange={setSelectedMode}
        onSelectingModeChange={setSelectingMode}
      />
    </div>
  );
}
