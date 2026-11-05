import { useEffect, useRef, useState } from 'react';
import { api } from '../../api.js';

/**
 * Pictures for vocabulary words (server: /api/vocab/pictures, Openverse + the teacher's own pictures).
 * Asks for the words on screen in small batches; each found picture appears as soon as it arrives.
 * Returns id → { url, credit, landing }.
 */
export function useWordPictures(words) {
  const [pics, setPics] = useState({});
  const asked = useRef(new Set());
  const key = (words || []).map((w) => w.id).join(',');
  useEffect(() => {
    let alive = true;
    const todo = (words || []).filter((w) => !w.image_url && !asked.current.has(w.id)).map((w) => w.id);
    (async () => {
      for (let i = 0; i < todo.length && alive; i += 8) {
        const ids = todo.slice(i, i + 8);
        ids.forEach((id) => asked.current.add(id));
        try { const got = await api.get('/vocab/pictures?ids=' + ids.join(',')); if (alive) setPics((p) => ({ ...p, ...got })); } catch { /* pictures are optional */ }
      }
    })();
    return () => { alive = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return pics;
}

/** The picture to show for a word: the teacher's own first, then the found one. */
export const pictureOf = (w, pics) => (w?.image_url ? { url: w.image_url } : pics?.[w?.id] || null);
