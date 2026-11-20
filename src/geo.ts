const GEO_ERRORS: Record<number, string> = {
  1: "Location access is blocked. Allow it for this site in your browser settings, then try again.",
  2: "Couldn't work out where you are. Try again somewhere with a clearer signal.",
  3: "Finding your location took too long. Try again.",
};

/** The device's current position. Rejects with an Error whose message is fit to show the person. */
export function currentPosition(): Promise<GeolocationCoordinates> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("This browser can't share your location."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos.coords),
      (err) => reject(new Error(GEO_ERRORS[err.code] ?? "Couldn't get your location.")),
      // Ask for the real GPS reading and never accept an old cached one.
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  });
}

const EARTH_RADIUS_M = 6_371_000;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle distance in metres between two points given in decimal degrees. */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

export const METERS_PER_MILE = 1609.344;

/** "300 ft" up close, "2.3 mi" further out. */
export function formatDistance(meters: number) {
  const feet = meters * 3.28084;
  if (feet < 1000) return `${Math.max(10, Math.round(feet / 10) * 10)} ft`;
  const miles = meters / METERS_PER_MILE;
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;
}
