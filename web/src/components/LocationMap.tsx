import { ExternalLink, MapPin } from 'lucide-react';
import { Badge } from './ui';
import { formatMeters } from '../lib/format';

export function LocationMap({
  latitude,
  longitude,
  isWithinRadius,
  distanceMeters,
  radiusMeters,
  label = 'Location',
  className = 'h-56',
}: {
  latitude: number;
  longitude: number;
  isWithinRadius?: boolean | null;
  distanceMeters?: number | null;
  /** Optional geofence radius (meters) shown in the footer — e.g. branch radius */
  radiusMeters?: number | null;
  label?: string;
  className?: string;
}) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return <div className="rounded-lg border border-border bg-bg px-3 py-8 text-center text-xs text-muted">Enter valid latitude and longitude to preview the map.</div>;
  }

  // Slightly zoom out when a large geofence radius is set
  const zoom =
    radiusMeters != null && radiusMeters > 800 ? 14 : radiusMeters != null && radiusMeters > 300 ? 15 : 17;

  const embedSrc = `https://maps.google.com/maps?q=${lat},${lng}&z=${zoom}&output=embed`;
  const openSrc = `https://www.google.com/maps?q=${lat},${lng}&z=${zoom}`;

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className={`relative w-full bg-slate-100 ${className}`}>
        <iframe
          title={`${label} map`}
          src={embedSrc}
          className="absolute inset-0 h-full w-full border-0"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-card px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 text-xs font-medium text-muted">
            <MapPin size={12} className="text-primary" />
            {label}
          </span>
          {isWithinRadius === true && <Badge tone="green">Within radius</Badge>}
          {isWithinRadius === false && <Badge tone="red">Outside radius</Badge>}
          {distanceMeters != null && (
            <span className="font-mono text-[11px] tnum text-muted">{formatMeters(distanceMeters)} from branch</span>
          )}
          {radiusMeters != null && !Number.isNaN(Number(radiusMeters)) && (
            <span className="font-mono text-[11px] tnum text-muted">Radius {formatMeters(Number(radiusMeters))}</span>
          )}
        </div>
        <a
          href={openSrc}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
        >
          Open in Google Maps
          <ExternalLink size={12} />
        </a>
      </div>
    </div>
  );
}
