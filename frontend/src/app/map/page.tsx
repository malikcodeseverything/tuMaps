"use client";
import dynamic from "next/dynamic";
import { useState, useCallback } from "react";
import RoutePanel from "@/components/RoutePanel";
import MapSearch from "@/components/Search/MapSearch";
import { useRoute } from "@/hooks/useRoute";
import type { Place, RouteMode, SelectingMode } from "@/types";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

export default function MapPage() {
  const [origin, setOrigin] = useState<[number, number] | null>(null);
  const [destination, setDestination] = useState<[number, number] | null>(null);
  // Names for points set from the search bar, so the From/To boxes show
  // "Charles Library" instead of a reverse-geocoded street address.
  const [originName, setOriginName] = useState<string | null>(null);
  const [destinationName, setDestinationName] = useState<string | null>(null);
  const [selectedMode, setSelectedMode] = useState<RouteMode>("balanced");
  const [selectingMode, setSelectingMode] = useState<SelectingMode>(null);
  const [searchedPlace, setSearchedPlace] = useState<Place | null>(null);

  const { routes, incidents, riskSegments, dataThrough, isLoading, isWaking, isMapWaking, error } = useRoute(origin, destination);

  const changeOrigin = useCallback((pt: [number, number] | null, name: string | null = null) => {
    setOrigin(pt);
    setOriginName(name);
  }, []);

  const changeDestination = useCallback((pt: [number, number] | null, name: string | null = null) => {
    setDestination(pt);
    setDestinationName(name);
  }, []);

  const handleMapClick = useCallback(
    (lngLat: [number, number]) => {
      if (selectingMode === "origin") {
        changeOrigin(lngLat);
        setSelectingMode(null);
      } else if (selectingMode === "destination") {
        changeDestination(lngLat);
        setSelectingMode(null);
      }
    },
    [selectingMode, changeOrigin, changeDestination],
  );

  return (
    <div className="relative w-full h-dvh overflow-hidden">
      <MapView
        routes={routes}
        selectedMode={selectedMode}
        incidents={incidents}
        riskSegments={riskSegments}
        origin={origin}
        destination={destination}
        selectingMode={selectingMode}
        searchedPlace={searchedPlace}
        onMapClick={handleMapClick}
      />
      <RoutePanel
        dataThrough={dataThrough}
        origin={origin}
        destination={destination}
        originName={originName}
        destinationName={destinationName}
        selectedMode={selectedMode}
        routes={routes}
        isLoading={isLoading}
        isWaking={isWaking}
        isMapWaking={isMapWaking}
        error={error}
        selectingMode={selectingMode}
        onOriginChange={changeOrigin}
        onDestinationChange={changeDestination}
        onModeChange={setSelectedMode}
        onSelectingModeChange={setSelectingMode}
      />
      {/* Phones and tablets: full width above the route panel (leaving room for
          the zoom buttons). Desktop: beside the route panel. */}
      <MapSearch
        className="absolute z-20 top-4 left-4 right-14 lg:left-[22rem] lg:right-auto lg:w-96"
        place={searchedPlace}
        onPlaceChange={setSearchedPlace}
        onDirectionsFrom={(p) => {
          changeOrigin(p.center, p.name);
          setSearchedPlace(null);
        }}
        onDirectionsTo={(p) => {
          changeDestination(p.center, p.name);
          setSearchedPlace(null);
        }}
      />
    </div>
  );
}
