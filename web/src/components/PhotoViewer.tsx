import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { Loader2, X } from 'lucide-react';

interface PhotoViewerProps {
  url: string;
  token: string;
  alt: string;
  className?: string;
  fallbackText?: string;
  dark?: boolean;
}

export function PhotoViewer({ url, token, alt, className, fallbackText = 'No photo available', dark = false }: PhotoViewerProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let urlToRevoke: string | null = null;
    setError(false);
    setNotFound(false);
    setObjectUrl(null);

    async function load() {
      try {
        const response = await api.request<Response>('GET', url, { token, raw: true });
        const blob = await response.blob();
        if (cancelled) return;
        urlToRevoke = URL.createObjectURL(blob);
        setObjectUrl(urlToRevoke);
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 404) {
          setNotFound(true);
        } else if (e instanceof ApiError) {
          setError(true);
        }
      }
    }
    void load();

    return () => {
      cancelled = true;
      if (urlToRevoke) {
        URL.revokeObjectURL(urlToRevoke);
      }
    };
  }, [url, token]);

  useEffect(() => {
    if (!zoomed) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setZoomed(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [zoomed]);

  if (error) {
    return (
      <div className={`flex items-center justify-center text-xs ${dark ? 'bg-deep-2 text-slate-400' : 'bg-bg text-muted'} ${className ?? ''}`}>
        Could not load photo
      </div>
    );
  }

  if (notFound) {
    return (
      <div className={`flex items-center justify-center text-xs ${dark ? 'bg-deep-2 text-slate-400' : 'bg-bg text-muted'} ${className ?? ''}`}>
        {fallbackText}
      </div>
    );
  }

  if (!objectUrl) {
    return (
      <div className={`flex items-center justify-center text-xs ${dark ? 'bg-deep-2 text-slate-400' : 'bg-bg text-muted'} ${className ?? ''}`}>
        <Loader2 size={16} className="mr-2 animate-spin" />
        {fallbackText}
      </div>
    );
  }

  return (
    <>
      <img
        src={objectUrl}
        alt={alt}
        onClick={() => setZoomed(true)}
        className={`cursor-zoom-in object-contain ${className ?? ''}`}
      />
      {zoomed && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 sm:p-10"
          onClick={() => setZoomed(false)}
        >
          <img src={objectUrl} alt={alt} className="max-h-full max-w-full object-contain" />
          <button
            type="button"
            aria-label="Close photo"
            onClick={() => setZoomed(false)}
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>
      )}
    </>
  );
}
