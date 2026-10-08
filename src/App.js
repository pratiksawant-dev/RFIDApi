import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { HashRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import Login from './components/Login';
import Register from './components/Register';
import Dashboard from './components/Dashboard';
import DashboardAnalytics from './components/DashboardAnalytics';
import APIDocumentation from './components/APIDocumentation';
import RFIDIntegration from './components/RFIDIntegration';
import {
  LabelStockList,
  BulkProductImageUpload,
  Labeling,
  RFIDDeviceDetails,
  StockTracking,
  RFIDTags,
  TagUsage,
  StockVerification,
  StockTransfer,
  InvoiceStock,
  RFIDLabel,
  AddStock,
  OrderList,
  StockTakingMatchedList,
  StockTakingUnmatchedList
} from './components/inventory/components';
import ProductDetailsPage from './components/inventory/ProductDetailsPage';
import CreateLabel from './components/inventory/CreateLabel';
import CreateInvoice from './components/inventory/CreateInvoice';
import SampleOut from './components/inventory/SampleOut';
import SampleOutList from './components/inventory/SampleOutList';
import SampleIn from './components/inventory/SampleIn';
import RFIDSampleInOut from './components/inventory/RFIDSampleInOut';
import BoxRfid from './components/inventory/BoxRfid';
import BoxListWall from './components/inventory/BoxListWall';
import BoxDetailsPage from './components/inventory/BoxDetailsPage';
import SessionDetails from './components/inventory/SessionDetails';
import StockVerificationWithRFIDTray from './components/inventory/StockVerificationWithRFIDTray';
import QuotationNew from './components/quotation/QuotationNew';
import QuotationWithRFIDTray from './components/quotation/QuotationWithRFIDTray';
import QuotationList from './components/quotation/QuotationList';
import Reports from './components/Reports';
import StockReportSummary from './components/StockReportSummary';
import StockReportDashboard from './components/StockReportDashboard';
import Footer from './components/Footer';
import UploadRFID from './components/UploadRFID';
import RFIDTransactions from './components/RFIDTransactions';
import RFIDAppDownload from './components/RFIDAppDownload';
import NotFound from './components/NotFound';
import { AdminLogin, AdminDashboard } from './components/admin';
import AdminRfidTagsReport from './components/admin/AdminRfidTagsReport';
import SingleUseTags from './components/SingleUseTags';
import SyncLabelledStockTidPage from './components/SyncLabelledStockTidPage';
import ThirdPartySoftwareIntegration from './integrations/third-party/clients/tamannaah/ThirdPartySoftwareIntegration';
import FeroniaIntegration from './integrations/third-party/clients/feronia/FeroniaIntegration';
import Kumar916StockMasterIntegration from './integrations/third-party/clients/kumar916/Kumar916StockMasterIntegration';
import VarakrupaIntegration from './integrations/third-party/clients/varakrupa/VarakrupaIntegration';
import VarakrupaSoldItemToUser from './integrations/third-party/clients/varakrupa/VarakrupaSoldItemToUser';
import VarakrupaSyncOrder from './integrations/third-party/clients/varakrupa/VarakrupaSyncOrder';
import CreateMasters from './components/CreateMasters';
import DownloadApiDoc from './components/DownloadApiDoc';
import DownloadResources from './components/DownloadResources';
import ProfileMenuPage from './components/ProfileMenuPage';
import FingerprintSettingsPage from './components/FingerprintSettingsPage';
import PasskeySettingsPage from './components/PasskeySettingsPage';
import FaceSettingsPage from './components/FaceSettingsPage';
import RFIDUtility from './components/RFIDUtility';
import RFIDTrayConnect from './components/RFIDTrayConnect';
import AutoPushStockUtility from './components/AutoPushStockUtility';
import MapFieldsUtility from './components/MapFieldsUtility';
import TemplateUtility from './components/TemplateUtility';
import AboutSparkleApplication from './components/AboutSparkleApplication';
import ItemImageFolderUtility from './components/ItemImageFolderUtility';
import OfflineApiBaseSettingsPage from './components/OfflineApiBaseSettingsPage';
import DownloadFoldersSettingsPage from './components/DownloadFoldersSettingsPage';
import PublicProductScanView from './components/public-scan/PublicProductScanView';
import { setupApiRuntimeRouter } from './services/apiRuntimeRouter';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'react-toastify/dist/ReactToastify.css';
import './styles/rtl.css';
import { ToastContainer } from 'react-toastify';
import Layout from './components/Layout';
import AppLogoLoader from './components/common/Loader';
import { bindGlobalLoader } from './services/globalLoader';
import { NotificationProvider } from './context/NotificationContext';
import { TranslationProvider } from './context/TranslationContext';
import './i18n';

const Router = HashRouter;

setupApiRuntimeRouter();

// Global loading context — branded logo overlay used by every page
export const LoadingContext = createContext({
  loading: false,
  setLoading: () => { },
  notifyRouteChange: () => { },
});
export const useLoading = () => useContext(LoadingContext);

const LoadingProvider = ({ children }) => {
  const [loading, setLoading] = useState(false);
  const [routeLoading, setRouteLoading] = useState(false);
  const [apiLoading, setApiLoading] = useState(false);
  const routeTimer = useRef(null);

  const notifyRouteChange = useCallback(() => {
    setRouteLoading(true);
    if (routeTimer.current) window.clearTimeout(routeTimer.current);
    routeTimer.current = window.setTimeout(() => setRouteLoading(false), 700);
  }, []);

  useEffect(() => {
    bindGlobalLoader({
      show: () => setApiLoading(true),
      hide: () => setApiLoading(false),
    });
    return () => bindGlobalLoader({});
  }, []);

  useEffect(() => () => {
    if (routeTimer.current) window.clearTimeout(routeTimer.current);
  }, []);

  return (
    <LoadingContext.Provider value={{ loading, setLoading, notifyRouteChange }}>
      <AppLogoLoader visible={Boolean(loading || routeLoading || apiLoading)} />
      {children}
    </LoadingContext.Provider>
  );
};

const RouteLoadingSync = () => {
  const location = useLocation();
  const { notifyRouteChange } = useLoading();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return undefined;
    }
    notifyRouteChange?.();
    return undefined;
  }, [location.pathname, notifyRouteChange]);

  return null;
};

// Enhanced authentication check with navigation protection
const useAuthProtection = () => {
  const navigate = useNavigate();
  const location = useLocation();

  React.useEffect(() => {
    const token = localStorage.getItem('token');
    const adminToken = localStorage.getItem('adminToken');
    let isAuth = false;
    let isAdminAuth = false;

    // Check user authentication
    if (token) {
      try {
        // Validate token is not expired
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const tokenPayload = JSON.parse(window.atob(base64));

        // Check if token is expired (if exp field exists)
        if (tokenPayload.exp) {
          const currentTime = Math.floor(Date.now() / 1000);
          isAuth = tokenPayload.exp > currentTime;

          // If token is expired, clear storage
          if (!isAuth) {
            localStorage.removeItem('token');
            localStorage.removeItem('userInfo');
            localStorage.removeItem('lastLoginTime');
          }
        } else {
          isAuth = true; // If no expiry, consider valid
        }
      } catch (error) {
        // Invalid token format, clear storage
        localStorage.removeItem('token');
        localStorage.removeItem('userInfo');
        localStorage.removeItem('lastLoginTime');
        isAuth = false;
      }
    }

    // Check admin authentication
    if (adminToken) {
      try {
        // Validate admin token is not expired
        const base64Url = adminToken.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const tokenPayload = JSON.parse(window.atob(base64));

        // Check if token is expired (if exp field exists)
        if (tokenPayload.exp) {
          const currentTime = Math.floor(Date.now() / 1000);
          isAdminAuth = tokenPayload.exp > currentTime;

          // If token is expired, clear storage
          if (!isAdminAuth) {
            localStorage.removeItem('adminToken');
          }
        } else {
          isAdminAuth = true; // If no expiry, consider valid
        }
      } catch (error) {
        // Invalid token format, clear storage
        localStorage.removeItem('adminToken');
        isAdminAuth = false;
      }
    }

    // Handle navigation based on authentication status
    const currentPath = location.pathname;

    // If user is authenticated and tries to access login/register pages
    if (isAuth && (currentPath === '/login' || currentPath === '/register')) {
      navigate('/dashboard', { replace: true });
    }

    // If admin is authenticated and tries to access admin-login
    if (isAdminAuth && currentPath === '/admin-login') {
      navigate('/admin-dashboard', { replace: true });
    }

    // If no authentication and trying to access protected routes
    if (!isAuth && !isAdminAuth) {
      const protectedRoutes = [
        '/dashboard',
        '/analytics',
        '/create-masters',
        '/rfid-integration',
        '/label-stock',
        '/label-stock/bulk-upload-images',
        '/bulk-upload-images',
        '/rfid-devices',
        '/stock-tracking',
        '/box-rfid',
        '/box-rfid/box-list',
        '/rfid-tags',
        '/tag-usage',
        '/rfid-utility',
        '/rfid-utility/tray-connect',
        '/rfid-utility/auto-push-stock',
        '/rfid-utility/map-fields',
        '/rfid-utility/template',
        '/rfid-utility/item-images',
        '/rfid-utility/about-sparkle',
        '/stock-verification',
        '/stock-verification-rfid-tray', '/stock-taking-matched-list', '/stock-taking-unmatched-list',
        '/upload-rfid',
        '/rfid-transactions',
        '/rfid-app-download',
        '/third-party-integration',
        '/feronia-integration',
        '/kumar916-stock-master',
        '/varakrupa-integration',
        '/varakrupa-sold-to-user',
        '/varakrupa-sync-order',
        '/download-api-doc',
        '/download-resources',
        '/single-use-tags', '/sync-labelled-stock-tid',
        '/profile-menu',
        '/fingerprint-register',
        '/face-register',
        '/passkey-settings',
        '/rfid-sample-in-out',
        '/offline-api-settings',
        '/download-folder-settings'
      ];
      const adminRoutes = ['/admin-dashboard'];

      if (protectedRoutes.includes(currentPath) || currentPath.startsWith('/box-rfid/box-list/')) {
        navigate('/login', { replace: true });
      } else if (adminRoutes.includes(currentPath)) {
        navigate('/admin-login', { replace: true });
      } else if (currentPath === '/') {
        navigate('/login', { replace: true });
      }
    }

    // If user is authenticated but tries to access admin routes
    if (isAuth && !isAdminAuth && currentPath === '/admin-dashboard') {
      navigate('/dashboard', { replace: true });
    }

    // If admin is authenticated but tries to access user routes
    if (isAdminAuth && !isAuth && ['/dashboard', '/analytics', '/create-masters', '/api-documentation', '/rfid-integration', '/label-stock', '/label-stock/bulk-upload-images', '/bulk-upload-images', '/product-details', '/invoice-stock', '/rfid-label', '/rfid-devices', '/stock-tracking', '/box-rfid', '/box-rfid/box-list', '/rfid-tags', '/tag-usage', '/rfid-utility', '/rfid-utility/tray-connect', '/rfid-utility/auto-push-stock', '/rfid-utility/map-fields', '/rfid-utility/template', '/rfid-utility/item-images', '/rfid-utility/about-sparkle', '/stock-verification', '/stock-verification-rfid-tray', '/stock-taking-matched-list', '/stock-taking-unmatched-list', '/stock-transfer', '/upload-rfid', '/rfid-transactions', '/rfid-app-download', '/third-party-integration', '/feronia-integration', '/kumar916-stock-master', '/varakrupa-integration', '/varakrupa-sold-to-user', '/varakrupa-sync-order', '/download-api-doc', '/download-resources', '/single-use-tags', '/sync-labelled-stock-tid', '/profile-menu', '/fingerprint-register', '/face-register', '/passkey-settings', '/offline-api-settings', '/download-folder-settings'].includes(currentPath)) {
      navigate('/admin-dashboard', { replace: true });
    }
  }, [location.pathname, navigate]);

  // Add popstate listener to handle browser back/forward buttons
  React.useEffect(() => {
    const handlePopState = () => {
      const token = localStorage.getItem('token');
      const adminToken = localStorage.getItem('adminToken');
      const isAuth = !!token;
      const isAdminAuth = !!adminToken;
      const currentPath = (() => {
        if (window.location.protocol === 'file:' || window.location.hash) {
          const hashPath = window.location.hash.replace(/^#/, '') || '/';
          return hashPath.startsWith('/') ? hashPath.split('?')[0] : `/${hashPath.split('?')[0]}`;
        }
        return window.location.pathname;
      })();

      // If not authenticated, always redirect to login/admin-login on protected routes
      const protectedRoutes = [
        '/dashboard',
        '/analytics',
        '/create-masters',
        '/rfid-integration',
        '/label-stock',
        '/label-stock/bulk-upload-images',
        '/bulk-upload-images',
        '/invoice-stock',
        '/rfid-label',
        '/rfid-devices',
        '/stock-tracking',
        '/box-rfid',
        '/box-rfid/box-list',
        '/rfid-tags',
        '/tag-usage',
        '/rfid-utility',
        '/rfid-utility/tray-connect',
        '/rfid-utility/auto-push-stock',
        '/rfid-utility/map-fields',
        '/rfid-utility/template',
        '/rfid-utility/item-images',
        '/rfid-utility/about-sparkle',
        '/stock-verification',
        '/stock-verification-rfid-tray', '/stock-taking-matched-list', '/stock-taking-unmatched-list',
        '/upload-rfid',
        '/rfid-transactions',
        '/rfid-app-download',
        '/third-party-integration',
        '/feronia-integration',
        '/kumar916-stock-master',
        '/varakrupa-integration',
        '/varakrupa-sold-to-user',
        '/varakrupa-sync-order',
        '/download-api-doc',
        '/download-resources',
        '/single-use-tags', '/sync-labelled-stock-tid',
        '/profile-menu',
        '/fingerprint-register',
        '/face-register',
        '/passkey-settings',
        '/rfid-sample-in-out',
        '/offline-api-settings',
        '/download-folder-settings'
      ];
      const adminRoutes = ['/admin-dashboard'];

      if (!isAuth && !isAdminAuth) {
        if (protectedRoutes.includes(currentPath) || currentPath.startsWith('/box-rfid/box-list/')) {
          navigate('/login', { replace: true });
        } else if (adminRoutes.includes(currentPath)) {
          navigate('/admin-login', { replace: true });
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [navigate]);
};

// Protected route authentication check with enhanced validation
const isAuthenticated = () => {
  const token = localStorage.getItem('token');
  if (!token) return false;

  try {
    // Validate token format and expiry
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const tokenPayload = JSON.parse(window.atob(base64));

    // Check if token is expired (if exp field exists)
    if (tokenPayload.exp) {
      const currentTime = Math.floor(Date.now() / 1000);
      const isValid = tokenPayload.exp > currentTime;

      // If token is expired, clear storage
      if (!isValid) {
        localStorage.removeItem('token');
        localStorage.removeItem('userInfo');
        localStorage.removeItem('lastLoginTime');
      }

      return isValid;
    }

    return true; // If no expiry field, consider valid
  } catch (error) {
    // Invalid token format, clear storage
    localStorage.removeItem('token');
    localStorage.removeItem('userInfo');
    localStorage.removeItem('lastLoginTime');
    return false;
  }
};

// Admin authentication check
const isAdminAuthenticated = () => {
  const adminToken = localStorage.getItem('adminToken');
  if (!adminToken) return false;

  try {
    // Validate admin token format and expiry
    const base64Url = adminToken.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const tokenPayload = JSON.parse(window.atob(base64));

    // Check if token is expired (if exp field exists)
    if (tokenPayload.exp) {
      const currentTime = Math.floor(Date.now() / 1000);
      const isValid = tokenPayload.exp > currentTime;

      // If token is expired, clear storage
      if (!isValid) {
        localStorage.removeItem('adminToken');
      }

      return isValid;
    }

    return true; // If no expiry field, consider valid
  } catch (error) {
    // Invalid token format, clear storage
    localStorage.removeItem('adminToken');
    return false;
  }
};

// Common page wrapper component with smooth scroll
const PageWrapper = ({ children }) => (
  <div className="page-wrapper app-ui-shell" style={{
    height: '100vh',
    overflowY: 'auto',
    scrollBehavior: 'smooth',
    msOverflowStyle: 'none', /* IE and Edge */
    scrollbarWidth: 'none'  /* Firefox */
    /* Chrome, Safari, Opera scrollbar is handled via CSS class */
  }}>
    {children}
  </div>
);

const FullHeightPageWrapper = ({ children }) => (
  <div className="analytics-fit-shell">
    {children}
  </div>
);

// Session timeout management
const useSessionTimeout = () => {
  const navigate = useNavigate();
  const timeoutRef = React.useRef(null);
  const warningRef = React.useRef(null);

  const TIMEOUT_DURATION = 30 * 60 * 1000; // 30 minutes
  const WARNING_DURATION = 5 * 60 * 1000; // 5 minutes before timeout

  const logout = React.useCallback(() => {
    // Clear all authentication data
    localStorage.removeItem('token');
    localStorage.removeItem('userInfo');
    localStorage.removeItem('lastLoginTime');
    localStorage.removeItem('showWelcomeToast');
    localStorage.removeItem('adminToken');
    sessionStorage.clear();

    // Navigate to login
    navigate('/login?session_expired=true', { replace: true });
  }, [navigate]);

  const resetTimeout = React.useCallback(() => {
    // Clear existing timeouts
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (warningRef.current) clearTimeout(warningRef.current);

    // Only set timeout if user is authenticated
    const token = localStorage.getItem('token');
    const adminToken = localStorage.getItem('adminToken');

    if (token || adminToken) {
      // Set warning timeout
      warningRef.current = setTimeout(() => {
        console.warn('Session will expire in 5 minutes');
      }, TIMEOUT_DURATION - WARNING_DURATION);

      // Set logout timeout
      timeoutRef.current = setTimeout(() => {
        logout();
      }, TIMEOUT_DURATION);
    }
  }, [logout, TIMEOUT_DURATION, WARNING_DURATION]);

  React.useEffect(() => {
    // Events that reset the timeout
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];

    const resetTimeoutHandler = () => resetTimeout();

    // Add event listeners
    events.forEach(event => {
      document.addEventListener(event, resetTimeoutHandler, true);
    });

    // Initial timeout setup
    resetTimeout();

    // Cleanup
    return () => {
      events.forEach(event => {
        document.removeEventListener(event, resetTimeoutHandler, true);
      });
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (warningRef.current) clearTimeout(warningRef.current);
    };
  }, [resetTimeout]);
};

// Global Authentication Guard Component
const AuthGuard = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();

  // Add session timeout management
  useSessionTimeout();

  React.useEffect(() => {
    const checkAuth = () => {
      const token = localStorage.getItem('token');
      const adminToken = localStorage.getItem('adminToken');
      const currentPath = location.pathname;

      // Public routes that don't require authentication
      const publicRoutes = ['/login', '/register', '/admin-login', '/product-view'];

      // If on a public route, allow access
      if (publicRoutes.includes(currentPath)) {
        return;
      }

      // Protected user routes
      const userRoutes = ['/analytics', '/dashboard', '/create-masters', '/api-documentation', '/rfid-integration', '/label-stock', '/label-stock/bulk-upload-images', '/bulk-upload-images', '/product-details', '/invoice-stock', '/rfid-label', '/rfid-devices', '/stock-tracking', '/box-rfid', '/box-rfid/box-list', '/rfid-tags', '/tag-usage', '/rfid-utility', '/rfid-utility/tray-connect', '/rfid-utility/auto-push-stock', '/rfid-utility/map-fields', '/rfid-utility/template', '/rfid-utility/item-images', '/rfid-utility/about-sparkle', '/stock-verification', '/stock-verification-rfid-tray', '/stock-taking-matched-list', '/stock-taking-unmatched-list', '/stock-transfer', '/upload-rfid', '/rfid-transactions', '/rfid-app-download', '/third-party-integration', '/feronia-integration', '/kumar916-stock-master', '/varakrupa-integration', '/varakrupa-sold-to-user', '/varakrupa-sync-order', '/download-api-doc', '/download-resources', '/single-use-tags', '/sync-labelled-stock-tid', '/profile-menu', '/fingerprint-register', '/face-register', '/passkey-settings', '/rfid-sample-in-out', '/offline-api-settings', '/download-folder-settings'];

      // Admin routes
      const adminRoutes = ['/admin-dashboard'];

      // Check if trying to access user routes
      if (userRoutes.includes(currentPath) || currentPath.startsWith('/box-rfid/box-list/')) {
        if (!isAuthenticated()) {
          navigate('/login', { replace: true });
          return;
        }
      }

      // Check if trying to access admin routes
      if (adminRoutes.includes(currentPath)) {
        if (!isAdminAuthenticated()) {
          navigate('/admin-login', { replace: true });
          return;
        }
      }

      // Handle root path
      if (currentPath === '/') {
        if (isAuthenticated()) {
          navigate('/analytics', { replace: true });
        } else if (isAdminAuthenticated()) {
          navigate('/admin-dashboard', { replace: true });
        } else {
          navigate('/login', { replace: true });
        }
      }
    };

    // Check authentication on every route change
    checkAuth();
  }, [location.pathname, navigate]);

  return children;
};

// Routes wrapper component with authentication protection
const RoutesWrapper = () => {
  useAuthProtection();

  return (
    <AuthGuard>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/admin-login" element={<AdminLogin />} />
        <Route path="/product-view" element={<PublicProductScanView />} />

        {/* Admin dashboard (protected) */}
        <Route
          path="/admin-dashboard"
          element={
            <AuthGuard>
              <AdminDashboard />
            </AuthGuard>
          }
        />

        {/* User protected routes (all require AuthGuard) */}
        <Route element={<Layout />}>
          <Route path="/analytics" element={<AuthGuard><FullHeightPageWrapper><DashboardAnalytics /></FullHeightPageWrapper></AuthGuard>} />
          <Route path="/dashboard" element={<AuthGuard><PageWrapper><Dashboard /></PageWrapper></AuthGuard>} />
          <Route path="/create-masters" element={<AuthGuard><PageWrapper><CreateMasters /></PageWrapper></AuthGuard>} />
          <Route path="/api-documentation" element={<AuthGuard><PageWrapper><APIDocumentation /></PageWrapper></AuthGuard>} />
          <Route
            path="/rfid-integration"
            element={
              <AuthGuard>
                <PageWrapper>
                  <RFIDIntegration />
                </PageWrapper>/label-stock
              </AuthGuard>
            }
          />
          <Route
            path="/label-stock"
            element={
              <AuthGuard>
                <PageWrapper>
                  <LabelStockList />
                </PageWrapper>
              </AuthGuard>
            }
          />
          <Route
            path="/label-stock/bulk-upload-images"
            element={<AuthGuard><Navigate to="/bulk-upload-images" replace /></AuthGuard>}
          />
          <Route
            path="/bulk-upload-images"
            element={
              <AuthGuard>
                <PageWrapper>
                  <BulkProductImageUpload />
                </PageWrapper>
              </AuthGuard>
            }
          />
          <Route
            path="/product-details"
            element={
              <AuthGuard>
                <PageWrapper>
                  <ProductDetailsPage />
                </PageWrapper>
              </AuthGuard>
            }
          />
          <Route
            path="/labeling"
            element={
              <AuthGuard>
                <PageWrapper>
                  <Labeling />
                </PageWrapper>
              </AuthGuard>
            }
          />
          <Route
            path="/stock"
            element={
              <AuthGuard>
                <PageWrapper>
                  <AddStock />
                </PageWrapper>
              </AuthGuard>
            }
          />
          <Route
            path="/quotation"
            element={
              <AuthGuard>
                <PageWrapper>
                  <QuotationNew />
                </PageWrapper>
              </AuthGuard>
            }
          />
          <Route
            path="/quotation-rfid-tray"
            element={
              <AuthGuard>
                <PageWrapper>
                  <QuotationWithRFIDTray />
                </PageWrapper>
              </AuthGuard>
            }
          />
          <Route
            path="/quotation_list"
            element={
              <AuthGuard>
                <PageWrapper>
                  <QuotationList />
                </PageWrapper>
              </AuthGuard>
            }
          />
          <Route
            path="/create-invoice"
            element={
              <AuthGuard>
                <PageWrapper>
                  <CreateInvoice />
                </PageWrapper>
              </AuthGuard>
            }
          />
          <Route
            path="/invoice-stock"
            element={
              <AuthGuard>
                <PageWrapper>
                  <InvoiceStock />
                </PageWrapper>
              </AuthGuard>
            }
          />
          <Route
            path="/order-list"
            element={
              <AuthGuard>
                <PageWrapper>
                  <OrderList />
                </PageWrapper>
              </AuthGuard>
            }
          />
          <Route
            path="/reports"
            element={
              <AuthGuard>
                <PageWrapper>
                  <Reports />
                </PageWrapper>
              </AuthGuard>
            }
          />
          <Route
            path="/stock-report-summary"
            element={
              <AuthGuard>
                <PageWrapper>
                  <StockReportSummary />
                </PageWrapper>
              </AuthGuard>
            }
          />
          <Route
            path="/stock-report-dashboard"
            element={
              <AuthGuard>
                <PageWrapper>
                  <StockReportDashboard />
                </PageWrapper>
              </AuthGuard>
            }
          />
          <Route
            path="/rfid-label"
            element={
              <AuthGuard>
                <PageWrapper>
                  <RFIDLabel />
                </PageWrapper>
              </AuthGuard>
            }
          />
          <Route
            path="/single-use-tags"
            element={
              <AuthGuard>
                <PageWrapper>
                  <SingleUseTags />
                </PageWrapper>
              </AuthGuard>
            }
          />
          <Route
            path="/sync-labelled-stock-tid"
            element={
              <AuthGuard>
                <PageWrapper>
                  <SyncLabelledStockTidPage />
                </PageWrapper>
              </AuthGuard>
            }
          />
          <Route
            path="/profile-menu"
            element={
              <AuthGuard>
                <PageWrapper>
                  <ProfileMenuPage />
                </PageWrapper>
              </AuthGuard>
            }
          />
          <Route
            path="/offline-api-settings"
            element={
              <AuthGuard>
                <PageWrapper>
                  <OfflineApiBaseSettingsPage />
                </PageWrapper>
              </AuthGuard>
            }
          />
          <Route
            path="/download-folder-settings"
            element={
              <AuthGuard>
                <PageWrapper>
                  <DownloadFoldersSettingsPage />
                </PageWrapper>
              </AuthGuard>
            }
          />
          <Route
            path="/fingerprint-register"
            element={
              <AuthGuard>
                <PageWrapper>
                  <FingerprintSettingsPage />
                </PageWrapper>
              </AuthGuard>
            }
          />
          <Route
            path="/passkey-settings"
            element={
              <AuthGuard>
                <PageWrapper>
                  <PasskeySettingsPage />
                </PageWrapper>
              </AuthGuard>
            }
          />
          <Route
            path="/face-register"
            element={
              <AuthGuard>
                <PageWrapper>
                  <FaceSettingsPage />
                </PageWrapper>
              </AuthGuard>
            }
          />
          <Route
            path="/create-label"
            element={
              <AuthGuard>
                <PageWrapper>
                  <CreateLabel />
                </PageWrapper>
              </AuthGuard>
            }
          />
          <Route
            path="/sample-out"
            element={
              <AuthGuard>
                <PageWrapper>
                  <SampleOut />
                </PageWrapper>
              </AuthGuard>
            }
          />
          <Route
            path="/sample-out-list"
            element={
              <AuthGuard>
                <PageWrapper>
                  <SampleOutList />
                </PageWrapper>
              </AuthGuard>
            }
          />
          <Route
            path="/sample-in"
            element={
              <AuthGuard>
                <PageWrapper>
                  <SampleIn />
                </PageWrapper>
              </AuthGuard>
            }
          />
          <Route
            path="/rfid-sample-in-out"
            element={
              <AuthGuard>
                <PageWrapper>
                  <RFIDSampleInOut />
                </PageWrapper>
              </AuthGuard>
            }
          />
          <Route
            path="/rfid-devices"
            element={
              <AuthGuard>
                <PageWrapper>
                  <RFIDDeviceDetails />
                </PageWrapper>
              </AuthGuard>
            }
          />
          <Route
            path="/stock-tracking"
            element={
              <AuthGuard>
                <PageWrapper>
                  <StockTracking />
                </PageWrapper>
              </AuthGuard>
            }
          />
          <Route
            path="/box-rfid"
            element={
              <AuthGuard>
                <PageWrapper>
                  <BoxRfid />
                </PageWrapper>
              </AuthGuard>
            }
          />
          <Route
            path="/box-rfid/box-list"
            element={
              <AuthGuard>
                <PageWrapper>
                  <BoxListWall />
                </PageWrapper>
              </AuthGuard>
            }
          />
          <Route
            path="/box-rfid/box-list/:boxId"
            element={
              <AuthGuard>
                <PageWrapper>
                  <BoxDetailsPage />
                </PageWrapper>
              </AuthGuard>
            }
          />
          <Route
            path="/rfid-tags"
            element={
              <AuthGuard>
                <PageWrapper>
                  <RFIDTags />
                </PageWrapper>
              </AuthGuard>
            }
          />
          <Route
            path="/tag-usage"
            element={
              <AuthGuard>
                <PageWrapper>
                  <TagUsage />
                </PageWrapper>
              </AuthGuard>
            }
          />
          <Route
            path="/rfid-utility"
            element={
              <AuthGuard>
                <PageWrapper>
                  <RFIDUtility />
                </PageWrapper>
              </AuthGuard>
            }
          />
          <Route
            path="/rfid-utility/tray-connect"
            element={
              <AuthGuard>
                <PageWrapper>
                  <RFIDTrayConnect />
                </PageWrapper>
              </AuthGuard>
            }
          />
          <Route
            path="/rfid-utility/auto-push-stock"
            element={
              <AuthGuard>
                <PageWrapper>
                  <AutoPushStockUtility />
                </PageWrapper>
              </AuthGuard>
            }
          />
          <Route
            path="/rfid-utility/map-fields"
            element={
              <AuthGuard>
                <PageWrapper>
                  <MapFieldsUtility />
                </PageWrapper>
              </AuthGuard>
            }
          />
          <Route
            path="/rfid-utility/template"
            element={
              <AuthGuard>
                <PageWrapper>
                  <TemplateUtility />
                </PageWrapper>
              </AuthGuard>
            }
          />
          <Route
            path="/rfid-utility/item-images"
            element={
              <AuthGuard>
                <PageWrapper>
                  <ItemImageFolderUtility />
                </PageWrapper>
              </AuthGuard>
            }
          />
          <Route
            path="/rfid-utility/about-sparkle"
            element={
              <AuthGuard>
                <PageWrapper>
                  <AboutSparkleApplication />
                </PageWrapper>
              </AuthGuard>
            }
          />
          <Route
            path="/stock-verification"
            element={
              <AuthGuard>
                <PageWrapper>
                  <StockVerification />
                </PageWrapper>
              </AuthGuard>
            }
          />
          <Route
            path="/stock-taking-matched-list"
            element={
              <AuthGuard>
                <PageWrapper>
                  <StockTakingMatchedList />
                </PageWrapper>
              </AuthGuard>
            }
          />
          <Route
            path="/stock-taking-unmatched-list"
            element={
              <AuthGuard>
                <PageWrapper>
                  <StockTakingUnmatchedList />
                </PageWrapper>
              </AuthGuard>
            }
          />
          <Route
            path="/stock-verification-rfid-tray"
            element={
              <AuthGuard>
                <PageWrapper>
                  <StockVerificationWithRFIDTray />
                </PageWrapper>
              </AuthGuard>
            }
          />
          <Route
            path="/stock-transfer"
            element={
              <AuthGuard>
                <PageWrapper>
                  <StockTransfer />
                </PageWrapper>
              </AuthGuard>
            }
          />
          <Route
            path="/session-details/:sessionId"
            element={
              <AuthGuard>
                <PageWrapper>
                  <SessionDetails />
                </PageWrapper>
              </AuthGuard>
            }
          />

          <Route
            path="/upload-rfid"
            element={
              <AuthGuard>
                <PageWrapper>
                  <UploadRFID />
                </PageWrapper>
              </AuthGuard>
            }
          />
          <Route
            path="/rfid-transactions"
            element={
              <AuthGuard>
                <PageWrapper>
                  <RFIDTransactions />
                </PageWrapper>
              </AuthGuard>
            }
          />
          <Route
            path="/rfid-app-download"
            element={
              <AuthGuard>
                <PageWrapper>
                  <RFIDAppDownload />
                </PageWrapper>
              </AuthGuard>
            }
          />
          <Route
            path="/download-api-doc"
            element={
              <AuthGuard>
                <PageWrapper>
                  <DownloadApiDoc />
                </PageWrapper>
              </AuthGuard>
            }
          />
          <Route
            path="/download-resources"
            element={
              <AuthGuard>
                <PageWrapper>
                  <DownloadResources />
                </PageWrapper>
              </AuthGuard>
            }
          />
          <Route
            path="/third-party-integration"
            element={
              <AuthGuard>
                <PageWrapper>
                  <ThirdPartySoftwareIntegration />
                </PageWrapper>
              </AuthGuard>
            }
          />
          <Route
            path="/feronia-integration"
            element={
              <AuthGuard>
                <PageWrapper>
                  <FeroniaIntegration />
                </PageWrapper>
              </AuthGuard>
            }
          />
          <Route
            path="/kumar916-stock-master"
            element={
              <AuthGuard>
                <PageWrapper>
                  <Kumar916StockMasterIntegration />
                </PageWrapper>
              </AuthGuard>
            }
          />
          <Route
            path="/varakrupa-integration"
            element={
              <AuthGuard>
                <PageWrapper>
                  <VarakrupaIntegration />
                </PageWrapper>
              </AuthGuard>
            }
          />
          <Route
            path="/varakrupa-sold-to-user"
            element={
              <AuthGuard>
                <PageWrapper>
                  <VarakrupaSoldItemToUser />
                </PageWrapper>
              </AuthGuard>
            }
          />
          <Route
            path="/varakrupa-sync-order"
            element={
              <AuthGuard>
                <FullHeightPageWrapper>
                  <VarakrupaSyncOrder />
                </FullHeightPageWrapper>
              </AuthGuard>
            }
          />
        </Route>

        {/* Admin routes */}
        <Route
          path="/admin-rfid-tags-report"
          element={
            <AuthGuard>
              <PageWrapper>
                <AdminRfidTagsReport />
              </PageWrapper>
            </AuthGuard>
          }
        />

        {/* Not found route */}
        <Route path="*" element={<NotFound />} />
        <Route path="/" element={<Navigate to="/analytics" replace />} />
      </Routes>
    </AuthGuard>
  );
};

function App() {
  return (
    <TranslationProvider>
      <NotificationProvider>
        <LoadingProvider>
          <Router>
            <RouteLoadingSync />
            <div style={{
              minHeight: '100vh',
              display: 'flex',
              flexDirection: 'column',
              background: 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)'
            }}>
              <style>{`
                /* Global Roboto Font Application */
                * {
                  font-family: 'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
                }
                
                .page-wrapper {
                  height: 100vh;
                  overflow-y: auto;
                  scroll-behavior: smooth;
                  -ms-overflow-style: none;  /* IE and Edge */
                  scrollbar-width: none;  /* Firefox */
                }
                .page-wrapper::-webkit-scrollbar {
                  display: none; /* Chrome, Safari, Opera */
                }
                /* Hide vertical scrollbar globally */
                html, body {
                  scrollbar-width: none; /* Firefox */
                  -ms-overflow-style: none; /* IE and Edge */
                }
                html::-webkit-scrollbar, body::-webkit-scrollbar {
                  display: none;
                }
                .content-fade-in {
                  animation: fadeIn 0.5s ease-in-out;
                }
                
                @keyframes fadeIn {
                  from {
                    opacity: 0;
                    transform: translateY(10px);
                  }
                  to {
                    opacity: 1;
                    transform: translateY(0);
                  }
                }
                
                .smooth-scroll {
                  scroll-behavior: smooth;
                  transition: all 0.3s ease;
                }
                
                /* Add smooth transition for route changes */
                .route-transition {
                  animation: routeChange 0.3s ease-out;
                }
                
                @keyframes routeChange {
                  from {
                    opacity: 0;
                    transform: translateY(20px);
                  }
                  to {
                    opacity: 1;
                    transform: translateY(0);
                  }
                }
              `}</style>

              <RoutesWrapper />
            </div>
            <ToastContainer
              position="top-right"
              autoClose={4000}
              hideProgressBar={false}
              newestOnTop
              closeOnClick
              rtl={false}
              pauseOnFocusLoss
              draggable
              pauseOnHover
              theme="light"
              style={{ top: 16 }}
            />
          </Router>
        </LoadingProvider>
      </NotificationProvider>
    </TranslationProvider>
  );
}

export default App; 