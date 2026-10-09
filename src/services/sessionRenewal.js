import axios from 'axios';
import { getAuthLoginUrl } from './authApiConfig';
import { isTokenValid, parseJwtPayload } from '../utils/jwtSession';

const SAVED_LOGIN_CREDENTIALS_KEY = 'savedLoginCredentials';

let renewInFlight = null;

const buildUserInfoFromToken = (token, loginName) => {
  const tokenPayload = parseJwtPayload(token);
  if (!tokenPayload) throw new Error('Invalid token');
  const userInfo = {
    Username: loginName,
    ClientCode: tokenPayload.ClientCode || tokenPayload.clientcode || tokenPayload.sub,
  };
  if (!userInfo.ClientCode) throw new Error('Client code not found in token');
  return userInfo;
};

/**
 * Re-login with stored "Remember me" credentials to obtain a fresh JWT.
 * Returns true when a new token was stored.
 */
export const tryRenewUserSession = async () => {
  if (renewInFlight) return renewInFlight;

  renewInFlight = (async () => {
    const existing = localStorage.getItem('token');
    if (!existing || !isTokenValid(existing)) return false;

    const raw = localStorage.getItem(SAVED_LOGIN_CREDENTIALS_KEY);
    if (!raw) return false;

    let creds;
    try {
      creds = JSON.parse(raw);
    } catch {
      return false;
    }

    const loginName = String(creds?.LoginName ?? '').trim();
    const password = String(creds?.Password ?? '');
    if (!loginName || !password) return false;

    try {
      const response = await axios.post(
        getAuthLoginUrl(),
        { LoginName: loginName, Password: password },
        { skipAuthRedirect: true }
      );
      const newToken = response.data?.Token;
      if (!newToken || !isTokenValid(newToken)) return false;

      const userInfo = buildUserInfoFromToken(newToken, loginName);
      localStorage.setItem('token', newToken);
      localStorage.setItem('userInfo', JSON.stringify(userInfo));
      return true;
    } catch {
      return false;
    }
  })();

  try {
    return await renewInFlight;
  } finally {
    renewInFlight = null;
  }
};

export const hasSavedLoginCredentials = () => {
  try {
    const raw = localStorage.getItem(SAVED_LOGIN_CREDENTIALS_KEY);
    if (!raw) return false;
    const creds = JSON.parse(raw);
    return Boolean(String(creds?.LoginName ?? '').trim() && String(creds?.Password ?? ''));
  } catch {
    return false;
  }
};
