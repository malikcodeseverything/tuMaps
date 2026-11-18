"use client";
import dynamic from "next/dynamic";
import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import RoutePanel from "@/components/RoutePanel";
import MapSearch from "@/components/Search/MapSearch";
import { useRoute } from "@/hooks/useRoute";
import type { Place, RouteMode, SelectingMode } from "@/types";
import { bearingBetween, metresBetween, progressAlong } from "@/lib/navigation";
import { loadTrip, saveTrip } from "@/lib/tripStore";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

const LOCATION_BLOCKED =
  "Location is blocked for this site. On iPhone: Settings > Privacy & Security > Location Services > Safari Websites > While Using. In a desktop browser: allow location for this site in the address bar.";
const LOCATION_OFF =
  "Your device isn't sharing a location. Check that Location Services is on for your browser in your phone or computer settings.";

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

  // Direction of travel while navigating. Walking at a steady pace, GPS course
  // (or the bearing between fixes further apart than their accuracy) is the
  // truth. Slower than that, or standing still, the phone's compass is.
  const [heading, setHeading] = useState<number | null>(null);
  const [compassNeedsTap, setCompassNeedsTap] = useState(false);
  const anchorFix = useRef<[number, number] | null>(null);
  const courseAt = useRef(0);
  const lastCompass = useRef<{ at: number; value: number } | null>(null);

  // Why there is no position yet, shown in the panel instead of waiting forever.
  const [locationIssue, setLocationIssue] = useState<string | null>(null);

  useEffect(() => {
    if (!navigating) return;
    if (!("geolocation" in navigator)) {
      setLocationIssue("This browser can't share your location.");
      return;
    }
    anchorFix.current = null;
    setLocationIssue(null);
    let id = 0;
    let retry = 0;
    let gotFix = false;
    const onFix = ({ coords }: GeolocationPosition) => {
      gotFix = true;
      setLocationIssue(null);
      handleFix(coords);
    };
    const onError = (err: GeolocationPositionError) => {
      if (err.code === err.PERMISSION_DENIED) {
        setLocationIssue(LOCATION_BLOCKED);
        return;
      }
      // Unavailable or timed out (common indoors): say so and keep trying.
      if (!gotFix) setLocationIssue(err.code === err.POSITION_UNAVAILABLE ? LOCATION_OFF : "Still looking for a GPS signal…");
      navigator.geolocation.clearWatch(id);
      retry = window.setTimeout(start, 3000);
    };
    const start = () => {
      id = navigator.geolocation.watchPosition(onFix, onError, {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 15000,
      });
    };
    // A quick, possibly cached fix so the arrow appears right away.
    navigator.geolocation.getCurrentPosition(onFix, () => {}, { maximumAge: 30000, timeout: 8000 });
    start();
    return () => {
      navigator.geolocation.clearWatch(id);
      clearTimeout(retry);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigating]);

  // Uses only refs and state setters, so the copy captured by the effect is fine.
  function handleFix(coords: GeolocationCoordinates) {
    const pt: [number, number] = [coords.longitude, coords.latitude];
    setUserPos(pt);
    const course = coords.heading;
    if (course !== null && Number.isFinite(course) && (coords.speed ?? 0) >= 0.8) {
      courseAt.current = Date.now();
      setHeading(course);
      anchorFix.current = pt;
      return;
    }
    if (!anchorFix.current) {
      anchorFix.current = pt;
      return;
    }
    // Ignore jitter: only count movement larger than the fix's accuracy.
    if (metresBetween(anchorFix.current, pt) > Math.max(8, (coords.accuracy ?? 10) * 1.5)) {
      courseAt.current = Date.now();
      setHeading(bearingBetween(anchorFix.current, pt));
      anchorFix.current = pt;
    }
  }


  useEffect(() => {
    if (!navigating) return;
    const onOrientation = (e: DeviceOrientationEvent) => {
      const ios = (e as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading;
      let compass = typeof ios === "number" && ios >= 0 ? ios : e.absolute && e.alpha !== null ? 360 - e.alpha : null;
      if (compass === null) return;
      // Readings are relative to the top of the device; correct for landscape.
      compass = (compass + (screen.orientation?.angle ?? 0) + 360) % 360;
      // A fresh GPS course beats the compass while actually walking.
      if (Date.now() - courseAt.current < 4000) return;
      const now = Date.now();
      const prev = lastCompass.current;
      const turned = prev ? Math.abs(((compass - prev.value + 540) % 360) - 180) : 360;
      if (prev && (now - prev.at < 60 || turned < 2)) return;
      lastCompass.current = { at: now, value: compass };
      setCompassNeedsTap(false);
      setHeading(compass);
    };
    const type = "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation";
    window.addEventListener(type, onOrientation as EventListener);
    return () => window.removeEventListener(type, onOrientation as EventListener);
  }, [navigating]);

  // iPhones share the compass only after a tap grants it, so a resumed
  // navigation (after a refresh) offers a button for that.
  const enableCompass = useCallback(async () => {
    const D = (typeof DeviceOrientationEvent === "undefined" ? undefined : DeviceOrientationEvent) as
      | { requestPermission?: () => Promise<string> }
      | undefined;
    if (typeof D?.requestPermission !== "function") return true;
    try {
      const ok = (await D.requestPermission()) === "granted";
      setCompassNeedsTap(!ok);
      return ok;
    } catch {
      setCompassNeedsTap(true);
      return false;
    }
  }, []);

  // Resume a trip after a refresh, and keep the saved copy current.
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    const trip = loadTrip();
    if (trip) {
      setOrigin(trip.origin);
      setOriginName(trip.originName);
      setDestination(trip.destination);
      setDestinationName(trip.destinationName);
      setSelectedMode(trip.mode);
      if (trip.navigating) setNavigating(true);
    }
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    saveTrip(
      origin && destination
        ? { origin, destination, originName, destinationName, mode: selectedMode, navigating }
        : null,
    );
  }, [restored, origin, destination, originName, destinationName, selectedMode, navigating]);

  // After a refresh an iPhone needs a tap before the compass works again.
  useEffect(() => {
    if (!navigating) return;
    const t = setTimeout(() => {
      const D = (typeof DeviceOrientationEvent === "undefined" ? undefined : DeviceOrientationEvent) as
        | { requestPermission?: () => Promise<string> }
        | undefined;
      if (!lastCompass.current && typeof D?.requestPermission === "function") setCompassNeedsTap(true);
    }, 2500);
    return () => clearTimeout(t);
  }, [navigating]);

  const startNavigation = useCallback(async () => {
    await enableCompass();
    setHeading(null);
    setNavigating(true);
  }, [enableCompass]);

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
  // Waits for the saved trip to load, or it would cancel a resumed navigation.
  useEffect(() => {
    if (restored && (!origin || !destination)) setNavigating(false);
  }, [restored, origin, destination]);

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
            ? LOCATION_BLOCKED
            : err.code === err.POSITION_UNAVAILABLE
              ? LOCATION_OFF
              : "Couldn't get a GPS signal in time. Try again, ideally near a window or outside.",
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
        compassNeedsTap={compassNeedsTap}
        locationIssue={locationIssue}
        onEnableCompass={enableCompass}
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
