/** Decode JWT payload (no signature verification — client-side expiry hints only). */
export const parseJwtPayload = (token) => {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(window.atob(base64));
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
