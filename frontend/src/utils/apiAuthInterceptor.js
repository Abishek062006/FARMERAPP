import axios from 'axios';
import { auth } from './firebase';
import { API_URL } from './config';

// Attaches the logged-in user's Firebase ID token to every request this app
// makes to its OWN backend (fetch() and axios alike), in one place, instead
// of touching every screen/util that calls the API. Requests to anything
// else (OpenRouter, OpenWeather's own CDN, etc.) are left untouched so this
// never leaks our token to a third party or clobbers their own auth header.
//
// Import this once, for its side effects, before the app renders.

const originalFetch = global.fetch;

global.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input?.url;

  if (url && url.startsWith(API_URL) && auth.currentUser) {
    try {
      const token = await auth.currentUser.getIdToken();
      init = {
        ...init,
        headers: {
          ...(init.headers || {}),
          Authorization: `Bearer ${token}`,
        },
      };
    } catch (error) {
      console.error('⚠️ Failed to attach auth token to request:', error);
    }
  }

  return originalFetch(input, init);
};

axios.interceptors.request.use(async (config) => {
  if (config.url && config.url.startsWith(API_URL) && auth.currentUser) {
    try {
      const token = await auth.currentUser.getIdToken();
      config.headers = { ...config.headers, Authorization: `Bearer ${token}` };
    } catch (error) {
      console.error('⚠️ Failed to attach auth token to request:', error);
    }
  }
  return config;
});
