"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronDown, LocateFixed, Navigation2, Loader2, TriangleAlert, Flag } from "lucide-react";
import type { RouteProgress } from "@/lib/navigation";
import { ARRIVED_WITHIN_M, OFF_ROUTE_AFTER_M, WALK_SPEED_MPS } from "@/lib/navigation";
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
  onOriginChange: (pt: [number, number] | null, name?: string | null) => void;
  onDestinationChange: (pt: [number, number] | null, name?: string | null) => void;
  onModeChange: (mode: RouteMode) => void;
  onSelectingModeChange: (mode: SelectingMode) => void;
  navigating: boolean;
  progress: RouteProgress | null;
  hasUserPos: boolean;
  locating: boolean;
  locationError: string | null;
  onStartNav: () => void;
  onEndNav: () => void;
  onReroute: () => void;
  onUseMyLocation: () => void;
  compassNeedsTap: boolean;
  onEnableCompass: () => void;
}

const MODE_NAMES: Record<RouteMode, string> = { safest: "Safest", fastest: "Fastest", balanced: "Balanced" };

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
  navigating,
  progress,
  hasUserPos,
  locating,
  locationError,
  onStartNav,
  onEndNav,
  onReroute,
  onUseMyLocation,
  compassNeedsTap,
  onEnableCompass,
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
    <div className="absolute top-[4.5rem] lg:top-4 left-4 right-14 lg:right-auto z-10 lg:w-80 max-h-[calc(100dvh-5.5rem)] lg:max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain rounded-2xl bg-gray-900/95 backdrop-blur-sm shadow-2xl border border-gray-700/50">
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
        {result && !navigating && (
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

      {navigating && result && (
        <div className="px-4 py-3 space-y-3" role="status" aria-live="polite">
          {(() => {
            const arrived = !!progress && progress.remainingM <= ARRIVED_WITHIN_M;
            const offRoute = !!progress && !arrived && progress.offRouteM > OFF_ROUTE_AFTER_M;
            if (arrived) {
              return (
                <div className="flex items-center gap-2 text-green-400">
                  <Flag size={18} />
                  <p className="text-base font-semibold">You&apos;ve arrived</p>
                </div>
              );
            }
            if (isLoading) {
              return (
                <div className="flex items-center gap-2 text-gray-300">
                  <Loader2 size={16} className="animate-spin" />
                  <p className="text-sm">Rerouting…</p>
                </div>
              );
            }
            return (
              <>
                <div>
                  <p className="text-2xl font-semibold text-white leading-none">
                    {progress ? fmtTime(progress.remainingM / WALK_SPEED_MPS) : "Finding you…"}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {progress ? `${fmtDist(progress.remainingM)} left` : "Allow location access to start"} · {MODE_NAMES[selectedMode]} route to{" "}
                    {destinationName ?? "destination"}
                  </p>
                </div>
                {offRoute && (
                  <div className="flex items-center justify-between gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2">
                    <p className="flex items-center gap-1.5 text-xs text-amber-200">
                      <TriangleAlert size={14} /> You&apos;re off the route
                    </p>
                    <button
                      type="button"
                      onClick={onReroute}
                      disabled={!hasUserPos}
                      className="text-xs font-semibold text-amber-100 rounded-md px-2 py-1 bg-amber-500/20 hover:bg-amber-500/30"
                    >
                      Reroute from here
                    </button>
                  </div>
                )}
              </>
            );
          })()}
          {compassNeedsTap && (
            <button
              type="button"
              onClick={onEnableCompass}
              className="w-full rounded-lg py-2 text-xs font-semibold text-blue-200 bg-blue-500/15 border border-blue-400/30 hover:bg-blue-500/25"
            >
              Tap to turn the map with your compass
            </button>
          )}
          <button
            type="button"
            onClick={onEndNav}
            className="w-full rounded-lg py-2 text-sm font-semibold text-white bg-gray-700 hover:bg-gray-600 transition-colors"
          >
            End
          </button>
        </div>
      )}

      {!navigating && <>
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
        {!origin && (
          <button
            type="button"
            onClick={onUseMyLocation}
            disabled={locating}
            className="flex items-center gap-1.5 text-xs font-medium text-blue-300 hover:text-blue-200 disabled:opacity-60 pt-0.5"
          >
            {locating ? <Loader2 size={13} className="animate-spin" /> : <LocateFixed size={13} />}
            {locating ? "Finding you…" : "Use my location as start"}
          </button>
        )}
        {locationError && <p className="text-xs text-amber-300">{locationError}</p>}
      </div>

      {/* Route type selector */}
      {(origin && destination) && (
        <div className="px-4 py-3 border-b border-gray-700/50">
          <RouteTypeToggle
            selectedMode={selectedMode}
            routes={routes}
            onModeChange={onModeChange}
          />
          {result && (
            <button
              type="button"
              onClick={onStartNav}
              className="mt-2 w-full flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 transition-colors"
            >
              <Navigation2 size={15} /> Start
            </button>
          )}
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
      </>}
    </div>
  );
}
