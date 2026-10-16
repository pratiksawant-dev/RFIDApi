import React from 'react';
import { FaSyncAlt, FaWifi } from 'react-icons/fa';
import { getUserErrorMessage, getUserErrorTitle } from '../../utils/userErrorMessage';

const NetworkErrorState = ({ error, onRetry, variant = 'page' }) => {
  const title = getUserErrorTitle(error);
  const message = getUserErrorMessage(error);
  const page = variant !== 'inline';

  return (
    <div className={`app-net-error${page ? ' is-page' : ' is-inline'}`} role="alert">
      <span className="app-net-error-icon" aria-hidden="true">
        <FaWifi />
      </span>
      <div className="app-net-error-copy">
        <strong>{title}</strong>
        <p>{message}</p>
      </div>
      {typeof onRetry === 'function' ? (
        <button type="button" className="app-net-error-retry" onClick={onRetry}>
          <FaSyncAlt />
          Retry
        </button>
      ) : null}
    </div>
  );
};

export default NetworkErrorState;
