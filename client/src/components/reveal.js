import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// Blocks that fade up the first time they scroll into view.
const SEL = [
  '.card', '.stat', '.v-set', '.v-word', '.qb-group', '.qb-row-all', '.arena-mode',
  '.pub-main section', '.pub-main .pub-card', '.pub-main h2', '.lesson-nav',
].join(',');

/** Scroll reveal for everything inside `rootSel`; re-scans when the route or the DOM changes. */
export function useReveal(rootSel) {
  const { pathname } = useLocation();
  useEffect(() => {
    const root = document.querySelector(rootSel);
    if (!root || !('IntersectionObserver' in window)) return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const io = new IntersectionObserver((entries) => {
      let k = 0;
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const el = e.target;
        el.style.transitionDelay = `${Math.min(k++, 6) * 60}ms`;
        el.classList.add('rv-in');
        io.unobserve(el);
        setTimeout(() => { el.style.transitionDelay = ''; el.classList.add('rv-done'); }, 900);
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    const scan = () => {
      root.querySelectorAll(SEL).forEach((el) => {
        if (el.dataset.rv || el.closest('.modal, .sc-panel, .qb-panel')) return;
        el.dataset.rv = '1';
        const r = el.getBoundingClientRect();
        if (r.top < window.innerHeight * 0.92) return; // already on screen: no flicker
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
