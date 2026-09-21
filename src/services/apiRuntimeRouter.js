import axios from 'axios';
import { getRrgoldApiBaseUrl, getSoniApiBaseUrl } from './apiBaseConfig';
import { attachGlobalLoader, beginGlobalLoader, endGlobalLoader } from './globalLoader';

const SONI_HOSTS = ['https://soni.loyalstring.co.in'];
const RRGOLD_HOSTS = ['https://rrgold.loyalstring.co.in'];
/** Default offline RRGOLD host — remap to active base when mode or user settings change */
const OFFLINE_RRGOLD_HOSTS = ['http://localhost:8081'];

const safeParseUrl = (value) => {
  try {
    return new URL(String(value || ''));
  } catch {
    return null;
  }
};

const configuredOrigin = (baseUrl) => safeParseUrl(baseUrl)?.origin || '';

const mapKnownHost = (host) => {
  if (SONI_HOSTS.includes(host)) return getSoniApiBaseUrl();
  if (RRGOLD_HOSTS.includes(host)) return getRrgoldApiBaseUrl();
  if (OFFLINE_RRGOLD_HOSTS.includes(host)) return getRrgoldApiBaseUrl();
  return '';
};

export const remapApiUrl = (rawUrl) => {
  const parsed = safeParseUrl(rawUrl);
  if (!parsed) return rawUrl;

  // NEVER rewrite localhost, 127.0.0.1, or port 7095 to rrgold
  if (
    parsed.hostname === 'localhost' ||
    parsed.hostname === '127.0.0.1' ||
    parsed.port === '7095' ||
    parsed.host === 'localhost:7095'
  ) {
    return rawUrl;
  }

  // Stock taking APIs must strictly stay on their target host
  if (
    parsed.pathname.includes('GetBranchAddresses') ||
    parsed.pathname.includes('GetStockTakingMatchedList') ||
    parsed.pathname.includes('GetStockTakingUnmatchedList')
  ) {
    return rawUrl;
  }

  const rrgoldOrigin = configuredOrigin(getRrgoldApiBaseUrl());
  const soniOrigin = configuredOrigin(getSoniApiBaseUrl());
  // URL already targets saved offline/online Soni or RRGOLD base — do not rewrite.
  if (rrgoldOrigin && parsed.origin === rrgoldOrigin) return rawUrl;
  if (soniOrigin && parsed.origin === soniOrigin) return rawUrl;

  // These paths keep the request host as built (e.g. Sample on dedicated host).
  if (parsed.pathname.includes('/api/Sample/')) return rawUrl;
  if (parsed.pathname.includes('/api/RFIDDashboard/')) return rawUrl;

  const mappedBase = mapKnownHost(parsed.origin);
  if (!mappedBase) return rawUrl;
  return `${mappedBase}${parsed.pathname}${parsed.search}${parsed.hash}`;
};

let initialized = false;

export const setupApiRuntimeRouter = () => {
  if (initialized) return;
  initialized = true;

  axios.interceptors.request.use((config) => {
    if (typeof config?.url === 'string') {
      return { ...config, url: remapApiUrl(config.url) };
    }
    return config;
  });

  attachGlobalLoader(axios);

  if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, init = {}) => {
      const url = typeof input === 'string' ? input : input?.url;
      const { skipGlobalLoader, ...fetchInit } = init || {};
      const started = beginGlobalLoader(url, { ...fetchInit, skipGlobalLoader });
      const request = typeof input === 'string'
        ? nativeFetch(remapApiUrl(input), fetchInit)
        : input instanceof Request
          ? nativeFetch(new Request(remapApiUrl(input.url), input), fetchInit)
          : nativeFetch(input, fetchInit);
      return Promise.resolve(request).finally(() => endGlobalLoader(started));
    };
  }
};

