import React from 'react';

const defaultBar = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  marginBottom: 0,
  padding: '0 0 12px 0',
  borderBottom: '1px solid #e5e7eb',
};

/**
 * Shared page title row: title, optional subtitle, optional actions.
 * No icon — keep this text-only so every page looks the same.
 */
const PageHeader = ({
  title,
  subtitle,
  barStyle,
  actions,
  className = '',
}) => {
  return (
    <div className={`app-page-header ${className}`.trim()} style={{ ...defaultBar, ...barStyle }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flex: '1 1 auto',
          minWidth: 0,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h1 className="app-page-title">
            {title}
          </h1>
          {subtitle ? <div className="app-page-subtitle" style={{ marginTop: 2 }}>{subtitle}</div> : null}
        </div>
      </div>
      {actions != null ? (
        <div className="app-page-header-actions">
          {actions}
        </div>
      ) : null}
    </div>
  );
};

export default PageHeader;
