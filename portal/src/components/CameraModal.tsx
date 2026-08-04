import { useEffect, useRef, useState } from 'react';
import { fontSize, microLabel, radius, spacing, useThemeColors } from '../theme';
import { Banner } from './Feedback';

interface CameraModalProps {
  visible: boolean;
  onCapture: (uri: string) => void;
  onClose: () => void;
}

export function CameraModal({ visible, onCapture, onClose }: CameraModalProps) {
  const colors = useThemeColors();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Start camera when visible
  useEffect(() => {
    if (!visible) {
      // Clean up camera when modal closes
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      setCameraReady(false);
      setError(null);
      return;
    }

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            setCameraReady(true);
          };
        }
      } catch (err) {
        console.warn('Camera access failed', err);
        setError('Camera permission denied or not available');
      }
    };

    startCamera();
  }, [visible]);

  const handleCapture = async () => {
    if (!videoRef.current || !canvasRef.current || !cameraReady) {
      return;
    }

    setCapturing(true);
    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        const blob = await new Promise<Blob>((resolve) => {
          canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.6);
        });
        const url = URL.createObjectURL(blob);
        onCapture(url);
      }
    } catch (error) {
      console.warn('Camera capture failed', error);
    } finally {
      setCapturing(false);
    }
  };

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: colors.cameraChrome,
        display: 'flex',
        flexDirection: 'column',
        zIndex: 50,
      }}
    >
      {error ? (
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', padding: spacing.xl }}>
          <div style={{ width: '100%', maxWidth: 400 }}>
            <Banner kind="warning" title="Camera permission needed" detail="Time-in and time-out require a selfie photo for face verification." />
            <button
              onClick={() => {
                navigator.mediaDevices.getUserMedia({ video: true }).then(stream => {
                  streamRef.current = stream;
                  if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.onloadedmetadata = () => setCameraReady(true);
                  }
                  setError(null);
                }).catch(() => setError('Camera access denied'));
              }}
              style={{
                width: '100%',
                borderRadius: radius.md,
                paddingTop: 14,
        paddingBottom: 14,
                backgroundColor: colors.band,
                color: colors.bandText,
                fontSize: fontSize.md,
                fontWeight: '700',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Grant camera permission
            </button>
          </div>
        </div>
      ) : (
        <>
          <div style={{ position: 'absolute', top: spacing.md, left: 0, right: 0, textAlign: 'center' }}>
            <span style={{ ...microLabel, color: '#ffffff' }}>Capture selfie</span>
          </div>

          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{ flex: 1, objectFit: 'cover' }}
          />
          <canvas ref={canvasRef} style={{ display: 'none' }} />

          <div
            style={{
              position: 'absolute',
              bottom: spacing.xl,
              left: 0,
              right: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            <button
              onClick={handleCapture}
              disabled={capturing || !cameraReady}
              aria-label="Take photo"
              style={{
                width: 76,
                height: 76,
                borderRadius: 38,
                borderWidth: 4,
                borderStyle: 'solid',
                borderColor: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'transparent',
                opacity: capturing || !cameraReady ? 0.5 : 1,
                cursor: capturing || !cameraReady ? 'not-allowed' : 'pointer',
              }}
            >
              {capturing ? (
                <span style={{ color: '#ffffff' }}>...</span>
              ) : (
                <div
                  style={{
                    width: 58,
                    height: 58,
                    borderRadius: 29,
                    backgroundColor: '#ffffff',
                  }}
                />
              )}
            </button>
            <button
              onClick={onClose}
              aria-label="Cancel capture"
              style={{
                marginTop: spacing.md,
                minHeight: 44,
                minWidth: 88,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'transparent',
                border: 'none',
                color: '#ffffff',
                fontSize: fontSize.md,
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}
