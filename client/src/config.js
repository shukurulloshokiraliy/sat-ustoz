import { api } from './api.js';

/** Public runtime config from the server (Google client ID, prices, bot). Cached for the session. */
let cfgPromise;
export const getConfig = () => (cfgPromise ||= api.get('/config').catch(() => ({ google: false })));
