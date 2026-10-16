const NETWORK_MESSAGE = 'The server could not be reached. Check your internet connection, then try again.';
const TIMEOUT_MESSAGE = 'The server took too long to respond. Check your connection and try again.';
const SERVER_MESSAGE = 'The server had a problem completing this request. Try again shortly.';

const readServerText = (data) => {
  if (!data) return '';
  if (typeof data === 'string') {
    const text = data.trim();
    if (!text || text.length > 240 || text.startsWith('<')) return '';
    return text;
  }
  const raw = data.message || data.Message || data.error || data.Error || data.title || '';
  return typeof raw === 'string' ? raw.trim() : '';
};

export const isNetworkError = (error) => {
  if (!error) return false;
  if (typeof error === 'string') {
    return /network error|failed to fetch|internet connection|could not be reached/i.test(error);
  }
  const code = String(error.code || '');
  const raw = String(error.rawMessage || error.message || '');
  if (code === 'ERR_NETWORK' || code === 'ENOTFOUND' || code === 'ECONNREFUSED' || code === 'ERR_INTERNET_DISCONNECTED') {
    return true;
  }
  if (/^network error$/i.test(raw) || /failed to fetch/i.test(raw)) return true;
  return !error.response && /network/i.test(raw);
};

export const isTimeoutError = (error) => {
  if (!error || typeof error === 'string') return /too long to respond|timeout/i.test(String(error || ''));
  const raw = String(error.rawMessage || error.message || '');
  return error.code === 'ECONNABORTED' || /timeout/i.test(raw);
};

export const getUserErrorMessage = (error, fallback = 'Something went wrong. Please try again.') => {
  if (!error) return fallback;
  if (typeof error === 'string') {
    if (/^network error$/i.test(error.trim())) return NETWORK_MESSAGE;
    return error;
  }
  if (error.userMessage && !/^network error$/i.test(error.userMessage)) return error.userMessage;

  if (isTimeoutError(error)) return TIMEOUT_MESSAGE;
  if (isNetworkError(error)) return NETWORK_MESSAGE;

  const status = error.response?.status;
  const serverText = readServerText(error.response?.data);
  if (status === 401) return 'Your session has expired. Sign in again to continue.';
  if (status === 403) return 'You do not have permission to open this.';
  if (status === 404) return serverText || 'This information could not be found.';
  if (status >= 500) return SERVER_MESSAGE;
  if (serverText && !/^network error$/i.test(serverText)) return serverText;
  return fallback;
};

export const getUserErrorTitle = (error) => {
  const message = getUserErrorMessage(error);
  if (/could not be reached|internet connection/i.test(message)) return 'Connection problem';
  if (/too long to respond/i.test(message)) return 'Request timed out';
  if (/server had a problem/i.test(message)) return 'Server problem';
  if (/session has expired/i.test(message)) return 'Session expired';
  if (/do not have permission/i.test(message)) return 'Access denied';
  if (/could not be found/i.test(message)) return 'Not found';
  return 'Couldn’t load this';
};

export const applyUserErrorMessage = (error) => {
  if (!error || typeof error !== 'object' || error.userMessage) return error;
  const raw = String(error.message || '');
  error.rawMessage = error.rawMessage || raw;
  const friendly = getUserErrorMessage(error);
  error.userMessage = friendly;
  if (/^network error$/i.test(raw) || isNetworkError(error) || isTimeoutError(error)) {
    error.message = friendly;
  }
  return error;
};
