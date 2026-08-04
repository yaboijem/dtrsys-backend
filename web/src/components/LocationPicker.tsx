import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Circle, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Crosshair, MapPin } from 'lucide-react';
import { formatMeters } from '../lib/format';
import 'leaflet/dist/leaflet.css';

// Vite breaks Leaflet's default icon URLs — fix once at module load
const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

/** Manila default when creating a new branch with no coords yet */
const DEFAULT_CENTER: [number, number] = [14.5995, 120.9842];
const DEFAULT_ZOOM = 15;

function roundCoord(n: number) {
  return Math.round(n * 1e6) / 1e6;
}

function MapResize() {
  const map = useMap();
  useEffect(() => {
    const id = window.setTimeout(() => map.invalidateSize(), 80);
    return () => window.clearTimeout(id);
  }, [map]);
  return null;
}

function Recenter({ lat, lng, hasPin }: { lat: number; lng: number; hasPin: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (!hasPin) return;
    map.setView([lat, lng], map.getZoom(), { animate: true });
  }, [lat, lng, hasPin, map]);
  return null;
}

function ClickToPin({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(roundCoord(e.latlng.lat), roundCoord(e.latlng.lng));
    },
  });
  return null;
}

export function LocationPicker({
  latitude,
  longitude,
  radiusMeters,
  onChange,
  className = 'h-72',
}: {
  latitude: number | null;
  longitude: number | null;
  radiusMeters?: number | null;
  onChange: (lat: number, lng: number) => void;
  className?: string;
}) {
  const hasPin =
    latitude != null &&
    longitude != null &&
    !Number.isNaN(latitude) &&
    !Number.isNaN(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180;

  const center: [number, number] = hasPin ? [latitude!, longitude!] : DEFAULT_CENTER;
  const radius = radiusMeters != null && !Number.isNaN(radiusMeters) && radiusMeters > 0 ? radiusMeters : null;

  const mapsLink = hasPin
    ? `https://www.google.com/maps?q=${latitude},${longitude}&z=17`
    : null;

  const circlePath = useMemo(
    () => ({
      color: '#2563eb',
      fillColor: '#3b82f6',
      fillOpacity: 0.12,
      weight: 2,
    }),
    [],
  );

  function useMyLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange(roundCoord(pos.coords.latitude), roundCoord(pos.coords.longitude));
      },
      () => {
        /* browser will surface permission errors; keep silent */
      },
      { enableHighAccuracy: true, timeout: 12000 },
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className={`relative w-full bg-slate-100 ${className}`}>
        <MapContainer
          center={center}
          zoom={DEFAULT_ZOOM}
          className="absolute inset-0 z-0 h-full w-full"
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapResize />
          <ClickToPin onPick={onChange} />
          {hasPin && <Recenter lat={latitude!} lng={longitude!} hasPin={hasPin} />}
          {hasPin && (
            <Marker
              position={[latitude!, longitude!]}
              draggable
              eventHandlers={{
                dragend: (e) => {
                  const pos = e.target.getLatLng();
                  onChange(roundCoord(pos.lat), roundCoord(pos.lng));
                },
              }}
            />
          )}
          {hasPin && radius != null && (
            <Circle center={[latitude!, longitude!]} radius={radius} pathOptions={circlePath} />
          )}
        </MapContainer>

        {!hasPin && (
          <div className="pointer-events-none absolute inset-x-0 top-3 z-[400] flex justify-center px-3">
            <span className="rounded-full bg-card/95 px-3 py-1.5 text-xs font-medium text-text shadow-sm ring-1 ring-border">
              Click the map to drop a pin
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-card px-3 py-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="inline-flex items-center gap-1 font-medium">
            <MapPin size={12} className="text-primary" />
            {hasPin ? (
              <span className="font-mono tnum text-text">
                {latitude!.toFixed(6)}, {longitude!.toFixed(6)}
              </span>
            ) : (
              'No pin yet'
            )}
          </span>
          {radius != null && hasPin && (
            <span className="font-mono tnum">Radius {formatMeters(radius)}</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={useMyLocation}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/5 cursor-pointer"
          >
            <Crosshair size={12} />
            Use my location
          </button>
          {mapsLink && (
            <a
              href={mapsLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold text-primary hover:underline"
            >
              Open in Google Maps
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
