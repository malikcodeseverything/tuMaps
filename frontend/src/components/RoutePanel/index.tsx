"use client";
import type { RouteMode, RoutesResponse, SelectingMode } from "@/types";
import LocationSearch from "./LocationSearch";
import RouteTypeToggle from "./RouteTypeToggle";
import RouteResults from "./RouteResults";

// "2026-11-14" -> "Nov 14, 2026" (parsed as a local date to avoid a UTC off-by-one)
function formatDataDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

interface Props {
  dataThrough: string | null;
  origin: [number, number] | null;
  destination: [number, number] | null;
  selectedMode: RouteMode;
  routes: RoutesResponse | null;
  isLoading: boolean;
  error: string | null;
  selectingMode: SelectingMode;
  onOriginChange: (pt: [number, number] | null) => void;
  onDestinationChange: (pt: [number, number] | null) => void;
  onModeChange: (mode: RouteMode) => void;
  onSelectingModeChange: (mode: SelectingMode) => void;
}

export default function RoutePanel({
  dataThrough,
  origin,
  destination,
  selectedMode,
  routes,
  isLoading,
  error,
  selectingMode,
  onOriginChange,
  onDestinationChange,
  onModeChange,
  onSelectingModeChange,
}: Props) {
  return (
    <div className="absolute top-4 left-4 z-10 w-80 rounded-2xl bg-gray-900/95 backdrop-blur-sm shadow-2xl border border-gray-700/50 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-700/50">
        <h1 className="text-sm font-semibold text-white tracking-wide">Temple Safety Routes</h1>
        <p className="text-xs text-gray-400 mt-0.5">
          Historical risk · Philadelphia data
          {dataThrough && <> through {formatDataDate(dataThrough)}</>}
        </p>
      </div>

      {/* Location inputs */}
      <div className="px-4 py-3 space-y-2 border-b border-gray-700/50">
        <LocationSearch
          label="From"
          dotColor="bg-green-500"
          placeholder="Start location…"
          value={origin}
          isPickingFromMap={selectingMode === "origin"}
          onSelect={onOriginChange}
          onPickFromMap={() =>
            onSelectingModeChange(selectingMode === "origin" ? null : "origin")
          }
          onClear={() => onOriginChange(null)}
        />
        <LocationSearch
          label="To"
          dotColor="bg-red-500"
          placeholder="Destination…"
          value={destination}
          isPickingFromMap={selectingMode === "destination"}
          onSelect={onDestinationChange}
          onPickFromMap={() =>
            onSelectingModeChange(selectingMode === "destination" ? null : "destination")
          }
          onClear={() => onDestinationChange(null)}
        />
      </div>

      {/* Route type selector */}
      {(origin && destination) && (
        <div className="px-4 py-3 border-b border-gray-700/50">
          <RouteTypeToggle
            selectedMode={selectedMode}
            routes={routes}
            onModeChange={onModeChange}
          />
        </div>
      )}

      {/* Results */}
      <RouteResults
        routes={routes}
        selectedMode={selectedMode}
        isLoading={isLoading}
        error={error}
        hasPoints={!!(origin && destination)}
      />
    </div>
  );
}
