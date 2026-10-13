import { getRrgoldApiBaseUrl, getSoniApiBaseUrl } from './apiBaseConfig';

/**
 * Password login host (ProductMaster). Override: REACT_APP_AUTH_API_BASE_URL.
 */
export const getAuthApiBaseUrl = () =>
  (process.env.REACT_APP_AUTH_API_BASE_URL || getSoniApiBaseUrl()).replace(/\/$/, '');

/**
 * ProductMaster inventory APIs (label stock list, delete stock, etc.).
 * Uses RRGOLD base by mode — not Soni. Override: REACT_APP_PRODUCT_MASTER_API_BASE_URL.
 */
export const getProductMasterApiBaseUrl = () =>
  (process.env.REACT_APP_PRODUCT_MASTER_API_BASE_URL || getRrgoldApiBaseUrl()).replace(/\/$/, '');

export const getAuthLoginUrl = () => `${getAuthApiBaseUrl()}/api/ProductMaster/AuthLogin`;
export const getAuthForgotPasswordUrl = () => `${getAuthApiBaseUrl()}/api/ProductMaster/AuthForgotPassword`;

/** Preferred: same naming style as DeleteAllStockForClient. */
export const getDeleteAllStockForBranchUrl = () =>
  `${getProductMasterApiBaseUrl()}/api/ProductMaster/DeleteAllStockForBranch`;

/** DELETE …/DeleteStockForClientByBranch?ClientCode=&BranchName= */
export const getDeleteStockForClientByBranchUrl = () =>
  `${getProductMasterApiBaseUrl()}/api/ProductMaster/DeleteStockForClientByBranch`;

/**
 * DELETE …/DeleteAllStockForClient?ClientCode={code}
 * Label Stock List “delete all” — documented in API Docs & Postman (RRGold).
 */
export const getDeleteAllStockForClientUrl = () =>
  `${getProductMasterApiBaseUrl()}/api/ProductMaster/DeleteAllStockForClient`;

/**
 * Local ASP.NET Kestrel default for /api/auth/fingerprint/* and /api/auth/passkey/*.
 * Override: REACT_APP_FINGERPRINT_API_BASE_URL / REACT_APP_PASSKEY_API_BASE_URL
 * (e.g. production: https://soni.loyalstring.co.in).
 */
const DEFAULT_LOCAL_AUTH_API_BASE = 'https://localhost:7095';

/** Fingerprint APIs (/api/auth/fingerprint/*). */
export const getFingerprintApiBaseUrl = () =>
  (process.env.REACT_APP_FINGERPRINT_API_BASE_URL || DEFAULT_LOCAL_AUTH_API_BASE).replace(/\/$/, '');

/** Passkey APIs (/api/auth/passkey/*). */
export const getPasskeyApiBaseUrl = () =>
  (process.env.REACT_APP_PASSKEY_API_BASE_URL || DEFAULT_LOCAL_AUTH_API_BASE).replace(/\/$/, '');

/** Face auth APIs (/api/auth/face/*). */
export const getFaceAuthApiBaseUrl = () =>
  (process.env.REACT_APP_FACE_AUTH_API_BASE_URL || getAuthApiBaseUrl()).replace(/\/$/, '');
