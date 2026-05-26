"use client";
import { Loader2, AlertCircle, Navigation } from "lucide-react";
import type { RouteMode, RouteResult, RoutesResponse } from "@/types";

interface Props {
  routes: RoutesResponse | null;
  selectedMode: RouteMode;
  isLoading: boolean;
  error: string | null;
  hasPoints: boolean;
}

function fmt_dist(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

function fmt_time(s: number): string {
  const min = Math.round(s / 60);
  return min < 1 ? "< 1 min" : `${min} min`;
}

function riskColor(label: string): string {
  if (label.startsWith("Lower")) return "bg-green-500";
  if (label.startsWith("Moderate")) return "bg-yellow-400";
  if (label.startsWith("Elevated")) return "bg-orange-400";
  return "bg-red-500";
}

function RiskBar({ result }: { result: RouteResult }) {
  const pct = Math.max(4, Math.round(result.risk_percentile * 100));

  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-400">Relative risk</span>
        <span className="text-white font-medium">{result.risk_label}</span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-700 overflow-hidden">
        <div className={`h-full rounded-full ${riskColor(result.risk_label)} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function RouteResults({ routes, selectedMode, isLoading, error, hasPoints }: Props) {
  if (!hasPoints) {
    return (
      <div className="px-4 py-4 text-center">
        <Navigation size={20} className="text-gray-600 mx-auto mb-2" />
        <p className="text-xs text-gray-500">Enter a start and destination to calculate routes</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="px-4 py-4 flex items-center gap-2 text-gray-400">
        <Loader2 size={14} className="animate-spin flex-shrink-0" />
        <span className="text-xs">Calculating routes…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-4 flex items-start gap-2 text-red-400">
        <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
        <span className="text-xs">{error}</span>
      </div>
    );
  }

  const result = routes?.[selectedMode];
  if (!result) return null;

  return (
    <div className="px-4 py-3 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-gray-800/60 rounded-lg px-3 py-2">
          <p className="text-xs text-gray-400">Distance</p>
          <p className="text-sm font-semibold text-white mt-0.5">{fmt_dist(result.distance_m)}</p>
        </div>
        <div className="bg-gray-800/60 rounded-lg px-3 py-2">
          <p className="text-xs text-gray-400">Est. walk time</p>
          <p className="text-sm font-semibold text-white mt-0.5">{fmt_time(result.duration_s)}</p>
        </div>
      </div>
      <RiskBar result={result} />
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-gray-800/60 rounded-lg px-3 py-2">
          <p className="text-gray-400">Peak block</p>
          <p className="font-medium text-white mt-0.5">{result.max_segment_risk_label}</p>
        </div>
        <div className="bg-gray-800/60 rounded-lg px-3 py-2">
          <p className="text-gray-400">Elevated blocks</p>
          <p className="font-medium text-white mt-0.5">{result.elevated_segment_count}</p>
        </div>
      </div>
      <p className="text-xs text-gray-500 leading-relaxed">
        Estimates are based on historical reports near this route. Conditions may differ in real time.
      </p>
    </div>
  );
}
