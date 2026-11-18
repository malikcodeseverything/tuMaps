"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
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
  originName: string | null;
  destinationName: string | null;
  selectedMode: RouteMode;
  routes: RoutesResponse | null;
  isLoading: boolean;
  isWaking: boolean;
  isMapWaking: boolean;
  error: string | null;
  selectingMode: SelectingMode;
  onOriginChange: (pt: [number, number] | null) => void;
  onDestinationChange: (pt: [number, number] | null) => void;
  onModeChange: (mode: RouteMode) => void;
  onSelectingModeChange: (mode: SelectingMode) => void;
}

function riskLabel(score: number): string {
  if (score < 0.25) return "Low";
  if (score < 0.5) return "Moderate";
  if (score < 0.75) return "Elevated";
  return "High";
}

function fmtDist(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

function fmtTime(s: number): string {
  const min = Math.round(s / 60);
  return min < 1 ? "< 1 min" : `${min} min`;
}

// Matches Tailwind's lg breakpoint: below it the panel sits over the map.
const NARROW = "(max-width: 1023px)";

export default function RoutePanel({
  dataThrough,
  origin,
  destination,
  originName,
  destinationName,
  selectedMode,
  routes,
  isLoading,
  isWaking,
  isMapWaking,
  error,
  selectingMode,
  onOriginChange,
  onDestinationChange,
  onModeChange,
  onSelectingModeChange,
}: Props) {
  // On phones and small tablets the full panel covers most of the map, so it
  // folds into a compact summary once a route arrives. Tap it to open again.
  const [collapsed, setCollapsed] = useState(false);
  const hasPoints = !!(origin && destination);
  const result = hasPoints ? routes?.[selectedMode] : undefined;

  useEffect(() => {
    if (routes && hasPoints && window.matchMedia(NARROW).matches) setCollapsed(true);
  }, [routes, hasPoints]);

  useEffect(() => {
    if (!hasPoints || selectingMode) setCollapsed(false);
  }, [hasPoints, selectingMode]);

  const fold = collapsed ? "hidden lg:block" : "";

  return (
    // Below lg the map search bar sits above this panel; from lg it sits beside it.
    <div className="absolute top-[4.5rem] lg:top-4 left-4 right-4 lg:right-auto z-10 lg:w-80 max-h-[calc(100dvh-5.5rem)] lg:max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain rounded-2xl bg-gray-900/95 backdrop-blur-sm shadow-2xl border border-gray-700/50">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-700/50 flex items-start justify-between gap-3">
        <div className="min-w-0">
        <h1 className="text-sm font-semibold text-white tracking-wide">
          <Link href="/" className="hover:text-gray-300 transition-colors" title="About TuMaps">
            Temple Safety Routes
          </Link>
        </h1>
        <p className="text-xs text-gray-400 mt-0.5">
          Historical risk · Philadelphia data
          {dataThrough && <> through {formatDataDate(dataThrough)}</>}
        </p>
        </div>
        {result && (
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-expanded={!collapsed}
            className="lg:hidden flex-shrink-0 flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-200 bg-gray-800 hover:bg-gray-700 transition-colors"
          >
            {collapsed ? "Edit" : "Show map"}
            <ChevronDown size={14} className={`transition-transform ${collapsed ? "" : "rotate-180"}`} />
          </button>
        )}
      </div>

      {/* Compact summary, phones and small tablets only */}
      {collapsed && result && (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="lg:hidden w-full text-left px-4 py-2.5 border-b border-gray-700/50"
        >
          <p className="text-xs text-gray-300 truncate">
            {originName ?? "Start"} <span className="text-gray-500">to</span> {destinationName ?? "Destination"}
          </p>
          <p className="text-sm font-semibold text-white mt-0.5">
            {fmtDist(result.distance_m)} · {fmtTime(result.duration_s)} · {riskLabel(result.risk_score)} risk
          </p>
        </button>
      )}

      {isMapWaking && !isWaking && (
        <p role="status" className="px-4 py-2 text-xs text-amber-200 border-b border-gray-700/50">
          Waking up the routing server…
        </p>
      )}

      {/* Location inputs */}
      <div className={`px-4 py-3 space-y-2 border-b border-gray-700/50 ${fold}`}>
        <LocationSearch
          label="From"
          dotColor="bg-green-500"
          placeholder="Start location…"
          value={origin}
          placeName={originName}
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
          placeName={destinationName}
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
      <div className={fold}>
      <RouteResults
        routes={routes}
        selectedMode={selectedMode}
        isLoading={isLoading}
        isWaking={isWaking}
        error={error}
        hasPoints={hasPoints}
      />
      </div>
    </div>
  );
}
