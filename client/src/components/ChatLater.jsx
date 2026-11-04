import { lazy, Suspense, useEffect, useState } from 'react';

const SupportChat = lazy(() => import('./SupportChat.jsx'));

/** The support chat button loads after the page is ready (it is never needed for the first paint). */
export default function ChatLater() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const go = () => setOn(true);
    if ('requestIdleCallback' in window) { const id = requestIdleCallback(go, { timeout: 4000 }); return () => cancelIdleCallback(id); }
    const t = setTimeout(go, 2500); return () => clearTimeout(t);
  }, []);
  return on ? <Suspense fallback={null}><SupportChat /></Suspense> : null;
}
