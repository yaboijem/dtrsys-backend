import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { loadGoogleIdentity } from '../auth/googleIdentity';
import { useIsDark } from '../theme';

interface GoogleSignInButtonProps {
  clientId: string;
  blocked: boolean;
  blockMode: 'loading' | 'offline' | null;
  onCredential: (idToken: string) => void;
  onOffline: () => void;
  onError: (message: string) => void;
}

export function GoogleSignInButton({
  clientId,
  blocked,
  blockMode,
  onCredential,
  onOffline,
  onError,
}: GoogleSignInButtonProps) {
  const isDark = useIsDark();
  const frameRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLDivElement>(null);
  const onCredentialRef = useRef(onCredential);
  const [width, setWidth] = useState(240);

  useEffect(() => {
    onCredentialRef.current = onCredential;
  }, [onCredential]);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) {
      return;
    }
    const measure = () => setWidth(Math.max(240, Math.floor(frame.clientWidth)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const parent = buttonRef.current;
    if (!parent) {
      return;
    }
    let cancelled = false;
    loadGoogleIdentity()
      .then(() => {
        if (cancelled || !parent || !window.google?.accounts?.id) {
          return;
        }
        parent.replaceChildren();
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => {
            if (response.credential) {
              onCredentialRef.current(response.credential);
            }
          },
        });
        window.google.accounts.id.renderButton(parent, {
          type: 'standard',
          theme: isDark ? 'filled_black' : 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          width,
        });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          onError(err instanceof Error ? err.message : 'Google sign-in failed. Try again.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, isDark, onError, width]);

  const coverStyle = {
    position: 'absolute' as const,
    inset: 0,
    zIndex: 2,
    width: '100%',
    minHeight: 44,
    border: 0,
    padding: 0,
    background: 'transparent',
  };

  return (
    <div ref={frameRef} style={{ position: 'relative', width: '100%', minHeight: 44 }}>
      <div ref={buttonRef} />
      {blocked && blockMode === 'offline' ? (
        <button type="button" aria-label="Continue with Google" onClick={onOffline} style={coverStyle} />
      ) : null}
      {blocked && blockMode === 'loading' ? <div aria-hidden style={coverStyle} /> : null}
    </div>
  );
}
