import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import * as XLSX from 'xlsx';
import {
  FaExclamationTriangle,
  FaCheckCircle,
  FaTimesCircle,
  FaFileExcel,
  FaArrowLeft,
  FaSearch,
} from 'react-icons/fa';
import { useNotifications } from '../../context/NotificationContext';
import { useLoading } from '../../App';
import PageHeader from '../common/PageHeader';
import {
  fetchStockVerificationSessionPage,
  fetchStockVerificationSessionPages,
  getSessionListDisplayQty,
  SESSION_DETAIL_PAGE_SIZE,
  resolveSessionListPageCount,
} from '../../utils/stockVerificationSessionUtils';

const SV = {
  accent: '#0f766e',
  accentDark: '#115e59',
  headerBg: '#f8fafc',
  tableBg: '#fafafa',
};

const PAGE_SIZE_OPTIONS = [20, 50, 100];

const formatWeight = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return '0.000g';
  return `${n.toFixed(3)}g`;
};

const displayText = (value, fallback = 'N/A') => {
  if (value == null) return fallback;
  const text = String(value).trim();
  if (!text || text.toUpperCase() === 'NA') return fallback;
  return text;
};

const svTh = {
  padding: '5px 7px',
  textAlign: 'left',
  fontWeight: 700,
  fontSize: 9,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  color: '#64748b',
  borderRight: '1px solid #e4e4e7',
  whiteSpace: 'nowrap',
  background: SV.headerBg,
};

const svTd = {
  padding: '5px 7px',
  color: '#1e293b',
  fontSize: 10,
  lineHeight: 1.3,
  borderRight: '1px solid #ececec',
  borderBottom: '1px solid #e5e7eb',
  fontWeight: 500,
};

const generatePages = (currentPage, totalPages, compact) => {
  const maxPagesToShow = compact ? 3 : 7;
  if (totalPages <= maxPagesToShow) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages = [1];
  if (currentPage > 3) pages.push('...');
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);
  for (let i = start; i <= end; i += 1) pages.push(i);
  if (currentPage < totalPages - 2) pages.push('...');
  pages.push(totalPages);
  return pages;
};

const StatMetric = ({ label, value, tone = 'neutral' }) => (
  <div className={`sd-metric sd-metric--${tone}`}>
    <span>{label}</span>
    <strong>{value}</strong>
  </div>
);

const SessionItemsCard = ({
  title,
  tone,
  icon,
  items,
  searchQuery,
  onSearch,
  page,
  setPage,
  pageSize,
  setPageSize,
  emptyLabel,
  isPhone,
  totalCount,
  hasNextPage,
  totalPages,
}) => {
  const serverTotalPages = Math.max(1, Number(totalPages) || 1);
  const start = items.length === 0 ? 0 : ((page - 1) * pageSize) + 1;
  const end = start === 0 ? 0 : start + items.length - 1;
  const qty = totalCount ?? getSessionListDisplayQty(items);
  const rows = items;
  const pages = generatePages(page, serverTotalPages, isPhone);
  const [goto, setGoto] = useState('');
  const canNext = Boolean(hasNextPage) || page < serverTotalPages;

  const goToPage = (next) => {
    const n = Number(next);
    if (n >= 1 && (n <= serverTotalPages || (n === page + 1 && canNext))) {
      setPage(n);
      setGoto('');
    }
  };

  return (
    <section className={`sd-card sd-items-card sd-items-card--${tone}`}>
      <div className="sd-card-toolbar">
        <div className="sd-card-title">
          {icon}
          <span>{title}</span>
          <span className={`sd-count-pill sd-count-pill--${tone}`}>{qty} items</span>
        </div>
        <div className="sv-search-wrap">
          <FaSearch />
          <input
            type="text"
            placeholder="Search item, RFID, category…"
            value={searchQuery}
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="sd-table-wrap">
        <table className="app-data-table" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 620 }}>
          <thead>
            <tr style={{ background: SV.headerBg, boxShadow: '0 1px 0 #e4e4e7' }}>
              <th style={svTh}>Item Code</th>
              <th style={svTh}>Product Name</th>
              <th style={svTh}>Category</th>
              <th style={svTh}>RFID Code</th>
              <th style={{ ...svTh, textAlign: 'center' }}>Gross Wt</th>
              <th style={{ ...svTh, textAlign: 'center', borderRight: 'none' }}>Net Wt</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ ...svTd, padding: 36, textAlign: 'center', color: '#737373', borderRight: 'none' }}>
                  {searchQuery ? 'No matches found' : emptyLabel}
                </td>
              </tr>
            ) : rows.map((item, index) => {
              const globalIndex = (page - 1) * pageSize + index;
              return (
                <tr
                  key={item.Id || `${item.ItemCode || 'row'}-${globalIndex}`}
                  style={{ background: globalIndex % 2 === 0 ? '#ffffff' : SV.tableBg }}
                >
                  <td style={{ ...svTd, fontWeight: 700, color: '#171717' }}>{displayText(item.ItemCode)}</td>
                  <td style={svTd}>{displayText(item.ProductName)}</td>
                  <td style={svTd}>{displayText(item.CategoryName)}</td>
                  <td style={{ ...svTd, fontFamily: 'ui-monospace, monospace' }}>{displayText(item.RFIDCode, 'RFID tag not attached')}</td>
                  <td style={{ ...svTd, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{formatWeight(item.GrossWeight)}</td>
                  <td style={{ ...svTd, textAlign: 'center', borderRight: 'none', fontVariantNumeric: 'tabular-nums' }}>{formatWeight(item.NetWeight)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="sv-pagination">
        <div className="sv-pagination-meta">
          <span>
            {Number(qty).toLocaleString()} total
            {items.length > 0 ? ` · ${start}–${end} this page` : ''}
          </span>
          <label className="sv-pagination-size">
            <span>Per page</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="sv-pagination-nav">
          <button type="button" className="sv-page-btn" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
            Prev
          </button>
          {isPhone ? (
            <span className="sv-page-indicator">{page} / {serverTotalPages}</span>
          ) : (
            pages.map((p, index) =>
              p === '...' ? (
                <span key={`ellipsis-${index}`} className="sv-page-ellipsis">…</span>
              ) : (
                <button
                  type="button"
                  key={p}
                  className={`sv-page-num${page === p ? ' is-current' : ''}`}
                  onClick={() => setPage(p)}
                >
                  {p}
                </button>
              )
            )
          )}
          <button type="button" className="sv-page-btn" onClick={() => setPage((p) => p + 1)} disabled={!canNext}>
            Next
          </button>
          {!isPhone ? (
            <div className="sv-page-goto">
              <span>Go to</span>
              <input
                type="text"
                value={goto}
                onChange={(e) => {
                  if (e.target.value === '' || /^\d+$/.test(e.target.value)) setGoto(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') goToPage(goto);
                }}
                placeholder="#"
              />
              <button type="button" className="sv-page-btn" onClick={() => goToPage(goto)}>Go</button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
};

const SessionDetails = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { setLoading: setGlobalLoading } = useLoading();
  const { addNotification } = useNotifications();

  const [sessionDetails, setSessionDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [listPage, setListPage] = useState(1);
  const [listPageSize, setListPageSize] = useState(SESSION_DETAIL_PAGE_SIZE);
  const [matchedSearchQuery, setMatchedSearchQuery] = useState('');
  const [unmatchedSearchQuery, setUnmatchedSearchQuery] = useState('');
  const [clientCode, setClientCode] = useState('');
  const [exportBusy, setExportBusy] = useState(false);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  const isSmallScreen = windowWidth <= 768;
  const isPhone = windowWidth <= 640;

  const filteredMatchedList = useMemo(() => {
    if (!sessionDetails?.MatchedList) return [];
    if (!matchedSearchQuery) return sessionDetails.MatchedList;
    const lowerQuery = matchedSearchQuery.toLowerCase();
    return sessionDetails.MatchedList.filter((item) =>
      (item.ItemCode && String(item.ItemCode).toLowerCase().includes(lowerQuery)) ||
      (item.ProductName && String(item.ProductName).toLowerCase().includes(lowerQuery)) ||
      (item.BranchName && String(item.BranchName).toLowerCase().includes(lowerQuery)) ||
      (item.CounterName && String(item.CounterName).toLowerCase().includes(lowerQuery)) ||
      (item.counterName && String(item.counterName).toLowerCase().includes(lowerQuery)) ||
      (item.CategoryName && String(item.CategoryName).toLowerCase().includes(lowerQuery)) ||
      (item.RFIDCode && String(item.RFIDCode).toLowerCase().includes(lowerQuery))
    );
  }, [sessionDetails?.MatchedList, matchedSearchQuery]);

  const filteredUnmatchedList = useMemo(() => {
    if (!sessionDetails?.UnmatchedList) return [];
    if (!unmatchedSearchQuery) return sessionDetails.UnmatchedList;
    const lowerQuery = unmatchedSearchQuery.toLowerCase();
    return sessionDetails.UnmatchedList.filter((item) =>
      (item.ItemCode && String(item.ItemCode).toLowerCase().includes(lowerQuery)) ||
      (item.ProductName && String(item.ProductName).toLowerCase().includes(lowerQuery)) ||
      (item.BranchName && String(item.BranchName).toLowerCase().includes(lowerQuery)) ||
      (item.CounterName && String(item.CounterName).toLowerCase().includes(lowerQuery)) ||
      (item.counterName && String(item.counterName).toLowerCase().includes(lowerQuery)) ||
      (item.CategoryName && String(item.CategoryName).toLowerCase().includes(lowerQuery)) ||
      (item.RFIDCode && String(item.RFIDCode).toLowerCase().includes(lowerQuery))
    );
  }, [sessionDetails?.UnmatchedList, unmatchedSearchQuery]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('userInfo');
      if (stored) {
        const parsed = JSON.parse(stored);
        setClientCode(parsed.ClientCode || parsed.clientCode || '');
      }
    } catch (err) {
      console.error('Error parsing userInfo:', err);
    }
  }, []);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (sessionId && clientCode) {
      fetchSessionDetails(sessionId, listPage, listPageSize);
    }
  }, [sessionId, clientCode, listPage, listPageSize]);

  const fetchSessionDetails = async (scanBatchId, pageNumber = listPage, pageSize = listPageSize) => {
    try {
      const isFirstLoad = !sessionDetails;
      if (isFirstLoad) setLoading(true);
      setGlobalLoading(true);
      setError(null);

      const token = localStorage.getItem('token');
      const session = await fetchStockVerificationSessionPage(clientCode, scanBatchId, {
        pageNumber,
        pageSize,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      setSessionDetails(session);
    } catch (err) {
      console.error('Error fetching session details:', err);
      setError(err.message || 'Failed to load session details');
      toast.error('Failed to load session details');
    } finally {
      setLoading(false);
      setGlobalLoading(false);
    }
  };

  const exportSessionDetails = async () => {
    if (!sessionDetails || !sessionId || !clientCode) {
      toast.error('No session data available for export');
      return;
    }

    setExportBusy(true);
    setGlobalLoading(true);
    try {
      const token = localStorage.getItem('token');
      const exportSession = await fetchStockVerificationSessionPages(clientCode, sessionId, {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      });
      const wb = XLSX.utils.book_new();
      const summaryData = [
        ['Stock Verification Export'],
        ['Generated on:', new Date().toLocaleString('en-IN')],
        [''],
        ['Branch Information'],
        ['Branch Name:', exportSession.BranchName?.trim() || 'N/A'],
        ['Counter Name:', exportSession.CounterName || 'N/A'],
        [''],
        ['Summary Statistics'],
        ['Total Items:', exportSession.Totals?.TotalQty || 0],
        ['Matched Items:', exportSession.Totals?.TotalMatchQty || 0],
        ['Unmatched Items:', exportSession.Totals?.TotalUnmatchQty || 0],
        ['Total Gross Weight:', formatWeight(exportSession.Totals?.TotalGrossWeight)],
        ['Total Net Weight:', formatWeight(exportSession.Totals?.TotalNetWeight)],
        ['Match Weight:', formatWeight(exportSession.Totals?.TotalMatchGrossWeight)],
        [''],
        ['Export Details'],
        ['Matched rows:', exportSession.MatchedList?.length || 0],
        ['Unmatched rows:', exportSession.UnmatchedList?.length || 0],
        ['Matched qty:', exportSession.Totals?.TotalMatchQty || 0],
        ['Unmatched qty:', exportSession.Totals?.TotalUnmatchQty || 0],
      ];

      const summaryWS = XLSX.utils.aoa_to_sheet(summaryData);
      summaryWS['!cols'] = [{ width: 25 }, { width: 30 }];
      XLSX.utils.book_append_sheet(wb, summaryWS, 'Session Summary');

      if (exportSession.MatchedList?.length > 0) {
        const matchedHeaders = [
          'Item Code', 'Product Name', 'Category', 'RFIDCode', 'Gross Weight (g)', 'Net Weight (g)', 'Status',
        ];
        const matchedData = exportSession.MatchedList.map((item) => [
          item.ItemCode || 'N/A',
          item.ProductName || 'N/A',
          item.CategoryName || 'N/A',
          item.RFIDCode || 'RFID Tag not Attached',
          item.GrossWeight || 0,
          item.NetWeight || 0,
          'MATCHED',
        ]);
        const matchedWS = XLSX.utils.aoa_to_sheet([matchedHeaders, ...matchedData]);
        matchedWS['!cols'] = [
          { width: 15 }, { width: 25 }, { width: 15 }, { width: 20 }, { width: 15 }, { width: 15 }, { width: 12 },
        ];
        XLSX.utils.book_append_sheet(wb, matchedWS, 'Matched Items');
      }

      if (exportSession.UnmatchedList?.length > 0) {
        const unmatchedHeaders = [
          'Item Code', 'Product Name', 'Category', 'RFIDCode', 'Gross Weight (g)', 'Net Weight (g)', 'Status',
        ];
        const unmatchedData = exportSession.UnmatchedList.map((item) => [
          item.ItemCode || 'N/A',
          item.ProductName || 'N/A',
          item.CategoryName || 'N/A',
          item.RFIDCode || 'RFID Tag not Attached',
          item.GrossWeight || 0,
          item.NetWeight || 0,
          'UNMATCHED',
        ]);
        const unmatchedWS = XLSX.utils.aoa_to_sheet([unmatchedHeaders, ...unmatchedData]);
        unmatchedWS['!cols'] = [
          { width: 15 }, { width: 25 }, { width: 15 }, { width: 20 }, { width: 15 }, { width: 15 }, { width: 12 },
        ];
        XLSX.utils.book_append_sheet(wb, unmatchedWS, 'Unmatched Items');
      }

      const branchName = exportSession.BranchName?.trim() || 'Unknown';
      const filename = `Stock_Verification_${branchName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, filename);

      toast.success(`Session details exported successfully as ${filename}`);
      addNotification({
        title: 'Export Successful',
        description: `Session details exported to ${filename}`,
        type: 'info',
      });
    } catch (exportError) {
      console.error('Error exporting session details:', exportError);
      toast.error('Failed to export session details. Please try again.');
      addNotification({
        title: 'Export Failed',
        description: 'Failed to export session details. Please try again.',
        type: 'error',
      });
    } finally {
      setExportBusy(false);
      setGlobalLoading(false);
    }
  };

  if (loading) {
    return <div className="session-details-page" style={{ minHeight: '40vh', background: '#f8fafc' }} />;
  }

  if (error || !sessionDetails) {
    return (
      <div className="session-details-page" style={{ padding: isSmallScreen ? 8 : 12, fontFamily: 'var(--font-family)', background: '#f8fafc', minHeight: '100%' }}>
        <div className="sd-empty">
          <FaExclamationTriangle />
          <h5>No data available</h5>
          <p>Unable to load session details.</p>
          <button type="button" className="sv-chip" onClick={() => navigate('/stock-verification')}>
            <FaArrowLeft /> Back to Stock Verification
          </button>
        </div>
        <style>{sessionDetailsStyles}</style>
      </div>
    );
  }

  const totals = sessionDetails.Totals || {};
  const listPaging = sessionDetails.Paging || {};
  const listTotalPages = resolveSessionListPageCount(
    { ...listPaging, pageNumber: listPage, pageSize: listPageSize },
    listPageSize
  );
  const branchName = sessionDetails.BranchName?.trim()
    || sessionDetails.MatchedList?.[0]?.BranchName
    || sessionDetails.UnmatchedList?.[0]?.BranchName
    || '';
  const counterName = sessionDetails.CounterName?.trim()
    || sessionDetails.MatchedList?.[0]?.CounterName
    || sessionDetails.MatchedList?.[0]?.counterName
    || sessionDetails.UnmatchedList?.[0]?.CounterName
    || sessionDetails.UnmatchedList?.[0]?.counterName
    || '';
  const sessionLabel = sessionDetails.SessionNumber ? `Session ${sessionDetails.SessionNumber}` : 'Session';

  return (
    <div
      className="session-details-page"
      style={{
        fontFamily: 'var(--font-family)',
        padding: isSmallScreen ? 8 : 12,
        fontSize: 11,
        minHeight: '100%',
        background: '#f8fafc',
      }}
    >
      <div className="sv-top">
        <div className="sv-top-inner">
          <PageHeader
            title="Stock Verification"
            subtitle={sessionLabel}
            barStyle={{ padding: 0, margin: 0, gap: 10, borderBottom: 'none' }}
            actions={(
              <div className="sv-header-actions">
                <button type="button" className="sv-chip" onClick={() => navigate('/stock-verification')}>
                  <FaArrowLeft /> Back
                </button>
                <button type="button" className="sv-chip sv-chip--accent" onClick={exportSessionDetails} disabled={exportBusy}>
                  <FaFileExcel /> Export
                </button>
              </div>
            )}
          />
          <div className="sd-session-meta">
            <span className="sd-meta-chip">Branch: {displayText(branchName)}</span>
            <span className="sd-meta-chip">Counter: {displayText(counterName)}</span>
            <span className="sd-meta-chip sd-meta-chip--muted">{Number(totals.TotalQty || 0).toLocaleString()} items</span>
          </div>
        </div>
      </div>

      <section className="sd-card sd-summary">
        <div className="sd-summary-row">
          <StatMetric label="Total" value={totals.TotalQty || 0} tone="total" />
          <StatMetric label="Matched" value={totals.TotalMatchQty || 0} tone="match" />
          <StatMetric label="Unmatched" value={totals.TotalUnmatchQty || 0} tone="unmatch" />
          <StatMetric label="Gross wt" value={formatWeight(totals.TotalGrossWeight)} />
          <StatMetric label="Net wt" value={formatWeight(totals.TotalNetWeight)} />
          <StatMetric label="Match wt" value={formatWeight(totals.TotalMatchGrossWeight)} />
        </div>
      </section>

      <div className="sd-tables">
        <SessionItemsCard
          title="Matched items"
          tone="match"
          icon={<FaCheckCircle />}
          items={filteredMatchedList}
          searchQuery={matchedSearchQuery}
          onSearch={setMatchedSearchQuery}
          page={listPage}
          setPage={setListPage}
          pageSize={listPageSize}
          setPageSize={setListPageSize}
          emptyLabel="No matched items"
          isPhone={isPhone}
          totalCount={totals.TotalMatchQty}
          hasNextPage={listPaging.hasNextPage}
          totalPages={listTotalPages}
        />
        <SessionItemsCard
          title="Unmatched items"
          tone="unmatch"
          icon={<FaTimesCircle />}
          items={filteredUnmatchedList}
          searchQuery={unmatchedSearchQuery}
          onSearch={setUnmatchedSearchQuery}
          page={listPage}
          setPage={setListPage}
          pageSize={listPageSize}
          setPageSize={setListPageSize}
          emptyLabel="No unmatched items"
          isPhone={isPhone}
          totalCount={totals.TotalUnmatchQty}
          hasNextPage={listPaging.hasNextPage}
          totalPages={listTotalPages}
        />
      </div>

      <style>{sessionDetailsStyles}</style>
    </div>
  );
};

const sessionDetailsStyles = `
  .session-details-page { color: #0f172a; }
  .sv-top {
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    margin-bottom: 12px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  }
  .sv-top-inner { padding: 12px 14px; }
  .sd-session-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid #e5e7eb;
  }
  .sd-meta-chip {
    display: inline-flex;
    align-items: center;
    height: 22px;
    padding: 0 8px;
    border: 1px solid #e2e8f0;
    border-radius: 999px;
    background: #fff;
    color: #0f172a;
    font-size: 10px;
    font-weight: 700;
  }
  .sd-meta-chip--muted { color: #64748b; font-weight: 600; }
  .sv-header-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .sv-chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 28px;
    padding: 0 11px;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    background: #fff;
    color: #334155;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }
  .sv-chip svg { width: 11px; height: 11px; font-size: 11px; }
  .sv-chip:hover { background: #f8fafc; }
  .sv-chip--accent { border-color: #99f6e4; color: #0f766e; }
  .sv-search-wrap {
    position: relative;
    flex: 1 1 180px;
    min-width: 0;
    max-width: 280px;
  }
  .sv-search-wrap svg {
    position: absolute;
    left: 9px;
    top: 50%;
    transform: translateY(-50%);
    color: #94a3b8;
    font-size: 10px;
    pointer-events: none;
  }
  .sv-search-wrap input {
    width: 100%;
    height: 28px;
    padding: 0 10px 0 28px;
    font-size: 11px;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    outline: none;
    background: #fff;
    color: #0f172a;
  }
  .sv-search-wrap input:focus { border-color: #0f766e; box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.12); }
  .sd-card {
    background: #fff;
    border: 1px solid #d4d4d8;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  }
  .sd-summary { margin-bottom: 12px; padding: 0; }
  .sd-summary-row {
    display: flex;
    flex-wrap: wrap;
    align-items: stretch;
  }
  .sd-metric {
    flex: 1 1 120px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 10px 12px;
    border-right: 1px solid #e5e7eb;
  }
  .sd-metric:last-child { border-right: none; }
  .sd-metric span {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: #64748b;
  }
  .sd-metric strong {
    font-size: 13px;
    font-weight: 800;
    color: #0f172a;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
  }
  .sd-metric--total strong { color: #115e59; }
  .sd-metric--match strong { color: #166534; }
  .sd-metric--unmatch strong { color: #b91c1c; }
  .sd-card-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
    padding: 10px 12px;
    border-bottom: 1px solid #e5e7eb;
    background: #fff;
  }
  .sd-card-title {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    font-weight: 800;
    color: #0f172a;
  }
  .sd-card-title svg { font-size: 13px; color: #0f766e; }
  .sd-items-card--match .sd-card-title svg { color: #166534; }
  .sd-items-card--unmatch .sd-card-title svg { color: #b91c1c; }
  .sd-count-pill {
    height: 20px;
    padding: 0 8px;
    border-radius: 999px;
    border: 1px solid #e2e8f0;
    background: #fff;
    color: #64748b;
    font-size: 10px;
    font-weight: 700;
    display: inline-flex;
    align-items: center;
  }
  .sd-count-pill--match { border-color: #86efac; color: #166534; }
  .sd-count-pill--unmatch { border-color: #fecaca; color: #b91c1c; }
  .sd-tables {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 520px), 1fr));
    gap: 12px;
    align-items: start;
  }
  .sd-items-card { min-width: 0; }
  .sd-table-wrap { overflow-x: auto; width: 100%; background: #fafafa; -webkit-overflow-scrolling: touch; }
  .sv-pagination {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px 8px;
    padding: 8px 10px 6px;
    border-top: 1px solid #e5e7eb;
    background: #fafafa;
  }
  .sv-pagination-meta {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    font-size: 9px;
    font-weight: 600;
    color: #525252;
    min-width: 0;
  }
  .sv-pagination-size {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: #64748b;
    font-size: 9px;
  }
  .sv-pagination-size select {
    height: 24px;
    padding: 0 6px;
    font-size: 9px;
    font-weight: 600;
    border: 1px solid #e5e5e5;
    border-radius: 6px;
    background: #fff;
    color: #404040;
  }
  .sv-pagination-nav {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
    min-width: 0;
  }
  .sv-page-btn,
  .sv-page-num {
    height: 24px;
    min-width: 26px;
    padding: 0 7px;
    font-size: 9px;
    font-weight: 600;
    border-radius: 6px;
    border: 1px solid #e5e5e5;
    background: #fff;
    color: #525252;
    cursor: pointer;
  }
  .sv-page-btn:disabled { opacity: 0.45; cursor: not-allowed; }
  .sv-page-num.is-current {
    background: #fff;
    border-color: #0f766e;
    color: #0f766e;
  }
  .sv-page-ellipsis { padding: 0 3px; color: #94a3b8; font-size: 9px; font-weight: 600; }
  .sv-page-indicator {
    font-size: 9px;
    font-weight: 700;
    color: #0f172a;
    font-variant-numeric: tabular-nums;
    min-width: 40px;
    text-align: center;
  }
  .sv-page-goto {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-left: 2px;
    color: #64748b;
    font-size: 9px;
    font-weight: 600;
  }
  .sv-page-goto input {
    width: 36px;
    height: 24px;
    padding: 0 4px;
    font-size: 9px;
    border: 1px solid #e5e5e5;
    border-radius: 6px;
    text-align: center;
    background: #fff;
  }
  .sd-empty {
    max-width: 420px;
    margin: 48px auto;
    padding: 28px 20px;
    text-align: center;
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
  }
  .sd-empty svg { font-size: 28px; color: #d97706; margin-bottom: 10px; }
  .sd-empty h5 { margin: 0 0 6px; font-size: 14px; font-weight: 800; color: #0f172a; }
  .sd-empty p { margin: 0 0 14px; font-size: 12px; color: #64748b; }
  @media (max-width: 1180px) {
    .session-details-page { padding: 8px !important; }
  }
  @media (max-width: 768px) {
    .sv-top-inner { padding: 10px; }
    .sv-header-actions { width: 100%; }
    .sv-search-wrap { width: 100%; max-width: none; flex-basis: 100%; }
    .sd-card-toolbar { align-items: stretch; }
    .sd-metric { border-right: none; border-bottom: 1px solid #e5e7eb; flex: 1 1 46%; }
    .sd-metric:nth-last-child(-n+2) { border-bottom: none; }
  }
  @media (max-width: 640px) {
    .sv-pagination {
      flex-direction: column;
      align-items: stretch;
      gap: 6px;
    }
    .sv-pagination-meta,
    .sv-pagination-nav { width: 100%; justify-content: space-between; }
    .sv-page-btn { flex: 1 1 auto; min-width: 0; }
  }
`;

export default SessionDetails;
