"use client";
import type { RouteMode, RoutesResponse } from "@/types";

const MODES: Array<{ mode: RouteMode; label: string; color: string }> = [
  { mode: "safest", label: "Lower risk", color: "text-green-400" },
  { mode: "fastest", label: "Fastest", color: "text-blue-400" },
  { mode: "balanced", label: "Balanced", color: "text-purple-400" },
];

interface Props {
  selectedMode: RouteMode;
  routes: RoutesResponse | null;
  onModeChange: (mode: RouteMode) => void;
}

export default function RouteTypeToggle({ selectedMode, routes, onModeChange }: Props) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {MODES.map(({ mode, label, color }) => {
        const result = routes?.[mode];
        const active = mode === selectedMode;
        return (
          <button
            key={mode}
            onClick={() => onModeChange(mode)}
            className={`rounded-lg px-2 py-2 text-xs font-medium transition-all text-left ${
              active
                ? "bg-gray-700 ring-1 ring-white/20"
                : "bg-gray-800/60 hover:bg-gray-750"
            }`}
          >
            <span className={`block ${color} font-semibold`}>{label}</span>
            {result && (
              <span className="block text-gray-400 mt-0.5">
                {result.risk_label}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
