import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  FaHome,
  FaPlug,
  FaTags,
  FaTag,
  FaUserCircle,
  FaRegBell,
  FaDatabase,
  FaPrint,
  FaExpand,
  FaCompress,
  FaBars,
  FaTimes,
  FaChevronLeft,
  FaChevronRight,
  FaArrowDown,
  FaArrowUp,
  FaSignOutAlt,
  FaChartLine,
  FaBox,
  FaBoxes,
  FaListUl,
  FaPaintBrush,
  FaBarcode,
  FaFileUpload,
  FaFileInvoice,
  FaClipboardList,
  FaChartPie,
  FaThLarge,
  FaLayerGroup,
  FaTools,
  FaShoppingBag,
  FaCog,
  FaSync,
} from 'react-icons/fa';
import {
  HiDocumentText,
  HiDocument,
  HiReceiptTax,
  HiCheckCircle,
  HiTag,
} from 'react-icons/hi';
import { useNotifications } from '../context/NotificationContext';
import { useTranslation } from '../hooks/useTranslation';
import axios from 'axios';
import BrandLogo from './common/BrandLogo';
import { getUserErrorMessage, isNetworkError } from '../utils/userErrorMessage';

const SIDEBAR_DRAWER_QUERY = '(max-width: 1024px)';

const appPages = [
  { path: '/download-folder-settings', icon: FaDatabase, label: 'Download Folders' },
  { path: '/dashboard', icon: FaPlug, label: 'API Testing' },
  { path: '/api-documentation', icon: HiDocumentText, label: 'API Integration Guide' },
  { path: '/rfid-integration', icon: FaSync, label: 'Quick Integration' },
  { path: '/download-api-doc', icon: FaFileInvoice, label: 'Download API Doc' },
  { path: '/download-resources', icon: FaFileUpload, label: 'Download Resources' },
  { path: '/single-use-tags', icon: FaTag, label: 'Single Use Tags' },
  { path: '/sync-labelled-stock-tid', icon: FaBarcode, label: 'Sync Labelled Stock TID' },
  { path: '/fingerprint-register', icon: FaUserCircle, label: 'Fingerprint Login' },
  { path: '/face-register', icon: FaUserCircle, label: 'Face Login' },
];

const utilityPages = [
  { path: '/rfid-utility/auto-push-stock', icon: FaSync, label: 'Auto Push Stock' },
  { path: '/rfid-utility/tray-connect', icon: FaPlug, label: 'RFID Tray Connect' },
  { path: '/rfid-utility/write-tag', icon: FaTag, label: 'Write Tag' },
  { path: '/rfid-utility/about-sparkle', icon: HiDocument, label: 'About' },
  { path: '/rfid-utility/map-fields', icon: FaLayerGroup, label: 'Map Fields' },
  { path: '/rfid-utility/template', icon: FaClipboardList, label: 'Templates' },
  { path: '/rfid-utility/item-images', icon: FaPaintBrush, label: 'Item Image Folder' },
  { path: '/sync-labelled-stock-tid', icon: FaBarcode, label: 'Sync Labelled Stock TID' },
];

const sidebarIsDrawer = () => window.matchMedia(SIDEBAR_DRAWER_QUERY).matches;

const SidebarLayout = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const { notifications, addNotification } = useNotifications();

  // State - sidebar open/closed and collapsed (icon-only) on desktop
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('sidebarCollapsed') || 'false');
    } catch {
      return false;
    }
  });
  const [sidebarOpen, setSidebarOpen] = useState(() => !sidebarIsDrawer());
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [userInfo, setUserInfo] = useState({});
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupError, setBackupError] = useState('');
  const [isMobile, setIsMobile] = useState(() => sidebarIsDrawer());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rfidPlanInfo, setRfidPlanInfo] = useState(null);

  const notificationsRef = useRef(null);
  const settingsRef = useRef(null);
  const userPanelRef = useRef(null);
  const asideRef = useRef(null);
  const flyoutRef = useRef(null);
  const openFlyoutTimer = useRef(null);
  const closeFlyoutTimer = useRef(null);
  const [flyout, setFlyout] = useState(null);

  // Section 0: Quick Access
  const navigationProfile = [
    { path: '/profile-menu', icon: FaThLarge, label: 'All Apps & Resources', color: '#6366f1' },
    { path: '/rfid-utility', icon: FaTools, label: 'RFID Utility', color: '#6d28d9' }
  ];

  // Navigation items – icons matched to menu names, distinct colors
  // Section 1: Inventory Management
  const inventorySession = [
    { path: '/analytics', icon: FaChartLine, label: 'Dashboard', color: '#0d9488', section: 'Inventory Management' },
    { path: '/create-masters', icon: FaLayerGroup, label: 'Create Masters', color: '#7c3aed', section: 'Inventory Management' },
    { path: '/stock', icon: FaBoxes, label: 'Add Inventory', color: '#d97706', section: 'Inventory Management' },
    { path: '/label-stock', icon: FaListUl, label: 'Inventory List', color: '#2563eb', section: 'Inventory Management' },
    { path: '/stock-verification', icon: HiCheckCircle, label: 'Stock Verification', color: '#059669', section: 'Inventory Management' },
    { path: '/create-label', icon: FaPaintBrush, label: 'Design Label', color: '#0891b2', section: 'Inventory Management' },
    { path: '/rfid-label', icon: FaPrint, label: 'Create PRN Label', color: '#7c3aed', section: 'Inventory Management' },
  ];

  // Section 2: Transaction (Stock Transfer hidden globally)
  const navigationSection2 = [
    { path: '/quotation', icon: HiDocument, label: 'Quotation', color: '#be185d' },
    { path: '/create-invoice', icon: HiReceiptTax, label: 'Invoice', color: '#15803d' },
    { path: '/sample-in', icon: FaArrowDown, label: 'Sample In', color: '#0d9488' },
    { path: '/sample-out', icon: FaArrowUp, label: 'Sample Out', color: '#b91c1c' },
    { path: '/rfid-sample-in-out', icon: FaListUl, label: 'RFID Sample In/Out', color: '#7c3aed' },
    { path: '/order-list', icon: FaClipboardList, label: 'Order List', color: '#6d28d9' },
    { path: '/reports', icon: HiDocumentText, label: 'Reports', color: '#0e7490' },
  ];

  // Section 3: RFID Tags Management
  const navigationSection3 = [
    { path: '/rfid-devices', icon: FaBarcode, label: 'Scan to Desktop', color: '#a21caf' },
    { path: '/stock-tracking', icon: FaBoxes, label: 'Stock Tracking', color: '#059669' },
    { path: '/box-rfid', icon: FaBox, label: 'Box RFID Pack', color: '#0f766e' },
    { path: '/upload-rfid', icon: FaFileUpload, label: 'RFID Tags Sheet Upload', color: '#4f46e5' },
    { path: '/rfid-tags', icon: FaTags, label: 'RFID Tag List', color: '#b91c1c' },
    { path: '/tag-usage', icon: FaChartPie, label: 'RFID Tags Usage', color: '#0e7490' },
    { path: '/sync-labelled-stock-tid', icon: FaSync, label: 'Sync Labelled Stock TID', color: '#6d28d9' },
  ];

  const clientCode = userInfo.ClientCode || userInfo.clientcode || userInfo.clientCode || 'N/A';
  const THIRD_PARTY_ALLOWED_CLIENT = 'LS000438';
  const FERONIA_ALLOWED_CLIENT = 'LS000512';
  const KUMAR916_ALLOWED_CLIENT = 'LS000456';
  const VRAKRUPA_ALLOWED_CLIENT = 'LS000563';
  const showThirdPartyMenu = (clientCode || '').trim().toUpperCase() === THIRD_PARTY_ALLOWED_CLIENT;
  const showFeroniaMenu = (clientCode || '').trim().toUpperCase() === FERONIA_ALLOWED_CLIENT;
  const showKumar916Menu = (clientCode || '').trim().toUpperCase() === KUMAR916_ALLOWED_CLIENT;
  const showVarakrupaMenu = (clientCode || '').trim().toUpperCase() === VRAKRUPA_ALLOWED_CLIENT;
  const navigationSection5 = [
    { path: '/third-party-integration', icon: FaPlug, label: 'Third Party Software Integration', color: '#0d9488' },
  ];
  const navigationSectionFeronia = [
    { path: '/feronia-integration', icon: FaPlug, label: 'Feronia Integration', color: '#0f766e' },
  ];
  const navigationSectionKumar916 = [
    { path: '/kumar916-stock-master', icon: FaPlug, label: `Third Party (${KUMAR916_ALLOWED_CLIENT})`, color: '#0d9488' },
  ];
  const navigationSectionVarakrupa = [
    {
      path: '/varakrupa-integration',
      icon: FaPlug,
      label: `Third Party (${VRAKRUPA_ALLOWED_CLIENT})`,
      color: '#0d9488'
    },
    {
      path: '/varakrupa-sold-to-user',
      icon: FaShoppingBag,
      label: 'Sold Item to User',
      color: '#0d9488'
    },
    {
      path: '/varakrupa-sync-order',
      icon: FaClipboardList,
      label: 'Sync Order',
      color: '#0d9488'
    },
  ];

  // Effects
  useEffect(() => {
    try {
      const stored = localStorage.getItem('userInfo');
      if (stored) {
        setUserInfo(JSON.parse(stored));
      }
    } catch (err) {
      setUserInfo({});
    }
  }, []);

  useEffect(() => {
    const fetchMyPlan = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;
        const response = await axios.get(
          'https://soni.loyalstring.co.in/api/ProductMaster/GetMyRFIDPlan',
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setRfidPlanInfo(response?.data || null);
      } catch (_) {
        setRfidPlanInfo(null);
      }
    };
    fetchMyPlan();
  }, []);

  useEffect(() => {
    const media = window.matchMedia(SIDEBAR_DRAWER_QUERY);
    const onChange = (event) => {
      setIsMobile(event.matches);
      setSidebarOpen(!event.matches);
    };
    if (media.addEventListener) media.addEventListener('change', onChange);
    else media.addListener(onChange);
    return () => {
      if (media.removeEventListener) media.removeEventListener('change', onChange);
      else media.removeListener(onChange);
    };
  }, []);

  useEffect(() => {
    if (!isMobile || !sidebarOpen) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isMobile, sidebarOpen]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target)) {
        setNotificationsOpen(false);
      }
      const inProfile = settingsRef.current && settingsRef.current.contains(event.target);
      const inPanel = userPanelRef.current && userPanelRef.current.contains(event.target);
      if (!inProfile && !inPanel) {
        setSettingsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setNotificationsOpen(false);
    setSettingsOpen(false);
    if (isMobile) setSidebarOpen(false);
  }, [location.pathname, isMobile]);

  // Persist collapsed state for user preference
  useEffect(() => {
    try {
      localStorage.setItem('sidebarCollapsed', JSON.stringify(sidebarCollapsed));
    } catch (_) { }
  }, [sidebarCollapsed]);

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
    const handleFullscreenChange = () => checkFullscreen();
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

  // Handlers
  const toggleFullscreen = useCallback(() => {
    const isCurrentlyFullscreen = !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement
    );
    if (!isCurrentlyFullscreen) {
      const element = document.documentElement;
      if (element.requestFullscreen) {
        element.requestFullscreen().catch(err => console.log('Error enabling fullscreen:', err));
      } else if (element.webkitRequestFullscreen) {
        element.webkitRequestFullscreen();
      } else if (element.mozRequestFullScreen) {
        element.mozRequestFullScreen();
      } else if (element.msRequestFullscreen) {
        element.msRequestFullscreen();
      }
    } else {
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

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userInfo');
    localStorage.removeItem('lastLoginTime');
    localStorage.removeItem('showWelcomeToast');
    sessionStorage.clear();
    navigate('/login', { replace: true });
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
      const url = window.URL.createObjectURL(response.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }, 100);
      setShowBackupModal(false);
      addNotification({
        title: 'Backup Downloaded',
        description: 'Backup file has been downloaded successfully.',
        type: 'success',
      });
    } catch (err) {
      if (isNetworkError(err)) {
        setBackupError(getUserErrorMessage(err));
      } else if (err.response?.data?.error) {
        setBackupError(err.response.data.error);
      } else {
        setBackupError(err.message || 'Backup failed.');
      }
    } finally {
      setBackupLoading(false);
    }
  };

  function formatRelativeTime(date) {
    const now = new Date();
    const diff = Math.floor((now - new Date(date)) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} minute${Math.floor(diff / 60) === 1 ? '' : 's'} ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hour${Math.floor(diff / 3600) === 1 ? '' : 's'} ago`;
    return `${Math.floor(diff / 86400)} day${Math.floor(diff / 86400) === 1 ? '' : 's'} ago`;
  }

  const username = userInfo.Username || userInfo.UserName || userInfo.name || 'User';
  const tcode = userInfo.TCode || userInfo.tcode || userInfo.TCODE || '';
  const avatarLetter = username ? username[0].toUpperCase() : 'U';
  const planName = (rfidPlanInfo?.PlanName || '').trim();
  const planExpiryRaw = rfidPlanInfo?.PlanExpiryDate;
  const formattedPlanExpiry = (() => {
    if (!planExpiryRaw) return '';
    const parsed = new Date(planExpiryRaw);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  })();

  const compact = !isMobile && sidebarCollapsed;

  const pagesForItem = (item) => {
    if (item.path === '/profile-menu') return { key: 'apps', title: 'All Apps & Resources', items: appPages };
    if (item.path === '/rfid-utility') return { key: 'utility', title: 'RFID Utility', items: utilityPages };
    return null;
  };

  const clearFlyoutTimers = () => {
    clearTimeout(openFlyoutTimer.current);
    clearTimeout(closeFlyoutTimer.current);
  };

  const closeFlyoutSoon = () => {
    clearTimeout(closeFlyoutTimer.current);
    closeFlyoutTimer.current = setTimeout(() => {
      flyoutRef.current = null;
      setFlyout(null);
    }, 160);
  };

  const queueFlyout = (event, spec) => {
    if (!spec?.items?.length) return;
    clearTimeout(closeFlyoutTimer.current);
    const target = event.currentTarget;
    if (flyoutRef.current?.key === spec.key) return;
    clearTimeout(openFlyoutTimer.current);
    openFlyoutTimer.current = setTimeout(() => {
      const aside = asideRef.current?.getBoundingClientRect();
      const row = target.getBoundingClientRect();
      const panelHeight = Math.min(spec.items.length * 34 + 44, 440);
      const top = Math.max(12, Math.min(row.top - 10, window.innerHeight - panelHeight - 12));
      const width = 272;
      let left = (aside?.right || row.right) + 8;
      if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8);
      const next = { ...spec, top, left };
      flyoutRef.current = next;
      setFlyout(next);
    }, 70);
  };

  useEffect(() => {
    flyoutRef.current = null;
    setFlyout(null);
  }, [location.pathname]);

  useEffect(() => () => clearFlyoutTimers(), []);

  const renderMenuItem = (item) => {
    const { path, icon: Icon, label, comingSoon } = item;
    const isActive = location.pathname === path;
    const pages = pagesForItem(item);
    if (comingSoon) {
      return (
        <div key={path} className="ssb-item is-soon" title={compact ? label : 'Coming Soon'}>
          <span className="ssb-ico" aria-hidden="true"><Icon /></span>
          {!compact && <span className="ssb-item-label">{label}</span>}
          {!compact && <span className="ssb-soon">Soon</span>}
        </div>
      );
    }
    return (
      <Link
        key={path}
        to={path}
        onClick={() => isMobile && setSidebarOpen(false)}
        onMouseEnter={(event) => queueFlyout(event, pages)}
        onMouseLeave={closeFlyoutSoon}
        onFocus={(event) => queueFlyout(event, pages)}
        className={`ssb-item${isActive ? ' is-active' : ''}${pages ? ' has-flyout' : ''}`}
        title={compact ? label : ''}
      >
        <span className="ssb-ico" aria-hidden="true"><Icon /></span>
        {!compact && <span className="ssb-item-label">{label}</span>}
        {!compact && (item.path === '/profile-menu' || item.path === '/rfid-utility') ? <FaChevronRight className="ssb-fly-hint" aria-hidden="true" /> : null}
      </Link>
    );
  };

  const renderSection = (title, items) => {
    const visible = items || [];
    if (visible.length === 0) return null;
    return (
      <div key={title} className="ssb-group">
        {!compact && <div className="ssb-sec">{title}</div>}
        {visible.map((item) => renderMenuItem(item))}
      </div>
    );
  };

  const toggleSettings = () => {
    setSettingsOpen((open) => !open);
  };

  const closeSettings = () => setSettingsOpen(false);

  return (
    <div className={`ssb-app${compact ? ' is-compact' : ''}${isMobile ? ' is-mobile' : ''}${sidebarOpen ? ' is-open' : ''}`}>
      {!sidebarOpen && (
        <header className="ssb-topbar">
          <button type="button" className="ssb-icon-btn" onClick={() => setSidebarOpen(true)} aria-label="Open menu" title="Open menu">
            <FaBars size={16} />
          </button>
          <span className="ssb-topbar-brand">
            <BrandLogo variant="mark" height={28} />
          </span>
        </header>
      )}

      {isMobile && sidebarOpen && (
        <div className="ssb-overlay" role="button" tabIndex={0} aria-label="Close menu" onClick={() => setSidebarOpen(false)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSidebarOpen(false); }} />
      )}

      <div className="ssb-shell">
        <aside className="ssb" aria-label="Main navigation" ref={asideRef}>
          <div className="ssb-brand">
            <Link to="/analytics" className="ssb-logo" title="Sparkle RFID" onClick={() => isMobile && setSidebarOpen(false)}>
              <BrandLogo variant="mark" height={44} />
            </Link>
            {!isMobile && (
              <button type="button" className="ssb-icon-btn" onClick={() => setSidebarCollapsed((v) => !v)} title={compact ? 'Expand sidebar' : 'Collapse sidebar'} aria-label={compact ? 'Expand sidebar' : 'Collapse sidebar'}>
                {compact ? <FaChevronRight size={12} /> : <FaChevronLeft size={12} />}
              </button>
            )}
            {isMobile && (
              <button type="button" className="ssb-icon-btn" onClick={() => setSidebarOpen(false)} title="Close menu" aria-label="Close menu">
                <FaTimes size={14} />
              </button>
            )}
          </div>

          <nav className="ssb-nav">
            {renderSection('Inventory', inventorySession)}
            {renderSection('Transaction', navigationSection2)}
            {renderSection('RFID', navigationSection3)}
            {showThirdPartyMenu && renderSection('Third Party', navigationSection5)}
            {showFeroniaMenu && renderSection('Third Party', navigationSectionFeronia)}
            {showKumar916Menu && renderSection('Third Party', navigationSectionKumar916)}
            {showVarakrupaMenu && renderSection('Third Party', navigationSectionVarakrupa)}
            {renderSection('Apps', navigationProfile)}
          </nav>

          <div className="ssb-foot" ref={settingsRef}>
            <button
              type="button"
              className={`ssb-profile${settingsOpen ? ' is-open' : ''}${compact ? ' is-compact' : ''}`}
              onClick={toggleSettings}
              title={`${username} · ${clientCode}${formattedPlanExpiry ? ` · Expires ${formattedPlanExpiry}` : ''}`}
              aria-expanded={settingsOpen}
              aria-haspopup="dialog"
            >
              <span className="ssb-avatar">{avatarLetter}</span>
              {!compact && (
                <>
                  <span className="ssb-user-meta">
                    <span className="ssb-user-name">{username}</span>
                    <span className="ssb-user-sub">{clientCode}</span>
                  </span>
                  {planName ? <strong className="ssb-plan-chip">{planName}</strong> : null}
                  <FaChevronRight className="ssb-user-chevron" />
                </>
              )}
            </button>
          </div>
        </aside>

        {flyout ? (
          <div
            className="ssb-flyout"
            style={{ top: flyout.top, left: flyout.left }}
            role="menu"
            aria-label={flyout.title}
            onMouseEnter={() => clearTimeout(closeFlyoutTimer.current)}
            onMouseLeave={closeFlyoutSoon}
          >
            <div className="ssb-flyout-title">{flyout.title}</div>
            <div className="ssb-flyout-list">
              {flyout.items.map((page) => {
                const Icon = page.icon;
                const active = location.pathname === page.path;
                return (
                  <Link
                    key={page.path}
                    to={page.path}
                    role="menuitem"
                    className={`ssb-flyout-item${active ? ' is-active' : ''}`}
                    onClick={() => {
                      flyoutRef.current = null;
                      setFlyout(null);
                      if (isMobile) setSidebarOpen(false);
                    }}
                  >
                    <span className="ssb-ico" aria-hidden="true">{Icon ? <Icon /> : null}</span>
                    <span>{page.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ) : null}

        {settingsOpen && (
          <div className="ssb-user-panel" ref={userPanelRef} role="dialog" aria-label="Account">
            <div className="ssb-user-panel-head">
              <span className="ssb-avatar">{avatarLetter}</span>
              <span className="ssb-user-meta">
                <span className="ssb-user-name">{username}</span>
                {planName ? <strong className="ssb-plan-chip">{planName}</strong> : null}
              </span>
            </div>
            <div className="ssb-profile-facts">
              <span className="ssb-fact">
                <span className="ssb-fact-label">Client</span>
                <span className="ssb-fact-value">{clientCode}</span>
              </span>
              <span className="ssb-fact">
                <span className="ssb-fact-label">Expires</span>
                <span className="ssb-fact-value">{formattedPlanExpiry || 'Not set'}</span>
              </span>
            </div>
            <div className="ssb-user-panel-actions">
              <Link
                to="/profile-menu"
                className={`ssb-item${location.pathname === '/profile-menu' ? ' is-active' : ''}`}
                onClick={() => { closeSettings(); if (isMobile) setSidebarOpen(false); }}
              >
                <span className="ssb-ico" aria-hidden="true"><FaCog /></span>
                <span className="ssb-item-label">Preferences</span>
              </Link>
              <button type="button" className="ssb-item" onClick={() => { toggleFullscreen(); closeSettings(); }}>
                <span className="ssb-ico" aria-hidden="true">{isFullscreen ? <FaCompress /> : <FaExpand />}</span>
                <span className="ssb-item-label">{isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}</span>
              </button>
              <button type="button" className="ssb-item" onClick={() => { setShowBackupModal(true); closeSettings(); }}>
                <span className="ssb-ico" aria-hidden="true"><FaDatabase /></span>
                <span className="ssb-item-label">Backup</span>
              </button>
              <button type="button" className="ssb-item ssb-item-danger" onClick={handleLogout}>
                <span className="ssb-ico" aria-hidden="true"><FaSignOutAlt /></span>
                <span className="ssb-item-label">Logout</span>
              </button>
            </div>
          </div>
        )}

        <main
          className={`ssb-main${!sidebarOpen ? ' has-topbar' : ''}${location.pathname === '/analytics' ? ' analytics-fit-main' : ''}`}
        >
          {children}
        </main>
      </div>
      {/* Modals */}
      {showBackupModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0, 0, 0, 0.5)', zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 20px 25px rgba(0, 0, 0, 0.25)', width: 420, maxWidth: '98vw', padding: '32px' }}>
            <h2 style={{ fontWeight: 700, fontSize: 20, color: '#3b82f6', marginBottom: 18 }}>{t('header.downloadBackup') || 'Download Backup'}</h2>
            <div style={{ width: '100%', marginBottom: 18 }}>
              <div style={{ fontSize: 14, color: '#64748b', marginBottom: 6 }}>{t('header.backupDescription') || 'Download your data backup'}</div>
              {backupError && <div style={{ color: '#dc2626', fontSize: 13, marginTop: 4 }}>{backupError}</div>}
            </div>
            <div style={{ display: 'flex', gap: 12, width: '100%', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button
                onClick={() => setShowBackupModal(false)}
                disabled={backupLoading}
                className="layout-btn layout-btn-secondary"
                style={{
                  padding: '10px 20px', minHeight: 44, borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff',
                  color: '#374151', fontWeight: 600, fontSize: 14, cursor: backupLoading ? 'not-allowed' : 'pointer',
                }}
              >
                {t('header.cancel') || 'Cancel'}
              </button>
              <button
                onClick={handleBackup}
                disabled={backupLoading}
                className="layout-btn layout-btn-primary"
                style={{
                  padding: '10px 20px', minHeight: 44, borderRadius: 8, border: 'none', background: backupLoading ? '#94a3b8' : '#2563eb',
                  color: '#fff', fontWeight: 600, fontSize: 14, cursor: backupLoading ? 'not-allowed' : 'pointer', opacity: backupLoading ? 0.8 : 1,
                }}
              >
                {backupLoading ? (t('header.downloading') || 'Downloading...') : (t('header.downloadBackupButton') || 'Download Backup')}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default SidebarLayout;

