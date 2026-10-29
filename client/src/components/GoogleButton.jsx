import { useEffect, useRef, useState } from 'react';

/** Loads Google Identity Services once. */
let gisPromise;
function loadGis() {
  gisPromise ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve(window.google);
    s.onerror = () => { gisPromise = null; reject(new Error('Could not load Google sign-in — check your internet connection')); };
    document.head.appendChild(s);
  });
  return gisPromise;
}

/**
 * Google's official “Sign in with Google” button. Works for both sign-in and sign-up:
 * a new Google account becomes a new student automatically.
 */
export default function GoogleButton({ clientId, mode = 'signin', theme = 'light', onCredential, onError }) {
  const box = useRef(null);
  const cb = useRef(onCredential);
  cb.current = onCredential;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    loadGis().then((google) => {
      if (!alive || !box.current) return;
      google.accounts.id.initialize({
        client_id: clientId,
        callback: (r) => r?.credential && cb.current(r.credential),
        ux_mode: 'popup',
        auto_select: false,
        cancel_on_tap_outside: true,
        context: mode === 'signup' ? 'signup' : 'signin',
      });
      box.current.innerHTML = '';
      google.accounts.id.renderButton(box.current, {
        type: 'standard',
        theme: theme === 'dark' ? 'filled_black' : 'outline',
        size: 'large',
        shape: 'pill',
        text: mode === 'signup' ? 'signup_with' : 'continue_with',
        logo_alignment: 'center',
        width: Math.min(400, Math.max(240, Math.round(box.current.parentElement?.clientWidth || 360))),
      });
      setReady(true);
    }).catch((e) => alive && onError?.(e.message));
    return () => { alive = false; };
  }, [clientId, mode, theme]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="google-slot">
      <div ref={box} className="google-btn-host" aria-label={mode === 'signup' ? 'Sign up with Google' : 'Continue with Google'} />
      {!ready && <div className="google-skeleton" aria-hidden="true" />}
    </div>
  );
}
