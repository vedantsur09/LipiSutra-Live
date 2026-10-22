import { useEffect, useRef } from "react";

const GOOGLE_KEY = import.meta.env.VITE_MAPS_KEY || import.meta.env.VITE_VISION_KEY;
const INDIA_CENTER = { lat: 20.5937, lng: 78.9629 };
const SINGLE_PIN_ZOOM = 8;

let mapsLoader = null;

// Loads the Google Maps script once, no matter how often the map is mounted
function loadGoogleMaps() {
  if (window.google?.maps) return Promise.resolve(window.google);
  if (!mapsLoader) {
    mapsLoader = new Promise((resolve, reject) => {
      window.initLipisutraMap = () => resolve(window.google);
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_KEY}&callback=initLipisutraMap`;
      script.async = true;
      script.onerror = () => {
        mapsLoader = null;
        reject(new Error("Google Maps failed to load"));
      };
      document.head.appendChild(script);
    });
  }
  return mapsLoader;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, ch => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
  ));
}

// Locations are either plain names or { name, lat, lng } objects from the AI
function getLocationName(loc) {
  return typeof loc === "string" ? loc : loc?.name || "";
}

function hasCoordinates(loc) {
  return loc && typeof loc === "object" && Number.isFinite(Number(loc.lat)) && Number.isFinite(Number(loc.lng));
}

export default function MapSection({ locations, theme }) {
  const mapRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    loadGoogleMaps().then(google => {
      if (cancelled || !mapRef.current) return;

      const map = new google.maps.Map(mapRef.current, {
        center: INDIA_CENTER,
        zoom: 5,
        disableDefaultUI: true,
        styles: [
          { elementType: "geometry", stylers: [{ color: "#0B1121" }] },
          { elementType: "labels.text.fill", stylers: [{ color: "#94A3B8" }] },
          { elementType: "labels.text.stroke", stylers: [{ color: "#0B1121", weight: 2 }] },
          { featureType: "water", elementType: "geometry", stylers: [{ color: "#050810" }] },
          { featureType: "road", stylers: [{ visibility: "simplified" }, { color: "#1E293B" }] },
          { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#D4AF37", weight: 0.5 }] }
        ]
      });

      const bounds = new google.maps.LatLngBounds();
      let pinCount = 0;

      const addPin = (name, position) => {
        if (cancelled) return;
        const marker = new google.maps.Marker({
          position,
          map,
          title: name,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 12,
            fillColor: "#FCD34D",
            fillOpacity: 0.9,
            strokeColor: "#D4AF37",
            strokeWeight: 2
          }
        });

        const info = new google.maps.InfoWindow({
          content: `<div style="background:#131A2B;color:#F8F9FA;padding:16px;border-radius:12px;border:1px solid rgba(212,175,55,0.3);font-family:'Inter',sans-serif">
            <strong style="color:#D4AF37;font-size:15px;font-family:'Cinzel',serif">${escapeHtml(name)}</strong>
            <span style="font-size:12px;color:#94A3B8;margin-top:8px;display:block">Identified from document analysis</span>
          </div>`
        });
        marker.addListener("click", () => info.open(map, marker));

        bounds.extend(position);
        pinCount++;
        if (pinCount === 1) {
          map.setCenter(position);
          map.setZoom(SINGLE_PIN_ZOOM);
          info.open(map, marker);
        } else {
          map.fitBounds(bounds);
        }
      };

      const geocoder = new google.maps.Geocoder();
      (locations || []).forEach(loc => {
        const name = getLocationName(loc);
        if (!name) return;
        if (hasCoordinates(loc)) {
          addPin(name, { lat: Number(loc.lat), lng: Number(loc.lng) });
          return;
        }
        geocoder.geocode({ address: name }, (results, status) => {
          if (status === "OK" && results[0]) {
            addPin(name, results[0].geometry.location);
          } else {
            console.warn(`>>> [GEOCODER] Could not place '${name}' (status: ${status})`);
          }
        });
      });
    }).catch(err => console.error(">>> [MAP]", err.message));

    return () => {
      cancelled = true;
    };
  }, [locations]);

  const locationCount = locations?.length || 0;

  return (
    <div className="rounded-xl overflow-hidden border shadow-xl" style={{ backgroundColor: theme.headerBg, borderColor: theme.border, boxShadow: theme.cardShadow }}>
      <div className="p-5 border-b flex justify-between items-center" style={{ backgroundColor: theme.surface, borderColor: theme.border }}>
        <div>
          <h2 className="text-lg font-heading mb-1" style={{ color: theme.accent }}>🗺️ Heritage Map</h2>
          <p className="text-xs" style={{ color: theme.subtext }}>
            {locationCount > 0 ? `Displaying ${locationCount} origin sites via AI Auto-Pin.` : "No places were named in this document."}
          </p>
        </div>
      </div>
      <div ref={mapRef} className="w-full h-[400px]" style={{ backgroundColor: theme.bg }} />
    </div>
  );
}
