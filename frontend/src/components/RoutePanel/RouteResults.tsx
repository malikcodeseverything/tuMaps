"use client";
import { Loader2, AlertCircle, Navigation } from "lucide-react";
import type { RouteMode, RoutesResponse } from "@/types";

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

function RiskBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color =
    score < 0.25 ? "bg-green-500" : score < 0.5 ? "bg-yellow-400" : score < 0.75 ? "bg-orange-400" : "bg-red-500";
  const label =
    score < 0.25 ? "Low" : score < 0.5 ? "Moderate" : score < 0.75 ? "Elevated" : "High";

  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-400">Risk level</span>
        <span className="text-white font-medium">{label}</span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-700 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
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
      <RiskBar score={result.risk_score} />
      <p className="text-xs text-gray-500 leading-relaxed">
        Risk reflects historical incident frequency near this route. Conditions may differ in real time.
      </p>
    </div>
  );
}
