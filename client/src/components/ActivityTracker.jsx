import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../api.js';

const sectionOf = (p) =>
  /^\/(quiz\/|quizzes|result)/.test(p) ? 'quiz'
    : /^\/mock/.test(p) ? 'mock'
      : /^\/question-bank/.test(p) ? 'qbank'
        : /^\/practice/.test(p) ? 'practice'
          : /^\/vocab/.test(p) ? 'vocab'
            : /^\/(game|play)/.test(p) ? 'arena'
              : /^\/(roadmap|lesson)/.test(p) ? 'lessons'
                : /^\/placement/.test(p) ? 'placement'
                  : p === '/' ? 'home' : 'other';

const TICK = 30; // seconds
const IDLE = 120e3; // no input for 2 min = not counted

/** Counts a student's active time per section (tab visible and in use) and reports it every 30 s. */
export default function ActivityTracker() {
  const { pathname } = useLocation();
  const path = useRef(pathname);
  path.current = pathname;
  const lastInput = useRef(Date.now());
  useEffect(() => {
    const touch = () => { lastInput.current = Date.now(); };
    const evs = ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart', 'wheel'];
    evs.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const t = setInterval(() => {
      if (document.visibilityState !== 'visible' || Date.now() - lastInput.current > IDLE) return;
      api.post('/activity', { section: sectionOf(path.current), seconds: TICK }).catch(() => {});
    }, TICK * 1000);
    return () => { clearInterval(t); evs.forEach((e) => window.removeEventListener(e, touch)); };
  }, []);
  return null;
}
