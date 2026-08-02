import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { Loader2 } from 'lucide-react';

interface PhotoViewerProps {
  url: string;
  token: string;
  alt: string;
  className?: string;
  fallbackText?: string;
}

export function PhotoViewer({ url, token, alt, className, fallbackText = 'No photo available' }: PhotoViewerProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let urlToRevoke: string | null = null;
    setError(false);
    setObjectUrl(null);

    async function load() {
      try {
        const response = await api.request<Response>('GET', url, { token, raw: true });
        const blob = await response.blob();
        if (cancelled) return;
        urlToRevoke = URL.createObjectURL(blob);
        setObjectUrl(urlToRevoke);
      } catch (e) {
        if (!cancelled && e instanceof ApiError && e.status !== 404) {
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

  if (error) {
    return (
      <div className={`flex items-center justify-center bg-bg text-xs text-muted ${className ?? ''}`}>
        Could not load photo
      </div>
    );
  }

  if (!objectUrl) {
    return (
      <div className={`flex items-center justify-center bg-bg text-xs text-muted ${className ?? ''}`}>
        <Loader2 size={16} className="mr-2 animate-spin" />
        {fallbackText}
      </div>
    );
  }

  return (
    <img
      src={objectUrl}
      alt={alt}
      className={className}
      style={{ objectFit: 'cover' }}
    />
  );
}
