"use client";
import { useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { usePlaceCombobox } from "@/hooks/usePlaceSearch";
import SuggestionList from "./SuggestionList";
import type { Place } from "@/types";

interface Props {
  place: Place | null;
  onPlaceChange: (place: Place | null) => void;
  onDirectionsFrom: (place: Place) => void;
  onDirectionsTo: (place: Place) => void;
  className?: string;
}

/**
 * Google Maps style search: find a place, the map flies to it, and a card
 * offers to start or end a route there.
 */
export default function MapSearch({
  place,
  onPlaceChange,
  onDirectionsFrom,
  onDirectionsTo,
  className = "",
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Typing a new search while a place is shown; blur without a pick keeps it.
  const [editing, setEditing] = useState(false);

  const box = usePlaceCombobox((picked) => {
    setEditing(false);
    inputRef.current?.blur();
    onPlaceChange(picked);
  });

  const showInput = !place || editing;

  const startEditing = () => {
    setEditing(true);
    box.setQuery("");
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const clear = () => {
    setEditing(false);
    box.setQuery("");
    onPlaceChange(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <div className={className}>
      <div className="relative">
        <div className="flex items-center gap-2.5 rounded-xl bg-gray-900/95 backdrop-blur-sm border border-gray-700/50 shadow-2xl px-3.5 py-2.5 focus-within:border-gray-400 transition-colors">
          <Search size={16} className="text-gray-400 flex-shrink-0" />

          {showInput ? (
            <input
              ref={inputRef}
              {...box.inputProps}
              onBlur={() => {
                box.inputProps.onBlur();
                setEditing(false);
              }}
              type="search"
              aria-label="Search places"
              placeholder="Search places near Temple"
              // 16px on phones stops iOS from zooming the page when the box is focused.
              className="flex-1 min-w-0 bg-transparent outline-none text-white placeholder-gray-500 text-base md:text-sm [&::-webkit-search-cancel-button]:hidden"
            />
          ) : (
            <button
              type="button"
              onClick={startEditing}
              title="Search for a different place"
              className="flex-1 min-w-0 text-left text-white truncate text-base md:text-sm"
            >
              {place.name}
            </button>
          )}

          {(place || box.query) && (
            <button
              type="button"
              onClick={clear}
              aria-label="Clear search"
              className="text-gray-500 hover:text-gray-300 transition-colors flex-shrink-0"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {showInput && <SuggestionList box={box} className="top-full mt-1.5 left-0 right-0" />}
      </div>

      {place && !editing && (
        <div className="mt-2 rounded-xl bg-gray-900/95 backdrop-blur-sm border border-gray-700/50 shadow-2xl p-3.5">
          <p className="text-sm font-semibold text-white leading-snug">{place.name}</p>
          {place.detail && <p className="text-xs text-gray-400 mt-0.5 leading-snug">{place.detail}</p>}
          <div className="grid grid-cols-2 gap-2 mt-3">
            <button
              type="button"
              onClick={() => onDirectionsFrom(place)}
              aria-label={`Start a route at ${place.name}`}
              className="flex items-center justify-center gap-2 rounded-lg border border-gray-600 px-3 py-2 text-xs font-medium text-gray-100 hover:bg-gray-800 transition-colors"
            >
              <span className="w-2 h-2 rounded-full bg-green-500" />
              From here
            </button>
            <button
              type="button"
              onClick={() => onDirectionsTo(place)}
              aria-label={`End a route at ${place.name}`}
              className="flex items-center justify-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-gray-900 hover:bg-gray-200 transition-colors"
            >
              <span className="w-2 h-2 rounded-full bg-red-500" />
              To here
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
