/** Decode JWT payload (no signature verification — client-side expiry hints only). */
export const parseJwtPayload = (token) => {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    return JSON.parse(window.atob(padded));
  } catch {
    return null;
  }
};

/** Unix seconds when the token expires, or null if unknown / no exp claim. */
export const getTokenExpSeconds = (token) => {
  const payload = parseJwtPayload(token);
  if (!payload?.exp) return null;
  const exp = Number(payload.exp);
  return Number.isFinite(exp) ? exp : null;
};

export const getTokenExpiresAtMs = (token) => {
  const exp = getTokenExpSeconds(token);
  return exp != null ? exp * 1000 : null;
};

/** Milliseconds until expiry; null if unknown; negative if already expired. */
export const msUntilTokenExpiry = (token) => {
  const at = getTokenExpiresAtMs(token);
  if (at == null) return null;
  return at - Date.now();
};

export const isTokenValid = (token) => {
  if (!token) return false;
  const payload = parseJwtPayload(token);
  if (!payload) return false;
  if (!payload.exp) return true;
  const currentTime = Math.floor(Date.now() / 1000);
  return Number(payload.exp) > currentTime;
};

const normalizeClientCode = (value) =>
  String(value ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();

const collectPayloadValues = (payload, depth = 0) => {
  if (!payload || typeof payload !== 'object' || depth > 2) return [];
  const values = [];
  Object.values(payload).forEach((value) => {
    if (value && typeof value === 'object') {
      values.push(...collectPayloadValues(value, depth + 1));
      return;
    }
    values.push(value);
  });
  return values;
};

/** Prefer an LS000000-style client code from a login token or stored user info. */
export const readClientCodeFromPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return '';
  const ranked = [
    payload.ClientCode,
    payload.clientCode,
    payload.clientcode,
    payload.client_code,
    payload.ClientId,
    payload.clientId,
    ...collectPayloadValues(payload),
    payload.sub,
  ];
  const normalized = ranked.map(normalizeClientCode).filter(Boolean);
  return normalized.find((code) => /^LS\d{3,}$/.test(code)) || '';
};
