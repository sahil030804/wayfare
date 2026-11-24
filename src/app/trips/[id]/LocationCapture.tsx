"use client";

import { useState } from "react";
import { MapPin, X } from "lucide-react";

export function LocationCapture({ latitude, longitude }: { latitude: number | null; longitude: number | null }) {
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(
    latitude != null && longitude != null ? { lat: latitude, lng: longitude } : null,
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  function capture() {
    if (!navigator.geolocation) {
      setMessage("Location is unavailable in this browser.");
      return;
    }
    setBusy(true);
    setMessage("");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setPoint({ lat: Number(coords.latitude.toFixed(4)), lng: Number(coords.longitude.toFixed(4)) });
        setBusy(false);
        setMessage("Location added. It will be saved with this expense.");
      },
      () => {
        setBusy(false);
        setMessage("Could not get your location. You can save the expense without it.");
      },
      { enableHighAccuracy: false, maximumAge: 0, timeout: 10000 },
    );
  }

  return <div className="location-capture">
    <input type="hidden" name="location_lat" value={point?.lat ?? ""}/>
    <input type="hidden" name="location_lng" value={point?.lng ?? ""}/>
    <div className="location-actions">
      <button type="button" className="secondary" onClick={capture} disabled={busy}><MapPin size={16}/>{busy ? "Finding location…" : point ? "Update location" : "Use my current location"}</button>
      {point && <button type="button" className="text-button" onClick={() => { setPoint(null); setMessage("Location removed."); }}><X size={15}/> Remove</button>}
    </div>
    <p className="location-note">Optional. Captures your location once; trip members can view it.</p>
    {message && <p className="location-note" role="status">{message}</p>}
  </div>;
}
