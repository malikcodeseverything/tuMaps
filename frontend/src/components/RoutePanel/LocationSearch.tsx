"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { X, Crosshair } from "lucide-react";
import { reverseGeocode } from "@/services/api";
import { usePlaceCombobox } from "@/hooks/usePlaceSearch";
import SuggestionList from "@/components/Search/SuggestionList";
import type { Place } from "@/types";

interface Props {
  label: string;
  dotColor: string;
  placeholder: string;
  value: [number, number] | null;
  /** Name to show for `value` when it came from elsewhere (the map search bar). */
  placeName?: string | null;
  isPickingFromMap: boolean;
  onSelect: (pt: [number, number], name: string) => void;
  onPickFromMap: () => void;
  onClear: () => void;
}

export default function LocationSearch({
  label,
  dotColor,
  placeholder,
  value,
  placeName,
  isPickingFromMap,
  onSelect,
  onPickFromMap,
  onClear,
}: Props) {
  const [selected, setSelected] = useState<string>("");
  // Typing a new search over an existing selection; blur without a pick keeps the old one.
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Which point the current label describes, so a new map pick always
  // replaces the label (previously a second pick kept the old text).
  const labelledPoint = useRef<string>("");

  const handlePick = useCallback(
    (place: Place) => {
      labelledPoint.current = `${place.center[0]},${place.center[1]}`;
      setSelected(place.name);
      setEditing(false);
      onSelect(place.center, place.name);
    },
    [onSelect],
  );

  const box = usePlaceCombobox(handlePick);

  useEffect(() => {
    if (!value) {
      setSelected("");
      labelledPoint.current = "";
      return;
    }
    const key = `${value[0]},${value[1]}`;
    if (labelledPoint.current === key) return; // label came from a search suggestion
    labelledPoint.current = key;

    if (placeName) {
      setSelected(placeName);
      return;
    }

    // Show coordinates immediately, then swap in the nearest place name.
    setSelected(`${value[1].toFixed(5)}, ${value[0].toFixed(5)}`);
    let cancelled = false;
    reverseGeocode(value).then((name) => {
      if (!cancelled && name && labelledPoint.current === key) setSelected(name);
    });
    return () => {
      cancelled = true;
    };
  }, [value, placeName]);

  const startEditing = () => {
    setEditing(true);
    box.setQuery("");
    // Focus once the input has rendered.
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleClear = () => {
    labelledPoint.current = "";
    setSelected("");
    setEditing(false);
    box.setQuery("");
    onClear();
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const showInput = !selected || editing;

  return (
    <div className="relative">
      <div
        className={`flex items-center gap-2 rounded-lg px-3 py-2 border transition-colors ${
          isPickingFromMap
            ? "bg-blue-950/60 border-blue-500/60"
            : "bg-gray-800/80 border-gray-700/50 focus-within:border-gray-400"
        }`}
      >
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
        <span className="text-gray-400 w-8 flex-shrink-0 text-xs">{label}</span>

        {showInput ? (
          <input
            ref={inputRef}
            {...box.inputProps}
            onBlur={() => {
              box.inputProps.onBlur();
              setEditing(false);
            }}
            aria-label={`${label} location`}
            placeholder={isPickingFromMap ? "Click on the map…" : placeholder}
            // 16px on phones stops iOS from zooming the page when the box is focused.
            className="flex-1 bg-transparent outline-none placeholder-gray-500 text-white text-base md:text-sm min-w-0"
            disabled={isPickingFromMap}
          />
        ) : (
          <button
            type="button"
            onClick={startEditing}
            title="Search for a different place"
            className="flex-1 min-w-0 text-left text-white truncate text-base md:text-sm hover:text-gray-200"
          >
            {selected}
          </button>
        )}

        <button
          type="button"
          onClick={onPickFromMap}
          title={isPickingFromMap ? "Cancel map selection" : "Pick from map"}
          aria-label={isPickingFromMap ? "Cancel map selection" : "Pick from map"}
          className={`p-0.5 rounded transition-colors ${
            isPickingFromMap ? "text-blue-400" : "text-gray-500 hover:text-gray-300"
          }`}
        >
          <Crosshair size={14} />
        </button>

        {(selected || box.query) && (
          <button
            type="button"
            onClick={handleClear}
            aria-label={`Clear ${label.toLowerCase()} location`}
            className="text-gray-500 hover:text-gray-300 transition-colors"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {showInput && <SuggestionList box={box} className="top-full mt-1 left-0 right-0" />}
    </div>
  );
}
