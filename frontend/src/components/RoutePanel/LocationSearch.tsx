"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { MapPin, X, Crosshair } from "lucide-react";
import { geocode } from "@/services/api";
import type { GeocodeSuggestion } from "@/types";

interface Props {
  label: string;
  dotColor: string;
  placeholder: string;
  value: [number, number] | null;
  isPickingFromMap: boolean;
  onSelect: (pt: [number, number]) => void;
  onPickFromMap: () => void;
  onClear: () => void;
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function LocationSearch({
  label,
  dotColor,
  placeholder,
  value,
  isPickingFromMap,
  onSelect,
  onPickFromMap,
  onClear,
}: Props) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<GeocodeSuggestion[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [open, setOpen] = useState(false);
  const debouncedQuery = useDebounce(query, 300);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!value) {
      setSelected("");
      return;
    }
    if (!selected) {
      setSelected(`${value[1].toFixed(5)}, ${value[0].toFixed(5)}`);
    }
  }, [value]);

  useEffect(() => {
    if (!debouncedQuery || debouncedQuery === selected) {
      setSuggestions([]);
      return;
    }
    geocode(debouncedQuery).then((results) => {
      setSuggestions(results);
      setOpen(results.length > 0);
    });
  }, [debouncedQuery]);

  const handleSelect = useCallback(
    (s: GeocodeSuggestion) => {
      setSelected(s.place_name);
      setQuery("");
      setSuggestions([]);
      setOpen(false);
      onSelect(s.center);
    },
    [onSelect],
  );

  const handleClear = useCallback(() => {
    setSelected("");
    setQuery("");
    setSuggestions([]);
    setOpen(false);
    onClear();
    inputRef.current?.focus();
  }, [onClear]);

  return (
    <div className="relative">
      <div
        className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm border transition-colors ${
          isPickingFromMap
            ? "bg-blue-950/60 border-blue-500/60"
            : "bg-gray-800/80 border-gray-700/50 focus-within:border-gray-500"
        }`}
      >
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
        <span className="text-gray-400 w-6 flex-shrink-0 text-xs">{label}</span>

        {selected ? (
          <span className="flex-1 text-white truncate text-xs">{selected}</span>
        ) : (
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => suggestions.length > 0 && setOpen(true)}
            placeholder={isPickingFromMap ? "Click on the map…" : placeholder}
            className="flex-1 bg-transparent outline-none placeholder-gray-500 text-white text-xs min-w-0"
            disabled={isPickingFromMap}
          />
        )}

        <button
          onClick={onPickFromMap}
          title={isPickingFromMap ? "Cancel map selection" : "Pick from map"}
          className={`p-0.5 rounded transition-colors ${
            isPickingFromMap ? "text-blue-400" : "text-gray-500 hover:text-gray-300"
          }`}
        >
          <Crosshair size={13} />
        </button>

        {(selected || query) && (
          <button onClick={handleClear} className="text-gray-500 hover:text-gray-300 transition-colors">
            <X size={13} />
          </button>
        )}
      </div>

      {open && suggestions.length > 0 && (
        <ul className="absolute top-full mt-1 left-0 right-0 z-50 bg-gray-800 border border-gray-700 rounded-lg overflow-hidden shadow-xl">
          {suggestions.map((s) => (
            <li
              key={s.id}
              onMouseDown={() => handleSelect(s)}
              className="flex items-start gap-2 px-3 py-2 cursor-pointer hover:bg-gray-700 text-xs"
            >
              <MapPin size={11} className="text-gray-400 flex-shrink-0 mt-0.5" />
              <span className="text-gray-200 leading-tight">{s.place_name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
