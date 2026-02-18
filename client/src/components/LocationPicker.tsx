import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MapPin, Loader2, Navigation, AlertCircle, Search, Map } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

// Lazy-load the heavy Leaflet map so it doesn't bloat the initial bundle
const MapPicker = lazy(() =>
  import("./MapPicker").then((m) => ({ default: m.MapPicker }))
);

interface LocationData {
  address: string;
  latitude: string;
  longitude: string;
}

interface LocationPickerProps {
  value: string;
  onChange: (location: string) => void;
  onLocationFetched?: (data: LocationData) => void;
  placeholder?: string;
}

interface PhotonFeature {
  properties: {
    name?: string;
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    postcode?: string;
  };
  geometry: {
    coordinates: [number, number]; // [lng, lat]
  };
}

interface NominatimResponse {
  display_name: string;
  address: {
    amenity?: string;
    road?: string;
    suburb?: string;
    city?: string;
    state?: string;
    country?: string;
  };
}

type Tab = "search" | "map" | "gps";

// UAE bounding box for Photon to bias results
const UAE_BBOX = "51.5,22.6,56.4,26.1";

// Required by Nominatim ToS: https://operations.osmfoundation.org/policies/nominatim/
const NOMINATIM_HEADERS = {
  "Accept-Language": "en",
  "User-Agent": "IftarInUAE/1.0 (https://iftarinuae.com)",
};

/** Validate that a coordinate pair is a real, finite number in a sane global range */
function isValidCoord(lat: number, lng: number): boolean {
  return (
    isFinite(lat) && isFinite(lng) &&
    lat >= -90 && lat <= 90 &&
    lng >= -180 && lng <= 180
  );
}

/** Truncate and strip control characters from external API strings */
function sanitiseAddress(raw: string): string {
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\x00-\x1F\x7F]/g, "").trim().slice(0, 300);
}

function buildReadableAddress(props: PhotonFeature["properties"]): string {
  const parts: string[] = [];
  if (props.name) parts.push(props.name);
  if (props.street) parts.push(props.street);
  if (props.city) parts.push(props.city);
  if (props.state) parts.push(props.state);
  return sanitiseAddress(parts.join(", ") || "Unknown location");
}

export function LocationPicker({
  value,
  onChange,
  onLocationFetched,
  placeholder = "e.g. Downtown Dubai, near Burj Khalifa",
}: LocationPickerProps) {
  const [activeTab, setActiveTab] = useState<Tab>("search");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search tab state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PhotonFeature[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Map tab state
  const [mapLat, setMapLat] = useState<number | undefined>();
  const [mapLng, setMapLng] = useState<number | undefined>();
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);

  // Confirmed location display
  const [confirmedAddress, setConfirmedAddress] = useState<string>("");

  const notifyLocation = (data: LocationData) => {
    onChange(data.address);
    setConfirmedAddress(data.address);
    onLocationFetched?.(data);
    setError(null);
  };

  // ── Search tab: Photon autocomplete ──────────────────────────────────────
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    searchDebounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(searchQuery)}&limit=5&bbox=${UAE_BBOX}&lang=en`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("Search failed");
        const data = await res.json();
        setSearchResults(data.features ?? []);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchQuery]);

  const handleSearchSelect = (feature: PhotonFeature) => {
    const [lng, lat] = feature.geometry.coordinates;
    if (!isValidCoord(lat, lng)) return; // Discard malformed API responses
    const address = buildReadableAddress(feature.properties);
    setSearchQuery(address);
    setSearchResults([]);
    notifyLocation({ address, latitude: lat.toString(), longitude: lng.toString() });
  };

  // ── Map tab: Nominatim reverse geocode on pin drop ───────────────────────
  const handlePinDrop = async (lat: number, lng: number) => {
    setMapLat(lat);
    setMapLng(lng);
    setIsReverseGeocoding(true);
    setError(null);

    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
        { headers: NOMINATIM_HEADERS }
      );
      if (!res.ok) throw new Error("Reverse geocode failed");
      const data: NominatimResponse = await res.json();

      const parts: string[] = [];
      if (data.address.amenity) parts.push(data.address.amenity);
      if (data.address.road) parts.push(data.address.road);
      if (data.address.suburb) parts.push(data.address.suburb);
      if (data.address.city) parts.push(data.address.city);
      if (data.address.state) parts.push(data.address.state);

      const address = sanitiseAddress(parts.length > 0 ? parts.join(", ") : data.display_name);
      notifyLocation({ address, latitude: lat.toString(), longitude: lng.toString() });
    } catch {
      // Still save coords even if reverse geocode fails — coords are already validated
      notifyLocation({
        address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
        latitude: lat.toString(),
        longitude: lng.toString(),
      });
    } finally {
      setIsReverseGeocoding(false);
    }
  };

  // ── GPS tab: existing logic ───────────────────────────────────────────────
  const fetchGpsLocation = async () => {
    setIsLoading(true);
    setError(null);

    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser");
      setIsLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
            { headers: NOMINATIM_HEADERS }
          );
          if (!res.ok) throw new Error("Failed to fetch address");
          const data: NominatimResponse = await res.json();

          const parts: string[] = [];
          if (data.address.amenity) parts.push(data.address.amenity);
          if (data.address.road) parts.push(data.address.road);
          if (data.address.suburb) parts.push(data.address.suburb);
          if (data.address.city) parts.push(data.address.city);
          if (data.address.state) parts.push(data.address.state);

          const address = sanitiseAddress(parts.length > 0 ? parts.join(", ") : data.display_name);
          notifyLocation({ address, latitude: latitude.toString(), longitude: longitude.toString() });

          // Sync map pin if user switches to map tab
          setMapLat(latitude);
          setMapLng(longitude);
        } catch {
          setError("Failed to get address. Please try again.");
        } finally {
          setIsLoading(false);
        }
      },
      (err) => {
        setIsLoading(false);
        switch (err.code) {
          case err.PERMISSION_DENIED:
            setError("Location permission denied. Please enable it in your browser settings.");
            break;
          case err.POSITION_UNAVAILABLE:
            setError("Location unavailable. Please try again.");
            break;
          case err.TIMEOUT:
            setError("Location request timed out. Please try again.");
            break;
          default:
            setError("An error occurred getting your location.");
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "search", label: "Search", icon: <Search className="w-3.5 h-3.5" /> },
    { id: "map", label: "Map Pin", icon: <Map className="w-3.5 h-3.5" /> },
    { id: "gps", label: "My Location", icon: <Navigation className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="space-y-3">
      {/* Tab bar */}
      <div className="flex gap-1 p-1 bg-secondary/40 rounded-xl">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => { setActiveTab(tab.id); setError(null); }}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium transition-all",
              activeTab === tab.id
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        {activeTab === "search" && (
          <motion.div
            key="search"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="relative"
          >
            <Search className="absolute left-3 top-3.5 w-4 h-4 text-muted-foreground z-10" />
            <Input
              placeholder={placeholder}
              className="pl-9 h-12 rounded-xl"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoComplete="off"
            />
            {isSearching && (
              <Loader2 className="absolute right-3 top-3.5 w-4 h-4 animate-spin text-muted-foreground" />
            )}

            {/* Autocomplete dropdown */}
            <AnimatePresence>
              {searchResults.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="absolute z-50 w-full mt-1 bg-background border border-border rounded-xl shadow-lg overflow-hidden"
                >
                  {searchResults.map((feature, i) => {
                    const address = buildReadableAddress(feature.properties);
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleSearchSelect(feature)}
                        className="w-full flex items-start gap-2.5 px-4 py-3 text-left hover:bg-secondary/50 transition-colors border-b border-border/50 last:border-0"
                      >
                        <MapPin className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                        <span className="text-sm leading-snug">{address}</span>
                      </button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {activeTab === "map" && (
          <motion.div
            key="map"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="space-y-2"
          >
            <p className="text-xs text-muted-foreground px-1">
              Click anywhere on the map to drop a pin. You can drag the pin to adjust.
            </p>
            <Suspense
              fallback={
                <div className="w-full h-[300px] rounded-xl bg-secondary/30 flex items-center justify-center border border-border">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              }
            >
              <MapPicker
                onPinDrop={handlePinDrop}
                initialLat={mapLat}
                initialLng={mapLng}
              />
            </Suspense>
            {isReverseGeocoding && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Getting address…
              </div>
            )}
          </motion.div>
        )}

        {activeTab === "gps" && (
          <motion.div
            key="gps"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
          >
            <Button
              type="button"
              variant="secondary"
              className="w-full h-12 rounded-xl gap-2 font-medium"
              onClick={fetchGpsLocation}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Fetching your location…
                </>
              ) : (
                <>
                  <Navigation className="w-4 h-4" />
                  Use My Current Location
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground text-center mt-2">
              Your browser will ask for permission to access your location.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirmed location pill */}
      <AnimatePresence>
        {confirmedAddress && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            className="flex items-center gap-2 text-sm bg-primary/10 text-primary px-3 py-2.5 rounded-xl border border-primary/20"
          >
            <MapPin className="w-4 h-4 shrink-0" />
            <span className="truncate font-medium">{confirmedAddress}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error message */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg"
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
