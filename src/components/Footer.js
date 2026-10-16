import React from 'react';

const Footer = () => {
  return (
    <footer style={{
      background: '#fff',
      padding: '0.75rem 0',
      borderTop: '1px solid rgba(0, 0, 0, 0.05)',
      marginTop: 'auto',
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 1000
    }}>
      <div className="container-fluid">
        <div className="d-flex justify-content-center align-items-center">
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            color: '#666'
          }}>
           
            <span style={{
              fontSize: '13px',
              color: '#71717A'
            }}>© {new Date().getFullYear()} Loyalstring Pvt Ltd. All rights reserved.</span>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer; 
