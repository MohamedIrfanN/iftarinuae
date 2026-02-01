import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MapPin, Loader2, Navigation, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

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

export function LocationPicker({
  value,
  onChange,
  onLocationFetched,
  placeholder = "e.g. Downtown Dubai, near Burj Khalifa",
}: LocationPickerProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLocation = async () => {
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
          // Reverse geocode using OpenStreetMap Nominatim (FREE)
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
            {
              headers: {
                "Accept-Language": "en",
              },
            }
          );

          if (!response.ok) {
            throw new Error("Failed to fetch address");
          }

          const data: NominatimResponse = await response.json();

          // Build a readable address
          const addressParts = [];
          if (data.address.amenity) addressParts.push(data.address.amenity);
          if (data.address.road) addressParts.push(data.address.road);
          if (data.address.suburb) addressParts.push(data.address.suburb);
          if (data.address.city) addressParts.push(data.address.city);
          if (data.address.state) addressParts.push(data.address.state);

          const readableAddress =
            addressParts.length > 0
              ? addressParts.join(", ")
              : data.display_name;

          onChange(readableAddress);

          if (onLocationFetched) {
            onLocationFetched({
              address: readableAddress,
              latitude: latitude.toString(),
              longitude: longitude.toString(),
            });
          }
        } catch {
          setError("Failed to get address. Please try again.");
        } finally {
          setIsLoading(false);
        }
      },
      (error) => {
        setIsLoading(false);
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setError("Location permission denied. Please enable it in your browser settings.");
            break;
          case error.POSITION_UNAVAILABLE:
            setError("Location unavailable. Please try again.");
            break;
          case error.TIMEOUT:
            setError("Location request timed out. Please try again.");
            break;
          default:
            setError("An error occurred getting your location.");
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <MapPin className="absolute left-3 top-3.5 w-5 h-5 text-muted-foreground" />
        <Input
          placeholder={placeholder}
          className="pl-10 pr-36 h-12 rounded-xl"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="absolute right-2 top-2 h-8 text-xs gap-1.5 rounded-lg"
          onClick={fetchLocation}
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Fetching...
            </>
          ) : (
            <>
              <Navigation className="w-3.5 h-3.5" />
              Use My Location
            </>
          )}
        </Button>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg"
          >
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
