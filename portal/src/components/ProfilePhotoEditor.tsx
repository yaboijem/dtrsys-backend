import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';

import {
  clampCoverOffset,
  coverScale,
  exportCoverCropDataUrl,
  loadImage,
} from '../lib/image';
import { fontSize, radius, spacing, useThemeColors } from '../theme';
import { Button } from './Button';

const OUT = 384;
const MAX_ZOOM = 3;

function measureViewSize(): number {
  if (typeof window === 'undefined') return 280;
  return Math.max(200, Math.min(280, window.innerWidth - 48));
}

type Props = {
  open: boolean;
  imageSrc: string | null;
  onCancel: () => void;
  onConfirm: (dataUrl: string) => void;
};

export function ProfilePhotoEditor({ open, imageSrc, onCancel, onConfirm }: Props) {
  const colors = useThemeColors();
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const [viewSize, setViewSize] = useState(measureViewSize);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!open) return;
    const sync = () => setViewSize(measureViewSize());
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, [open]);

  useEffect(() => {
    if (!open || !imageSrc) {
      setNatural(null);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
      setLoadError(false);
      setBusy(false);
      return;
    }
    let cancelled = false;
    setLoadError(false);
    loadImage(imageSrc)
      .then((img) => {
        if (cancelled) return;
        setNatural({ w: img.naturalWidth, h: img.naturalHeight });
        setZoom(1);
        setOffset({ x: 0, y: 0 });
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, imageSrc]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  const base = natural ? coverScale(natural.w, natural.h, viewSize) : 1;
  const scale = base * zoom;

  const applyOffset = useCallback(
    (x: number, y: number) => {
      if (!natural) return;
      setOffset(clampCoverOffset(natural.w, natural.h, viewSize, base * zoom, x, y));
    },
    [natural, base, zoom, viewSize],
  );

  useEffect(() => {
    if (!natural) return;
    setOffset((prev) => clampCoverOffset(natural.w, natural.h, viewSize, base * zoom, prev.x, prev.y));
  }, [natural, base, zoom, viewSize]);

  const onPointerDown = (e: ReactPointerEvent) => {
    if (!natural || busy) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: offset.x,
      originY: offset.y,
    };
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    applyOffset(drag.originX + (e.clientX - drag.startX), drag.originY + (e.clientY - drag.startY));
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null;
  };

  const handleConfirm = async () => {
    if (!imageSrc || !natural || busy) return;
    setBusy(true);
    try {
      const dataUrl = await exportCoverCropDataUrl(imageSrc, viewSize, scale, offset.x, offset.y, OUT, 0.85);
      onConfirm(dataUrl);
    } catch {
      setLoadError(true);
    } finally {
      setBusy(false);
    }
  };

  if (!open || !imageSrc) return null;

  return createPortal(
    <div
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 90,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        background: colors.overlay,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-photo-editor-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 420,
          margin: '0 auto',
          maxHeight: '100%',
          overflow: 'auto',
          background: colors.card,
          borderTopLeftRadius: radius.lg,
          borderTopRightRadius: radius.lg,
          border: `1px solid ${colors.border}`,
          boxShadow: '0 -8px 32px rgba(15,23,42,0.2)',
          padding: spacing.lg,
          paddingBottom: `max(${spacing.lg}px, env(safe-area-inset-bottom))`,
        }}
      >
        <div
          id="profile-photo-editor-title"
          style={{ fontSize: fontSize.lg, fontWeight: 800, color: colors.ink, letterSpacing: '-0.02em' }}
        >
          Adjust photo
        </div>
        <div style={{ fontSize: fontSize.sm, color: colors.muted, marginTop: spacing.xs, lineHeight: 1.45 }}>
          Drag to position. Use the slider to zoom. The circle is how it appears on your profile.
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            marginTop: spacing.lg,
            marginBottom: spacing.md,
          }}
        >
          <div
            ref={stageRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            style={{
              width: viewSize,
              height: viewSize,
              borderRadius: 999,
              overflow: 'hidden',
              position: 'relative',
              touchAction: 'none',
              cursor: busy ? 'default' : 'grab',
              background: '#0f172a',
              boxShadow: `0 0 0 3px color-mix(in srgb, var(--primary) 35%, transparent)`,
              userSelect: 'none',
            }}
          >
            {loadError ? (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: fontSize.sm,
                  padding: spacing.md,
                  textAlign: 'center',
                }}
              >
                Couldn&apos;t load that image
              </div>
            ) : natural ? (
              <img
                src={imageSrc}
                alt=""
                draggable={false}
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  width: natural.w * scale,
                  height: natural.h * scale,
                  maxWidth: 'none',
                  transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                  pointerEvents: 'none',
                }}
              />
            ) : (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#94a3b8',
                  fontSize: fontSize.sm,
                }}
              >
                Loading…
              </div>
            )}
          </div>
        </div>

        <label style={{ display: 'block', fontSize: fontSize.sm, fontWeight: 600, color: colors.muted }}>
          Zoom
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            disabled={!natural || busy || loadError}
            onChange={(e) => setZoom(Number(e.target.value))}
            style={{ width: '100%', marginTop: spacing.sm, accentColor: 'var(--primary)' }}
          />
        </label>

        <div style={{ display: 'flex', gap: spacing.sm, marginTop: spacing.lg }}>
          <Button
            title="Cancel"
            variant="secondary"
            onClick={onCancel}
            disabled={busy}
            style={{ flex: 1, width: 'auto' }}
          />
          <Button
            title="Use photo"
            variant="primary"
            onClick={() => void handleConfirm()}
            disabled={!natural || busy || loadError}
            loading={busy}
            style={{ flex: 1, width: 'auto' }}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
