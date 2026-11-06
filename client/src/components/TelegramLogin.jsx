import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../context.jsx';
import { IconTelegram } from './icons.jsx';

/**
 * "Continue with Telegram": a one-time code opens the bot (t.me/<bot>?start=login_<code>). An existing student signs in
 * at once; someone new shares their phone number with the bot and gets an account. This page polls the code and signs
 * in by itself; the bot also sends a "Back to the website" button (/login?tg=<code>) for phones.
 */
export default function TelegramLogin({ signup, agree, needAgree, onError, onTerms }) {
  const { telegram } = useAuth();
  const [link, setLink] = useState(null); // { code, url, at }
  const [wait, setWait] = useState(false);
  const timer = useRef(null);
  const fresh = (l) => l && Date.now() - l.at < 12 * 60e3;
  const make = useCallback(() => api.post('/auth/telegram/start', {}).then((r) => { const l = { ...r, at: Date.now() }; setLink(l); return l; }), []);

  const poll = useCallback(async (code) => {
    try {
      const r = await api.post('/auth/telegram/poll', { code });
      if (r.token) { clearInterval(timer.current); window.history.replaceState(null, '', '/'); await telegram(r.token); return true; }
    } catch (e) {
      clearInterval(timer.current); setWait(false);
      if (e.data?.code === 'terms_required') onTerms(); else onError(e.message);
      setLink(null); make().catch(() => {});
    }
    return false;
  }, [telegram, onError, onTerms, make]);

  const watch = useCallback((code) => {
    clearInterval(timer.current); setWait(true);
    const started = Date.now();
    timer.current = setInterval(() => { if (Date.now() - started > 15 * 60e3) { clearInterval(timer.current); setWait(false); return; } if (!document.hidden) poll(code); }, 2000);
  }, [poll]);

  // back from the bot's button: /login?tg=<code>
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('tg');
    if (code) { setWait(true); poll(code).then((ok) => { if (!ok) watch(code); }); } else make().catch(() => {});
    const vis = () => { if (!document.hidden && link && wait) poll(link.code); };
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(timer.current); document.removeEventListener('visibilitychange', vis); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // switching between Sign in and Create account stops a wait that was started on the other tab
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } clearInterval(timer.current); setWait(false); }, [signup]);

  const click = async (e) => {
    onError('');
    if (signup && !agree) { e.preventDefault(); needAgree(); return; }
    let l = link;
    if (!fresh(l)) {
      // the prepared link is old: make a new one and open it (a click-time window keeps phones from blocking it)
      e.preventDefault();
      const w = window.open('', '_blank');
      try { l = await make(); if (w) w.location.href = l.url; else window.location.href = l.url; } catch (ex) { if (w) w.close(); onError(ex.message); return; }
    }
    if (signup && agree) api.post('/auth/telegram/agree', { code: l.code }).catch(() => {});
    watch(l.code);
  };

  if (!link && !wait) return null;
  return (
    <div className="tg-login">
      <a className="btn tg-btn lg" href={link?.url || '#'} target="_blank" rel="noreferrer" onClick={click}>
        <IconTelegram width={20} height={20} /> {signup ? 'Sign up with Telegram' : 'Continue with Telegram'}
      </a>
      {wait && (
        <div className="tg-wait" role="status">
          <span className="tg-dot" aria-hidden="true" />
          <span>Waiting for Telegram: press <b>Start</b> in the bot{signup ? ' and share your phone number' : ''}. This page signs you in by itself.</span>
          <button type="button" className="link-btn" onClick={() => { clearInterval(timer.current); setWait(false); }}>Cancel</button>
        </div>
      )}
    </div>
  );
}
