"use client";
import dynamic from "next/dynamic";
import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import RoutePanel from "@/components/RoutePanel";
import MapSearch from "@/components/Search/MapSearch";
import { useRoute } from "@/hooks/useRoute";
import type { Place, RouteMode, SelectingMode } from "@/types";
import { bearingBetween, metresBetween, progressAlong } from "@/lib/navigation";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

export default function MapPage() {
  const [origin, setOrigin] = useState<[number, number] | null>(null);
  const [destination, setDestination] = useState<[number, number] | null>(null);
  // Names for points set from the search bar, so the From/To boxes show
  // "Charles Library" instead of a reverse-geocoded street address.
  const [originName, setOriginName] = useState<string | null>(null);
  const [destinationName, setDestinationName] = useState<string | null>(null);
  const [selectedMode, setSelectedMode] = useState<RouteMode>("balanced");
  const [selectingMode, setSelectingMode] = useState<SelectingMode>(null);
  const [searchedPlace, setSearchedPlace] = useState<Place | null>(null);

  const { routes, incidents, riskSegments, dataThrough, isLoading, isWaking, isMapWaking, error } = useRoute(origin, destination);

  // Live position from the map's location control, and walking navigation.
  const [userPos, setUserPos] = useState<[number, number] | null>(null);
  const [navigating, setNavigating] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const activeRoute = routes?.[selectedMode] ?? null;
  const progress = useMemo(
    () =>
      navigating && userPos && activeRoute
        ? progressAlong(activeRoute.geometry.coordinates as [number, number][], userPos)
        : null,
    [navigating, userPos, activeRoute],
  );

  // Direction of travel while navigating. GPS heading or the bearing between
  // recent fixes when moving; the phone's compass when standing still.
  const [heading, setHeading] = useState<number | null>(null);
  const lastFix = useRef<[number, number] | null>(null);
  const moving = useRef(false);

  useEffect(() => {
    if (!navigating || !("geolocation" in navigator)) return;
    lastFix.current = null;
    const id = navigator.geolocation.watchPosition(
      ({ coords }) => {
        const pt: [number, number] = [coords.longitude, coords.latitude];
        setUserPos(pt);
        const gpsHeading = coords.heading;
        if (gpsHeading !== null && !Number.isNaN(gpsHeading) && (coords.speed ?? 0) > 0.5) {
          moving.current = true;
          setHeading(gpsHeading);
          lastFix.current = pt;
          return;
        }
        if (!lastFix.current) {
          lastFix.current = pt;
        } else if (metresBetween(lastFix.current, pt) > 4) {
          moving.current = true;
          setHeading(bearingBetween(lastFix.current, pt));
          lastFix.current = pt;
        } else {
          moving.current = false;
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 1000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [navigating]);

  useEffect(() => {
    if (!navigating) return;
    const onOrientation = (e: DeviceOrientationEvent) => {
      if (moving.current) return;
      const ios = (e as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading;
      const compass = typeof ios === "number" ? ios : e.absolute && e.alpha !== null ? (360 - e.alpha) % 360 : null;
      if (compass !== null) setHeading(compass);
    };
    const type = "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation";
    window.addEventListener(type, onOrientation as EventListener);
    return () => window.removeEventListener(type, onOrientation as EventListener);
  }, [navigating]);

  const startNavigation = useCallback(async () => {
    // iPhones only share the compass after the user allows it from a tap.
    const D = (typeof DeviceOrientationEvent === "undefined" ? undefined : DeviceOrientationEvent) as
      | { requestPermission?: () => Promise<string> }
      | undefined;
    if (typeof D?.requestPermission === "function") {
      try { await D.requestPermission(); } catch { /* compass stays off; GPS heading still works */ }
    }
    setHeading(null);
    setNavigating(true);
  }, []);

  // Keep the screen awake while navigating, where the browser allows it.
  useEffect(() => {
    if (!navigating || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    navigator.wakeLock.request("screen").then((l) => { lock = l; }).catch(() => {});
    return () => { lock?.release().catch(() => {}); };
  }, [navigating]);

  const changeOrigin = useCallback((pt: [number, number] | null, name: string | null = null) => {
    setOrigin(pt);
    setOriginName(name);
  }, []);

  const changeDestination = useCallback((pt: [number, number] | null, name: string | null = null) => {
    setDestination(pt);
    setDestinationName(name);
  }, []);

  // A new start or end point ends any navigation in progress.
  useEffect(() => {
    if (!origin || !destination) setNavigating(false);
  }, [origin, destination]);

  const useMyLocation = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setLocationError("This browser can't share your location.");
      return;
    }
    setLocating(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const pt: [number, number] = [coords.longitude, coords.latitude];
        setUserPos(pt);
        changeOrigin(pt, "My location");
        setLocating(false);
      },
      (err) => {
        setLocationError(
          err.code === err.PERMISSION_DENIED
            ? "Location is blocked. Allow it in your browser settings."
            : "Couldn't find your location. Try again.",
        );
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, [changeOrigin]);

  const rerouteFromHere = useCallback(() => {
    if (userPos) changeOrigin(userPos, "My location");
  }, [userPos, changeOrigin]);

  const handleMapClick = useCallback(
    (lngLat: [number, number]) => {
      if (selectingMode === "origin") {
        changeOrigin(lngLat);
        setSelectingMode(null);
      } else if (selectingMode === "destination") {
        changeDestination(lngLat);
        setSelectingMode(null);
      }
    },
    [selectingMode, changeOrigin, changeDestination],
  );

  return (
    <div className="relative w-full h-dvh overflow-hidden">
      <MapView
        routes={routes}
        selectedMode={selectedMode}
        incidents={incidents}
        riskSegments={riskSegments}
        origin={origin}
        destination={destination}
        selectingMode={selectingMode}
        searchedPlace={searchedPlace}
        navigating={navigating}
        userPos={userPos}
        heading={heading}
        onMapClick={handleMapClick}
        onUserLocation={setUserPos}
      />
      <RoutePanel
        dataThrough={dataThrough}
        origin={origin}
        destination={destination}
        originName={originName}
        destinationName={destinationName}
        selectedMode={selectedMode}
        routes={routes}
        isLoading={isLoading}
        isWaking={isWaking}
        isMapWaking={isMapWaking}
        error={error}
        selectingMode={selectingMode}
        onOriginChange={changeOrigin}
        onDestinationChange={changeDestination}
        onModeChange={setSelectedMode}
        onSelectingModeChange={setSelectingMode}
        navigating={navigating}
        progress={progress}
        hasUserPos={!!userPos}
        locating={locating}
        locationError={locationError}
        onStartNav={startNavigation}
        onEndNav={() => setNavigating(false)}
        onReroute={rerouteFromHere}
        onUseMyLocation={useMyLocation}
      />
      {/* Phones and tablets: full width above the route panel (leaving room for
          the zoom buttons). Desktop: beside the route panel. */}
      <MapSearch
        className="absolute z-20 top-4 left-4 right-14 lg:left-[22rem] lg:right-auto lg:w-96"
        place={searchedPlace}
        onPlaceChange={setSearchedPlace}
        onDirectionsFrom={(p) => {
          changeOrigin(p.center, p.name);
          setSearchedPlace(null);
        }}
        onDirectionsTo={(p) => {
          changeDestination(p.center, p.name);
          setSearchedPlace(null);
        }}
      />
    </div>
  );
}
