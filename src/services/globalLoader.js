import axios from 'axios';

let show = () => {};
let hide = () => {};
let pending = 0;
let showTimer = null;
let patchedCreate = false;

export const bindGlobalLoader = (handlers = {}) => {
  show = typeof handlers.show === 'function' ? handlers.show : () => {};
  hide = typeof handlers.hide === 'function' ? handlers.hide : () => {};
  if (pending > 0) show();
  else hide();
};

const shouldSkipLoader = (url, config = {}) => {
  if (config.skipGlobalLoader) return true;
  const u = String(url || config.url || '').toLowerCase();
  if (!u) return false;
  if (
    u.startsWith('blob:') ||
    u.startsWith('data:') ||
    u.startsWith('file:') ||
    u.startsWith('chrome-extension:')
  ) {
    return true;
  }
  return (
    u.includes('/logo/') ||
    u.includes('/locales/') ||
    u.includes('/static/') ||
    u.includes('livemetal') ||
    u.includes('metalprice') ||
    u.includes('goldrate') ||
    u.includes('goldpricez') ||
    u.includes('freegoldprice') ||
    u.includes('exchangerate') ||
    u.includes('ticker') ||
    u.includes('notification') ||
    u.includes('filewatcher') ||
    u.includes('/health') ||
    u.includes('hot-update') ||
    u.includes('sockjs') ||
    u.includes('webpack') ||
    u.endsWith('.png') ||
    u.endsWith('.svg') ||
    u.endsWith('.jpg') ||
    u.endsWith('.jpeg') ||
    u.endsWith('.webp') ||
    u.endsWith('.gif') ||
    u.endsWith('.ico') ||
    u.endsWith('.prn') ||
    u.endsWith('.map')
  );
};

export const beginGlobalLoader = (url, config) => {
  if (shouldSkipLoader(url, config)) return false;
  pending += 1;
  if (pending === 1) {
    showTimer = setTimeout(() => {
      show();
    }, 280);
  }
  return true;
};

export const endGlobalLoader = (started) => {
  if (!started) return;
  pending = Math.max(0, pending - 1);
  if (pending === 0) {
    if (showTimer) {
      clearTimeout(showTimer);
      showTimer = null;
    }
    hide();
  }
};

export const attachGlobalLoader = (client) => {
  if (!client?.interceptors || client.__sparkleLoaderAttached) return;
  client.__sparkleLoaderAttached = true;

  client.interceptors.request.use(
    (config) => {
      config.__sparkleLoader = beginGlobalLoader(config?.url, config);
      return config;
    },
    (error) => {
      endGlobalLoader(error?.config?.__sparkleLoader);
      return Promise.reject(error);
    }
  );

  client.interceptors.response.use(
    (response) => {
      endGlobalLoader(response?.config?.__sparkleLoader);
      return response;
    },
    (error) => {
      endGlobalLoader(error?.config?.__sparkleLoader);
      return Promise.reject(error);
    }
  );
};

export const installGlobalLoader = () => {
  attachGlobalLoader(axios);
  if (patchedCreate || typeof axios.create !== 'function') return;
  patchedCreate = true;
  const originalCreate = axios.create.bind(axios);
  axios.create = (...args) => {
    const instance = originalCreate(...args);
    attachGlobalLoader(instance);
    return instance;
  };
};

installGlobalLoader();
