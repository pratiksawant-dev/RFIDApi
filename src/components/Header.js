import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import {
  FaHome,
  FaPlug,
  FaList,
  FaMicrochip,
  FaTags,
  FaTag,
  FaClipboard,
  FaUpload,
  FaUserCircle,
  FaBell,
  FaCog,
  FaSignOutAlt,
  FaSearch,
  FaTachometerAlt,
  FaRegBell,
  FaDatabase,
  FaMobileAlt,
  FaDownload,
  FaFileInvoice,
  FaChevronDown,
  FaPrint,
  FaExpand,
  FaCompress,
  FaBook,
  FaSync
} from 'react-icons/fa';
import { useNotifications } from '../context/NotificationContext';
import { useTranslation } from '../hooks/useTranslation';
import axios from 'axios';
import RFIDAppDownload from './RFIDAppDownload';
import apkService from '../services/apkService';
import BrandLogo from './common/BrandLogo';

const Header = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userInfo, setUserInfo] = useState({});
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupError, setBackupError] = useState('');
  const [showRFIDDownload, setShowRFIDDownload] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const dropdownRef = useRef(null);
  const notificationsRef = useRef(null);
  const { notifications, addNotification } = useNotifications();

  useEffect(() => {
    // Fetch user info from localStorage
    try {
      const stored = localStorage.getItem('userInfo');
      if (stored) {
        setUserInfo(JSON.parse(stored));
      }
    } catch (err) {
      setUserInfo({});
    }
  }, []);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(event.target)) {
        setNotificationsOpen(false);
      }

    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close dropdowns on route change
  useEffect(() => {
    setDropdownOpen(false);
    setNotificationsOpen(false);
    setMobileNavOpen(false);
    setMobileMenuOpen(false);
  }, [location.pathname]);

  // Fullscreen functionality
  useEffect(() => {
    const checkFullscreen = () => {
      const isFull = !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement
      );
      setIsFullscreen(isFull);
    };

    const handleFullscreenChange = () => {
      checkFullscreen();
    };

    // Check initial state
    checkFullscreen();

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = useCallback(() => {
    const isCurrentlyFullscreen = !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement
    );

    if (!isCurrentlyFullscreen) {
      // Enter fullscreen
      const element = document.documentElement;
      if (element.requestFullscreen) {
        element.requestFullscreen().catch(err => {
          console.log('Error attempting to enable fullscreen:', err);
        });
      } else if (element.webkitRequestFullscreen) {
        element.webkitRequestFullscreen();
      } else if (element.mozRequestFullScreen) {
        element.mozRequestFullScreen();
      } else if (element.msRequestFullscreen) {
        element.msRequestFullscreen();
      }
    } else {
      // Exit fullscreen
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      } else if (document.mozCancelFullScreen) {
        document.mozCancelFullScreen();
      } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
      }
    }
  }, []);

  // Keyboard shortcut for fullscreen (Ctrl+F)
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Check for Ctrl+F or Cmd+F (Mac) - prevent default browser find behavior
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault(); // Prevent browser's find function
        toggleFullscreen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [toggleFullscreen]);

  const headerStyles = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    background: '#ffffff',
    zIndex: 1000,
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.08)',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: 'Inter, Poppins, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    borderBottom: '1px solid #e0e7ef',
  };

  const topBarStyles = {
    borderBottom: '1px solid #f1f5f9',
    padding: '12px 24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: '#ffffff',
    minHeight: '64px',
    flexWrap: 'wrap',
    gap: '16px',
  };

  const navigationStyles = {
    padding: '0 20px',
    background: 'transparent',
    borderBottom: '1px solid #f3f4f6',
    height: '44px',
    display: 'flex',
    alignItems: 'center',
    overflowX: 'auto',
    WebkitOverflowScrolling: 'touch',
    msOverflowStyle: '-ms-autohiding-scrollbar',
    scrollbarWidth: 'none',
  };

  const navItemStyles = {
    color: '#6b7280',
    fontSize: '12px',
    fontWeight: 500,
    padding: '12px 14px',
    textDecoration: 'none',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    borderBottom: '2px solid transparent',
    whiteSpace: 'nowrap',
    minWidth: 'fit-content',
    flexShrink: 0,
    position: 'relative',
    borderRadius: '0',
    marginRight: '0',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    letterSpacing: '0.025em',
  };

  const activeNavItemStyles = {
    ...navItemStyles,
    color: '#2563eb',
    borderBottom: '2px solid #2563eb',
    fontWeight: 600,
    background: 'rgba(37, 99, 235, 0.04)',
  };

  // Updated navigation items with separate Invoice Stock menu
  const navigationItems = [
    { path: '/analytics', icon: FaTachometerAlt, label: t('navigation.analytics'), color: '#10b981' },
    { path: '/dashboard', icon: FaHome, label: t('navigation.rfidApi'), color: '#3b82f6' },
    { path: '/api-documentation', icon: FaBook, label: 'RFID API Third Party Integration', color: '#9333ea' },
    { path: '/rfid-integration', icon: FaPlug, label: t('navigation.rfidIntegration'), color: '#8b5cf6' },
    { path: '/label-stock', icon: FaList, label: t('navigation.labelStock'), color: '#f59e0b' },
    { path: '/invoice-stock', icon: FaFileInvoice, label: t('navigation.invoiceStock'), color: '#dc2626' },
    { path: '/rfid-label', icon: FaPrint, label: t('navigation.rfidLabel'), color: '#667eea' },
    { path: '/rfid-devices', icon: FaMicrochip, label: t('navigation.rfidDevices'), color: '#ec4899' },
    { path: '/rfid-tags', icon: FaTags, label: t('navigation.rfidTags'), color: '#ef4444' },
    { path: '/tag-usage', icon: FaTag, label: t('navigation.tagUsage'), color: '#06b6d4' },
    { path: '/stock-verification', icon: FaClipboard, label: t('navigation.stockVerification'), color: '#84cc16' },
    { path: '/upload-rfid', icon: FaUpload, label: t('navigation.uploadEpcData'), color: '#6366f1' },
  ];

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userInfo');
    localStorage.removeItem('lastLoginTime');
    localStorage.removeItem('showWelcomeToast');
    sessionStorage.clear();
    navigate('/login', { replace: true });
  };

  // Extract user info fields
  const username = userInfo.Username || userInfo.UserName || userInfo.name || 'User';
  const clientCode = userInfo.ClientCode || userInfo.clientcode || userInfo.clientCode || 'N/A';
  const tcode = userInfo.TCode || userInfo.tcode || userInfo.TCODE || '';
  const avatarLetter = username ? username[0].toUpperCase() : 'U';

  // Helper function for relative time
  function formatRelativeTime(date) {
    const now = new Date();
    const diff = Math.floor((now - new Date(date)) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} minute${Math.floor(diff / 60) === 1 ? '' : 's'} ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hour${Math.floor(diff / 3600) === 1 ? '' : 's'} ago`;
    return `${Math.floor(diff / 86400)} day${Math.floor(diff / 86400) === 1 ? '' : 's'} ago`;
  }

  // Utility to trigger file download from blob
  const downloadFile = (blob, fileName) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }, 100);
  };

  const handleBackup = async () => {
    setBackupLoading(true);
    setBackupError('');
    try {
      const code = clientCode || (userInfo && (userInfo.ClientCode || userInfo.clientCode || userInfo.clientcode)) || 'N/A';
      const response = await axios.post(
        'https://rrgold.loyalstring.co.in/api/LabelledStockTransfer/DownloadServerBackup',
        { ClientCode: code },
        { responseType: 'blob' }
      );
      let fileName = 'backup.bak';
      const disposition = response.headers['content-disposition'];
      if (disposition && disposition.indexOf('filename=') !== -1) {
        fileName = disposition.split('filename=')[1].replace(/['"]/g, '').trim();
      }
      downloadFile(response.data, fileName);
      setShowBackupModal(false);
      addNotification({
        title: 'Backup Downloaded',
        description: 'Backup file has been downloaded successfully.',
        type: 'success',
      });
    } catch (err) {
      if (err.message && err.message.includes('Network Error')) {
        setBackupError('Network error: Unable to reach the backup server. Please check your connection or CORS policy.');
        addNotification({
          title: 'Backup Failed',
          description: 'Network error: Unable to reach the backup server. Please check your connection or CORS policy.',
          type: 'error',
        });
      } else if (err.response?.data?.error) {
        setBackupError(err.response.data.error);
        addNotification({
          title: 'Backup Failed',
          description: err.response.data.error,
          type: 'error',
        });
      } else {
        setBackupError(err.message || 'Backup failed.');
        addNotification({
          title: 'Backup Failed',
          description: err.message || 'Backup failed.',
          type: 'error',
        });
      }
    } finally {
      setBackupLoading(false);
    }
  };



  return (
    <header className="header-ltr" style={headerStyles}>
      <div className="header-topbar" style={topBarStyles}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
          flexWrap: 'wrap',
          flex: '1',
          minWidth: 0
        }}>
          <Link to="/analytics" style={{ display: 'flex', alignItems: 'center', flexShrink: 0, cursor: 'pointer', textDecoration: 'none' }}>
            <BrandLogo height={36} />
          </Link>
          {/* Zoho-style app title */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: '#f1f5f9',
            borderRadius: '8px',
            border: '1px solid #e0e7ef',
            padding: '8px 14px',
            fontFamily: 'Inter, Poppins, sans-serif',
            fontWeight: 600,
            fontSize: '13px',
            color: '#0077d4',
            letterSpacing: '0.01em',
            flexShrink: 0,
            transition: 'all 0.2s ease'
          }}>
            <div style={{
              width: '14px',
              height: '14px',
              borderRadius: '3px',
              background: '#0077d4',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none">
                <path d="M3 3h18v18H3V3zm2 2v14h14V5H5z" fill="white" />
                <path d="M7 7h10v2H7V7zm0 4h10v2H7v-2zm0 4h6v2H7v-2z" fill="white" />
              </svg>
            </div>
            <span style={{ whiteSpace: 'nowrap' }}>RFID Dashboard</span>
          </div>
          {/* Modern search bar */}
          <div className="header-search-container" style={{
            background: '#ffffff',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            padding: '5px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            minWidth: '180px',
            maxWidth: '280px',
            flex: '1',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            transition: 'border-color 0.2s ease',
            width: '100%',
            boxSizing: 'border-box',
          }}>
            <FaSearch style={{ color: '#9ca3af', fontSize: '12px', flexShrink: 0 }} />
            <input
              type="text"
              placeholder={t('header.searchPlaceholder')}
              style={{
                border: 'none',
                outline: 'none',
                fontSize: '12px',
                width: '100%',
                color: '#374151',
                background: 'transparent',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                minWidth: 0,
              }}
            />
          </div>
        </div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexShrink: 0
        }}>
          {/* Fullscreen Toggle */}
          <button
            onClick={toggleFullscreen}
            style={{
              background: 'transparent',
              border: 'none',
              padding: '8px',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#64748b'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#f1f5f9';
              e.currentTarget.style.color = '#0077d4';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = '#64748b';
            }}
            title={isFullscreen ? 'Exit Fullscreen (Ctrl+F)' : 'Enter Fullscreen (Ctrl+F)'}
          >
            {isFullscreen ? (
              <FaCompress style={{ fontSize: '18px' }} />
            ) : (
              <FaExpand style={{ fontSize: '18px' }} />
            )}
          </button>

          {/* Notifications */}
          <div ref={notificationsRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setNotificationsOpen(!notificationsOpen)}
              style={{
                background: 'transparent',
                border: 'none',
                padding: '8px',
                borderRadius: '8px',
                cursor: 'pointer',
                position: 'relative',
                transition: 'all 0.2s ease',
                boxShadow: notificationsOpen ? '0 0 0 2px rgba(0, 119, 212, 0.2)' : 'none',
                color: '#64748b'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#f1f5f9';
                e.currentTarget.style.color = '#0077d4';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = '#64748b';
              }}
            >
              <FaRegBell style={{ fontSize: '18px' }} />
              <span style={{
                position: 'absolute',
                top: '6px',
                right: '6px',
                width: '8px',
                height: '8px',
                background: '#22c55e',
                borderRadius: '50%',
                border: '2px solid #fff',
              }} />
            </button>
            {notificationsOpen && (
              <div style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                right: '-16px',
                background: '#ffffff',
                borderRadius: '12px',
                boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15)',
                border: '1px solid #e2e8f0',
                width: '320px',
                zIndex: 1000,
                animation: 'slideDown 0.2s ease',
              }}>
                <div style={{
                  padding: '16px',
                  borderBottom: '1px solid #e2e8f0',
                }}>
                  <h3 style={{
                    margin: 0,
                    fontSize: '16px',
                    fontWeight: '600',
                    color: '#1e293b',
                  }}>
                    {t('header.notifications')}
                  </h3>
                </div>
                <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                  {notifications.length === 0 ? (
                    <div style={{ padding: '20px', color: '#64748b', fontSize: 14, textAlign: 'center' }}>{t('header.noNotifications')}</div>
                  ) : notifications.slice(0, 5).map((notif, idx) => (
                    <div key={notif.id} style={{ borderBottom: idx !== notifications.length - 1 ? '1px solid #f1f5f9' : 'none', padding: '16px' }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: '#1e293b' }}>{notif.title}</div>
                      <div style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0 0' }}>{notif.description}</div>
                      <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>{formatRelativeTime(notif.timestamp)}</div>
                    </div>
                  ))}
                </div>
                <div style={{
                  padding: '12px 16px',
                  borderTop: '1px solid #e2e8f0',
                  textAlign: 'center',
                }}>
                  <button
                    onClick={() => { }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#3b82f6',
                      fontSize: '14px',
                      cursor: 'pointer',
                      padding: '0',
                      fontWeight: 500,
                    }}
                  >
                    {t('header.viewAllNotifications')}
                  </button>
                </div>
              </div>
            )}
          </div>
          {/* Zoho-style User Profile */}
          <div ref={dropdownRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              style={{
                background: '#ffffff',
                border: '1px solid #e0e7ef',
                padding: '6px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                cursor: 'pointer',
                borderRadius: '8px',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
                minWidth: 0,
                transition: 'all 0.2s ease',
                position: 'relative',
                outline: 'none',
                fontFamily: 'Inter, Poppins, sans-serif'
              }}
              onMouseOver={e => {
                e.currentTarget.style.boxShadow = '0 2px 6px rgba(0, 119, 212, 0.15)';
                e.currentTarget.style.borderColor = '#0077d4';
              }}
              onMouseOut={e => {
                e.currentTarget.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.05)';
                e.currentTarget.style.borderColor = '#e0e7ef';
              }}
            >
              <div style={{
                position: 'relative',
                marginRight: 0,
              }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#0077d4',
                  color: '#ffffff',
                  borderRadius: '8px',
                  fontSize: '15px',
                  fontWeight: '600',
                  border: '2px solid #fff',
                  position: 'relative',
                  zIndex: 2,
                  boxShadow: '0 2px 4px rgba(0, 119, 212, 0.2)',
                }}>
                  {avatarLetter}
                </div>
                <span style={{
                  position: 'absolute',
                  top: '-2px',
                  right: '-2px',
                  width: '10px',
                  height: '10px',
                  background: '#22c55e',
                  border: '2px solid #fff',
                  borderRadius: '50%',
                  display: 'inline-block',
                  boxShadow: '0 0 0 1px #e0e7ef',
                  zIndex: 3,
                }}></span>
              </div>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                minWidth: 0,
                textAlign: 'left',
                paddingRight: 2,
                justifyContent: 'center',
              }}>
                <span style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#232a36',
                  lineHeight: '1.3',
                  maxWidth: 120,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontFamily: 'Inter, Poppins, sans-serif',
                }}>{username}</span>
                <span style={{
                  fontSize: '11px',
                  color: '#0077d4',
                  fontWeight: 500,
                  marginTop: '2px',
                  letterSpacing: '0.01em',
                  fontFamily: 'Inter, Poppins, sans-serif',
                }}>
                  {clientCode}
                  {tcode && <span style={{ marginLeft: 6 }}>• {tcode}</span>}
                </span>
              </div>
              <FaChevronDown style={{
                marginLeft: 4,
                fontSize: 11,
                color: '#64748b',
                transition: 'transform 0.2s ease',
                transform: dropdownOpen ? 'rotate(180deg)' : 'none',
              }} />
            </button>
            {dropdownOpen && (
              <div style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                right: '0',
                background: '#ffffff',
                borderRadius: '12px',
                boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15)',
                border: '1px solid #e0e7ef',
                width: '300px',
                zIndex: 1000,
                animation: 'slideDown 0.2s ease',
                padding: '12px',
                fontFamily: 'Inter, Poppins, sans-serif',
              }}>
                <div style={{ padding: '16px', borderBottom: '1px solid #f1f5f9', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 52,
                      height: 52,
                      borderRadius: '10px',
                      background: '#0077d4',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 22,
                      fontWeight: 600,
                      border: '2px solid #f1f5f9',
                      boxShadow: '0 2px 8px rgba(0, 119, 212, 0.25)',
                      position: 'relative',
                    }}>
                      {avatarLetter}
                      <span style={{
                        position: 'absolute',
                        bottom: '4px',
                        right: '4px',
                        width: '14px',
                        height: '14px',
                        background: '#22c55e',
                        border: '2.5px solid #fff',
                        borderRadius: '50%',
                        display: 'inline-block',
                      }}></span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                      <span style={{
                        fontWeight: 600,
                        fontSize: 16,
                        color: '#232a36',
                        marginBottom: 4,
                        maxWidth: 180,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontFamily: 'Inter, Poppins, sans-serif'
                      }}>
                        {username}
                      </span>
                      <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2
                      }}>
                        <span style={{
                          fontSize: 12,
                          color: '#64748b',
                          fontWeight: 500,
                          fontFamily: 'Inter, Poppins, sans-serif'
                        }}>
                          Client Code
                        </span>
                        <span style={{
                          fontSize: 13,
                          color: '#0077d4',
                          fontWeight: 600,
                          fontFamily: 'Inter, Poppins, sans-serif'
                        }}>
                          {clientCode}
                        </span>
                        {tcode && (
                          <>
                            <span style={{
                              fontSize: 12,
                              color: '#64748b',
                              fontWeight: 500,
                              marginTop: 4,
                              fontFamily: 'Inter, Poppins, sans-serif'
                            }}>
                              TCode
                            </span>
                            <span style={{
                              fontSize: 13,
                              color: '#0077d4',
                              fontWeight: 600,
                              fontFamily: 'Inter, Poppins, sans-serif'
                            }}>
                              {tcode}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <div style={{ padding: '4px 0' }}>
                  <button
                    onClick={() => { }}
                    style={{
                      width: '100%',
                      padding: '10px 16px',
                      background: 'transparent',
                      border: 'none',
                      textAlign: 'left',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      cursor: 'pointer',
                      color: '#38414a',
                      fontSize: '13px',
                      borderRadius: '8px',
                      marginBottom: 2,
                      fontWeight: 500,
                      transition: 'all 0.2s ease',
                      fontFamily: 'Inter, Poppins, sans-serif'
                    }}
                    onMouseOver={e => {
                      e.currentTarget.style.background = '#f1f5f9';
                      e.currentTarget.style.color = '#0077d4';
                    }}
                    onMouseOut={e => {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = '#38414a';
                    }}
                  >
                    <FaUserCircle style={{ fontSize: '16px', color: '#64748b' }} />
                    <span>{t('header.profile')}</span>
                  </button>
                  <button
                    onClick={() => { }}
                    style={{
                      width: '100%',
                      padding: '10px 16px',
                      background: 'transparent',
                      border: 'none',
                      textAlign: 'left',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      cursor: 'pointer',
                      color: '#38414a',
                      fontSize: '13px',
                      borderRadius: '8px',
                      marginBottom: 2,
                      fontWeight: 500,
                      transition: 'all 0.2s ease',
                      fontFamily: 'Inter, Poppins, sans-serif'
                    }}
                    onMouseOver={e => {
                      e.currentTarget.style.background = '#f1f5f9';
                      e.currentTarget.style.color = '#0077d4';
                    }}
                    onMouseOut={e => {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = '#38414a';
                    }}
                  >
                    <FaCog style={{ fontSize: '16px', color: '#64748b' }} />
                    <span>{t('header.settings')}</span>
                  </button>
                  <button
                    onClick={handleBackup}
                    style={{
                      width: '100%',
                      padding: '10px 16px',
                      background: 'transparent',
                      border: 'none',
                      textAlign: 'left',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      color: '#0077d4',
                      fontWeight: 600,
                      fontSize: 13,
                      cursor: backupLoading ? 'not-allowed' : 'pointer',
                      opacity: backupLoading ? 0.6 : 1,
                      borderRadius: '8px',
                      marginBottom: 2,
                      transition: 'all 0.2s ease',
                      fontFamily: 'Inter, Poppins, sans-serif'
                    }}
                    disabled={backupLoading}
                    onMouseOver={e => !backupLoading && (e.currentTarget.style.background = '#f1f5f9')}
                    onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <FaDatabase style={{ fontSize: 16, color: '#0077d4' }} />
                    {backupLoading ? t('header.backingUp') : t('header.backupData')}
                  </button>
                  <button
                    onClick={() => setShowRFIDDownload(true)}
                    style={{
                      width: '100%',
                      padding: '10px 16px',
                      background: 'transparent',
                      border: 'none',
                      textAlign: 'left',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      cursor: 'pointer',
                      color: '#38414a',
                      fontSize: '13px',
                      borderRadius: '8px',
                      marginBottom: 2,
                      fontWeight: 500,
                      transition: 'all 0.2s ease',
                      fontFamily: 'Inter, Poppins, sans-serif'
                    }}
                    onMouseOver={e => {
                      e.currentTarget.style.background = '#f1f5f9';
                      e.currentTarget.style.color = '#0077d4';
                    }}
                    onMouseOut={e => {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = '#38414a';
                    }}
                  >
                    <FaMobileAlt style={{ fontSize: '16px', color: '#64748b' }} />
                    <span>{t('header.rfidAppDownload')}</span>
                  </button>
                  <button
                    onClick={() => {
                      navigate('/local-database-migration');
                      setDropdownOpen(false);
                    }}
                    style={{
                      width: '100%',
                      padding: '10px 16px',
                      background: 'transparent',
                      border: 'none',
                      textAlign: 'left',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      cursor: 'pointer',
                      color: '#38414a',
                      fontSize: '13px',
                      borderRadius: '8px',
                      marginBottom: 2,
                      fontWeight: 500,
                      transition: 'all 0.2s ease',
                      fontFamily: 'Inter, Poppins, sans-serif'
                    }}
                    onMouseOver={e => {
                      e.currentTarget.style.background = '#f1f5f9';
                      e.currentTarget.style.color = '#0077d4';
                    }}
                    onMouseOut={e => {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = '#38414a';
                    }}
                  >
                    <FaDatabase style={{ fontSize: '16px', color: '#64748b' }} />
                    <span>Database Migration</span>
                  </button>
                  <button
                    onClick={() => {
                      navigate('/single-use-tags');
                      setDropdownOpen(false);
                    }}
                    style={{
                      width: '100%',
                      padding: '10px 16px',
                      background: 'transparent',
                      border: 'none',
                      textAlign: 'left',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      cursor: 'pointer',
                      color: '#38414a',
                      fontSize: '13px',
                      borderRadius: '8px',
                      marginBottom: 2,
                      fontWeight: 500,
                      transition: 'all 0.2s ease',
                      fontFamily: 'Inter, Poppins, sans-serif'
                    }}
                    onMouseOver={e => {
                      e.currentTarget.style.background = '#f1f5f9';
                      e.currentTarget.style.color = '#0077d4';
                    }}
                    onMouseOut={e => {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = '#38414a';
                    }}
                  >
                    <FaTag style={{ fontSize: '16px', color: '#64748b' }} />
                    <span>SingleUseTag</span>
                  </button>
                  <button
                    onClick={() => {
                      navigate('/sync-labelled-stock-tid');
                      setDropdownOpen(false);
                    }}
                    style={{
                      width: '100%',
                      padding: '10px 16px',
                      background: 'transparent',
                      border: 'none',
                      textAlign: 'left',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      cursor: 'pointer',
                      color: '#38414a',
                      fontSize: '13px',
                      borderRadius: '8px',
                      marginBottom: 2,
                      fontWeight: 500,
                      transition: 'all 0.2s ease',
                      fontFamily: 'Inter, Poppins, sans-serif'
                    }}
                    onMouseOver={e => {
                      e.currentTarget.style.background = '#f1f5f9';
                      e.currentTarget.style.color = '#0077d4';
                    }}
                    onMouseOut={e => {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = '#38414a';
                    }}
                  >
                    <FaSync style={{ fontSize: '16px', color: '#64748b' }} />
                    <span>Sync Labelled Stock TID</span>
                  </button>
                  <button
                    onClick={() => {
                      navigate('/automatic-datasync');
                      setDropdownOpen(false);
                    }}
                    style={{
                      width: '100%',
                      padding: '10px 16px',
                      background: 'transparent',
                      border: 'none',
                      textAlign: 'left',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      cursor: 'pointer',
                      color: '#38414a',
                      fontSize: '13px',
                      borderRadius: '8px',
                      marginBottom: 2,
                      fontWeight: 500,
                      transition: 'all 0.2s ease',
                      fontFamily: 'Inter, Poppins, sans-serif'
                    }}
                    onMouseOver={e => {
                      e.currentTarget.style.background = '#f1f5f9';
                      e.currentTarget.style.color = '#0077d4';
                    }}
                    onMouseOut={e => {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = '#38414a';
                    }}
                  >
                    <FaSync style={{ fontSize: '16px', color: '#64748b' }} />
                    <span>Automatic DataSync</span>
                  </button>
                  <div style={{
                    height: '1px',
                    background: '#f1f5f9',
                    margin: '8px 0'
                  }} />
                  <button
                    onClick={handleLogout}
                    style={{
                      width: '100%',
                      padding: '10px 16px',
                      background: 'transparent',
                      border: 'none',
                      textAlign: 'left',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      cursor: 'pointer',
                      color: '#dc2626',
                      fontSize: '13px',
                      borderRadius: '8px',
                      marginBottom: 2,
                      fontWeight: 600,
                      transition: 'all 0.2s ease',
                      fontFamily: 'Inter, Poppins, sans-serif'
                    }}
                    onMouseOver={e => {
                      e.currentTarget.style.background = '#fef2f2';
                      e.currentTarget.style.color = '#b91c1c';
                    }}
                    onMouseOut={e => {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = '#dc2626';
                    }}
                  >
                    <FaSignOutAlt style={{ fontSize: '16px' }} />
                    <span>{t('header.logout')}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <nav className="zoho-nav-sticky" style={{ display: 'none' }}>
        {/* Mobile menu button */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          style={{
            display: 'none',
            background: 'transparent',
            border: 'none',
            padding: '8px',
            marginLeft: '12px',
            cursor: 'pointer',
            borderRadius: '4px',
            color: '#64748b'
          }}
          className="mobile-menu-btn"
        >
          <svg width="20" height="20" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
          </svg>
        </button>

        <div className="zoho-nav-scroll">
          {navigationItems.map(({ path, icon: Icon, label, color }, idx) => (
            <Link
              key={path}
              to={path}
              style={{
                ...(location.pathname === path ? activeNavItemStyles : navItemStyles),
              }}

            >
              <Icon style={{
                color: location.pathname === path ? '#1e40af' : color,
                fontSize: '16px',
                flexShrink: 0
              }} />
              <span style={{
                whiteSpace: 'nowrap'
              }}>{label}</span>
            </Link>
          ))}
        </div>
        <div className="zoho-nav-fade zoho-nav-fade-left" />
        <div className="zoho-nav-fade zoho-nav-fade-right" />
      </nav>

      {/* Mobile Navigation Menu */}
      {mobileMenuOpen && (
        <div style={{
          position: 'fixed',
          top: '100px',
          left: 0,
          right: 0,
          background: '#ffffff',
          borderBottom: '1px solid #e5e7eb',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
          zIndex: 998,
          maxHeight: 'calc(100vh - 100px)',
          overflowY: 'auto',
          animation: 'slideDown 0.3s ease'
        }}>
          <div style={{ padding: '16px' }}>
            {navigationItems.map(({ path, icon: Icon, label, color }) => (
              <Link
                key={path}
                to={path}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 16px',
                  color: location.pathname === path ? '#1e40af' : '#475569',
                  textDecoration: 'none',
                  fontSize: '14px',
                  fontWeight: location.pathname === path ? 600 : 500,
                  borderRadius: '8px',
                  background: location.pathname === path ? '#eff6ff' : 'transparent',
                  transition: 'all 0.2s ease',
                  marginBottom: '4px'
                }}
                onClick={() => setMobileMenuOpen(false)}
              >
                <Icon style={{
                  fontSize: '18px',
                  color: location.pathname === path ? '#1e40af' : color
                }} />
                <span>{label}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
      {/* Backup Modal */}
      {showBackupModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0, 0, 0, 0.5)', zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: '#fff', borderRadius: 16, boxShadow: '0 20px 25px rgba(0, 0, 0, 0.25)', width: 420, maxWidth: '98vw', padding: '32px', display: 'flex', flexDirection: 'column', alignItems: 'center',
          }}>
            <h2 style={{ fontWeight: 700, fontSize: 20, color: '#3b82f6', marginBottom: 18 }}>{t('header.downloadBackup')}</h2>
            <div style={{ width: '100%', marginBottom: 18 }}>
              <div style={{ fontSize: 14, color: '#64748b', marginBottom: 6 }}>{t('header.backupDescription')}</div>
              {backupError && <div style={{ color: '#dc2626', fontSize: 13, marginTop: 4 }}>{backupError}</div>}
            </div>
            <div style={{ display: 'flex', gap: 16, width: '100%', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowBackupModal(false)}
                style={{ background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 8, padding: '10px 24px', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
                disabled={backupLoading}
              >{t('header.cancel')}</button>
              <button
                onClick={handleBackup}
                style={{ background: backupLoading ? '#94a3b8' : '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontWeight: 600, fontSize: 14, cursor: backupLoading ? 'not-allowed' : 'pointer', opacity: backupLoading ? 0.7 : 1 }}
                disabled={backupLoading}
              >{backupLoading ? t('header.downloading') : t('header.downloadBackupButton')}</button>
            </div>
          </div>
        </div>
      )}
      {/* RFID App Download Modal */}
      {showRFIDDownload && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0, 0, 0, 0.5)', zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: '#fff', borderRadius: 16, boxShadow: '0 20px 25px rgba(0, 0, 0, 0.25)', width: 340, maxWidth: '98vw', padding: '28px 24px 24px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative',
          }}>
            <button onClick={() => setShowRFIDDownload(false)} style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', fontSize: 22, color: '#64748b', cursor: 'pointer', zIndex: 2 }}>&times;</button>
            <RFIDAppDownloadPopup />
          </div>
        </div>
      )}
      <style>
        {`
          @keyframes slideDown {
            from {
              opacity: 0;
              transform: translateY(-8px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          
          /* Zoho-style navigation */
          .zoho-nav-sticky {
            position: sticky;
            top: 56px;
            z-index: 999;
            background: #ffffff;
            border-bottom: 1px solid #e5e7eb;
            min-height: 44px;
            width: 100%;
            overflow: hidden;
            display: flex;
            align-items: center;
          }
          
          .zoho-nav-scroll {
            display: flex;
            align-items: center;
            gap: 0;
            width: 100%;
            min-width: fit-content;
            overflow-x: auto;
            scrollbar-width: none;
            scroll-behavior: smooth;
            padding: 0 20px;
          }
          
          .zoho-nav-scroll::-webkit-scrollbar { 
            display: none; 
          }
          
          .zoho-nav-fade {
            position: absolute;
            top: 0; 
            bottom: 0;
            width: 32px;
            pointer-events: none;
            z-index: 100;
          }
          
          .zoho-nav-fade-left {
            left: 0;
            background: linear-gradient(90deg, #ffffff 70%, transparent 100%);
          }
          
          .zoho-nav-fade-right {
            right: 0;
            background: linear-gradient(270deg, #ffffff 70%, transparent 100%);
          }
          
          /* Mobile responsive navigation */
          @media (max-width: 1024px) {
            .zoho-nav-scroll {
              padding: 0 12px;
            }
            .zoho-nav-fade { 
              width: 24px; 
            }
            nav a {
              padding: 12px 10px !important;
              font-size: 12px !important;
              min-width: fit-content !important;
              flex-shrink: 0 !important;
            }
            nav a span {
              font-size: 12px !important;
            }
            nav svg {
              width: 14px !important;
              height: 14px !important;
              margin-right: 4px !important;
            }
            .header-search-container {
              min-width: 150px !important;
              max-width: 240px !important;
            }
          }
          
          @media (max-width: 900px) {
            .header-search-container {
              min-width: 120px !important;
              max-width: 200px !important;
            }
          }
          
          @media (max-width: 768px) {
            .mobile-menu-btn {
              display: block !important;
            }
            .zoho-nav-scroll {
              display: none !important;
            }
            .zoho-nav-fade {
              display: none !important;
            }
            .header-topbar {
              padding: 8px 12px !important;
              flex-direction: column !important;
              align-items: stretch !important;
            }
            .header-topbar > div:first-child {
              width: 100% !important;
              flex-wrap: wrap !important;
              gap: 12px !important;
            }
            .header-search-container {
              min-width: 100% !important;
              max-width: 100% !important;
              flex: none !important;
              order: 3 !important;
              margin-top: 8px !important;
            }
            .header-topbar > div:last-child {
              width: 100% !important;
              justify-content: space-between !important;
              order: 2 !important;
            }
          }
          
          @media (max-width: 640px) {
            .header-topbar {
              padding: 6px 8px !important;
            }
            .header-topbar > div:first-child {
              gap: 8px !important;
            }
            .header-search-container {
              padding: 4px 8px !important;
              min-width: 100% !important;
              max-width: 100% !important;
            }
            .header-search-container input {
              font-size: 11px !important;
            }
            .header-search-container svg {
              font-size: 11px !important;
            }
            .zoho-nav-scroll {
              padding: 0 4px;
            }
            .zoho-nav-fade { 
              width: 12px; 
            }
            nav a {
              padding: 8px 4px !important;
              font-size: 10px !important;
            }
            nav a span {
              font-size: 10px !important;
            }
            nav svg {
              width: 10px !important;
              height: 10px !important;
              margin-right: 1px !important;
            }
          }
          
          @media (max-width: 480px) {
            .header-search-container {
              min-width: 100% !important;
              max-width: 100% !important;
            }
          }
          
          /* Ensure navigation scrolls smoothly on mobile */
          @media (max-width: 1024px) {
            .zoho-nav-scroll {
              overflow-x: auto;
              scroll-behavior: smooth;
            }
            .zoho-nav-scroll::-webkit-scrollbar {
              display: none;
            }
          }
        `}
      </style>
    </header>
  );
};

export default Header;

function RFIDAppDownloadPopup() {
  const [latest, setLatest] = useState(null);
  useEffect(() => {
    setLatest(apkService.getLatestVersion());
  }, []);
  if (!latest) return <div style={{ color: '#64748b', fontSize: 15, padding: 24 }}>Loading...</div>;
  return (
    <div style={{ width: '100%', textAlign: 'center' }}>
      <div style={{ fontWeight: 700, fontSize: 18, color: '#3b82f6', marginBottom: 6 }}>{t('header.downloadRfidApp')}</div>
      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 18 }}>{t('header.getLatestVersion')}</div>
      <div style={{ background: '#f0fdf4', borderRadius: 10, padding: '14px 10px', marginBottom: 16, border: '1px solid #dcfce7' }}>
        <div style={{ fontWeight: 600, fontSize: 15, color: '#16a34a', marginBottom: 2 }}>{t('header.version')} {latest.version} <span style={{ fontSize: 11, color: '#22c55e', fontWeight: 700, marginLeft: 6 }}>{t('header.latest')}</span></div>
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 2 }}>{t('header.released')} {latest.releaseDate}</div>
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 2 }}>{latest.size} • {t('header.build')} {latest.buildNumber}</div>
        <div style={{ fontSize: 12, color: '#64748b' }}>{t('header.android')} {latest.androidVersion}+</div>
      </div>
      <button
        onClick={() => apkService.downloadAPK(latest)}
        style={{
          background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          padding: '12px 24px',
          fontWeight: 600,
          fontSize: 14,
          cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(34, 197, 94, 0.3)',
          marginTop: 6,
        }}
      >
        <FaDownload style={{ marginRight: 8, fontSize: 14, verticalAlign: 'middle' }} /> {t('header.downloadApk')}
      </button>
    </div>
  );
}
