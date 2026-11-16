"use client";
import { Building2, CircleParking, LoaderCircle, MapPin, TrainFront } from "lucide-react";
import type { PlaceCombobox } from "@/hooks/usePlaceSearch";
import type { Place } from "@/types";

function PlaceIcon({ place }: { place: Place }) {
  const cls = "flex-shrink-0 mt-0.5";
  if (place.source === "mapbox") return <MapPin size={14} className={`${cls} text-gray-400`} />;
  if (place.detail.startsWith("SEPTA")) return <TrainFront size={14} className={`${cls} text-sky-400`} />;
  if (place.detail === "Parking") return <CircleParking size={14} className={`${cls} text-gray-400`} />;
  return <Building2 size={14} className={`${cls} text-rose-400`} />;
}

interface Props {
  box: PlaceCombobox;
  /** Positioning classes, e.g. "top-full mt-1 left-0 right-0". */
  className?: string;
}

/** Dropdown under a search box: popular places, results, or a status line. */
export default function SuggestionList({ box, className = "" }: Props) {
  const { open, results, status, isQuickPicks, activeIndex, optionId, listId, pick } = box;
  if (!open) return null;

  const empty = results.length === 0;
  if (empty && status === "idle") return null;

  return (
    <div
      className={`absolute z-50 bg-gray-800 border border-gray-700 rounded-xl overflow-hidden shadow-2xl ${className}`}
      // Keep focus in the input while clicking, so blur doesn't close the list first.
      onMouseDown={(e) => e.preventDefault()}
    >
      {isQuickPicks && (
        <p className="px-3 pt-2.5 pb-1 text-[11px] font-medium uppercase tracking-wider text-gray-500">
          Popular on campus
        </p>
      )}

      <ul id={listId} role="listbox" className="max-h-80 overflow-y-auto py-1">
        {results.map((place, i) => (
          <li
            key={place.id}
            id={optionId(i)}
            role="option"
            aria-selected={i === activeIndex}
            onClick={() => pick(place)}
            className={`flex items-start gap-2.5 px-3 py-2 cursor-pointer transition-colors ${
              i === activeIndex ? "bg-gray-700" : "hover:bg-gray-700/60"
            }`}
          >
            <PlaceIcon place={place} />
            <span className="min-w-0">
              <span className="block text-sm text-gray-100 leading-snug truncate">{place.name}</span>
              {place.detail && (
                <span className="block text-xs text-gray-400 leading-snug truncate">{place.detail}</span>
              )}
            </span>
          </li>
        ))}
      </ul>

      {status === "searching" && (
        <p role="status" className="flex items-center gap-2 px-3 py-2 text-xs text-gray-400 border-t border-gray-700/60">
          <LoaderCircle size={12} className="animate-spin" />
          {empty ? "Searching…" : "Searching addresses…"}
        </p>
      )}

      {status === "done" && empty && (
        <div role="status" className="px-3 py-3 text-xs">
          <p className="text-gray-300">No matching places nearby.</p>
          <p className="text-gray-500 mt-0.5">TuMaps covers about 2 km around Main Campus.</p>
        </div>
      )}
    </div>
  );
}
