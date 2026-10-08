const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

let scriptPromise: Promise<void> | null = null;

export function loadGoogleIdentity(): Promise<void> {
  if (window.google?.accounts?.id) {
    return Promise.resolve();
  }
  if (scriptPromise) {
    return scriptPromise;
  }
  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    const script = existing ?? document.createElement('script');
    const fail = () => {
      scriptPromise = null;
      reject(new Error('Google sign-in failed. Try again.'));
    };
    script.addEventListener('load', () => {
      if (window.google?.accounts?.id) {
        resolve();
        return;
      }
      fail();
    }, { once: true });
    script.addEventListener('error', fail, { once: true });
    if (!existing) {
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  });
  return scriptPromise;
}
