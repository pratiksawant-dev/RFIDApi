import React from 'react';
import { FaCloud, FaDesktop } from 'react-icons/fa';
import { getApiMode, getRrgoldApiBaseUrl, getSoniApiBaseUrl } from '../../services/apiBaseConfig';

/** Shown in Electron screens so users know Online vs Offline EXE behavior. */
const ExeApiModeBanner = ({ compact = false, variant = 'default' }) => {
  if (typeof window === 'undefined' || !window.electronAPI) return null;

  const isOffline = getApiMode() === 'offline';
  const label = isOffline ? 'Offline EXE' : 'Online EXE';
  const apiHint = isOffline
    ? `Local APIs · RRGOLD ${getRrgoldApiBaseUrl()} · Soni ${getSoniApiBaseUrl()}`
    : 'Cloud APIs · loyalstring.co.in';

  if (variant === 'strip') {
    return (
      <div className={`exe-mode-strip${isOffline ? ' is-offline' : ''}`}>
        <span className="exe-mode-strip-live">
          <FaDesktop />
          {label}
        </span>
        <span className="exe-mode-strip-divider" aria-hidden="true" />
        <span className="exe-mode-strip-hint">
          <FaCloud />
          {apiHint}
        </span>
      </div>
    );
  }

  if (compact) {
    return (
      <span
        title={apiHint}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '4px 10px',
          borderRadius: 999,
          fontSize: 11,
          fontWeight: 700,
          background: isOffline ? '#fef3c7' : '#dbeafe',
          color: isOffline ? '#92400e' : '#1e40af',
          border: `1px solid ${isOffline ? '#fcd34d' : '#93c5fd'}`,
        }}
      >
        {label}
      </span>
    );
  }

  return (
    <div
      style={{
        marginBottom: 12,
        padding: '10px 14px',
        borderRadius: 10,
        fontSize: 12,
        lineHeight: 1.45,
        background: isOffline ? '#fffbeb' : '#eff6ff',
        border: `1px solid ${isOffline ? '#fde68a' : '#bfdbfe'}`,
        color: isOffline ? '#78350f' : '#1e3a8a',
      }}
    >
      <strong>{label}</strong>
      <span style={{ marginLeft: 8, fontWeight: 500 }}>{apiHint}</span>
      {isOffline ? (
        <span style={{ display: 'block', marginTop: 4, fontSize: 11, opacity: 0.85 }}>
          Configure server URLs from Profile → Offline API settings after login.
        </span>
      ) : null}
    </div>
  );
};

export default ExeApiModeBanner;
