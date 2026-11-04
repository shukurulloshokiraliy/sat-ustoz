import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// Blocks that animate in: on page entry the visible ones rise one after another, the rest as they scroll into view.
const SEL = [
  '.card', '.stat', '.v-set', '.v-word', '.qb-group', '.qb-row-all', '.arena-mode', '.lb-row', '.lb-podium > *', '.lb-prize',
  '.pub-main section', '.pub-main .pub-card', '.pub-main h2', '.pub-step', '.pub-price', '.lesson-nav', '.banner', '.page-head',
].join(',');

/** Scroll reveal for everything inside `rootSel`; re-scans when the route or the DOM changes. */
export function useReveal(rootSel) {
  const { pathname } = useLocation();
  useEffect(() => {
    const root = document.querySelector(rootSel);
    if (!root || !('IntersectionObserver' in window)) return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const phone = window.matchMedia('(max-width: 900px), (pointer: coarse)').matches;
    root.classList.toggle('rv-phone', phone);
    const io = new IntersectionObserver((entries) => {
      let k = 0;
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const el = e.target;
        el.style.transitionDelay = `${Math.min(k++, 6) * (phone ? 40 : 70)}ms`;
        el.classList.add('rv-in');
        io.unobserve(el);
        setTimeout(() => { el.style.transitionDelay = ''; el.classList.add('rv-done'); }, 1000);
      }
    }, { rootMargin: phone ? '0px 0px 6% 0px' : '0px 0px -6% 0px', threshold: 0.05 });
    let burst = 0; // index for the entry cascade; resets when a new batch of content arrives
    let burstAt = 0;
    const scan = () => {
      const now = performance.now();
      if (now - burstAt > 400) burst = 0;
      burstAt = now;
      root.querySelectorAll(SEL).forEach((el) => {
        if (el.dataset.rv || el.closest('.modal, .sc-panel, .qb-panel, .sk-page')) return;
        if (el.parentElement?.closest('[data-rv]') && !el.matches('.pub-price, .pub-step, .lb-row, .lb-podium > *, .v-set, .v-word, .qb-row-all, .stat, .lb-prize')) return; // nested card: the parent animates
        el.dataset.rv = '1';
        const r = el.getBoundingClientRect();
        if (r.top < window.innerHeight * 0.95 && r.bottom > 0) {
          // already on screen: a staggered rise, card by card
          el.style.setProperty('--rv-d', `${Math.min(burst++, 12) * (phone ? 45 : 75)}ms`);
          el.classList.add('rv-enter');
          setTimeout(() => el.classList.remove('rv-enter'), 1600);
          return;
        }
        el.classList.add('rv');
        io.observe(el);
      });
    };
    scan();
    const mo = new MutationObserver(() => requestAnimationFrame(scan));
    mo.observe(root, { childList: true, subtree: true });
    return () => { io.disconnect(); mo.disconnect(); };
  }, [rootSel, pathname]);
}
