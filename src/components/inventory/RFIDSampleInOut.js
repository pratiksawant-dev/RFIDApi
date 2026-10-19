import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { FaDownload, FaEdit, FaFileExcel, FaFilePdf, FaPrint, FaRedo, FaSearch, FaTable, FaThLarge, FaTimes, FaTrash } from 'react-icons/fa';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { useNotifications } from '../../context/NotificationContext';
import { toRrgoldApiUrl } from '../../services/apiBaseConfig';
import PageHeader from '../common/PageHeader';

const PAGE_SIZE = 20;

const resolveClientCode = (userInfo) =>
  String(userInfo?.ClientCode || userInfo?.clientCode || userInfo?.clientcode || '').trim();

const resolveSampleStatus = (movementType) =>
  movementType === 'Sample In' ? 'SampleIn' : 'SampleOut';

const getEndpointBySelection = (partyType, movementType) => {
  if (partyType === 'vendor' && movementType === 'Sample In') {
    return '/api/Transaction/GetAllVendorIssueItemDetails';
  }
  if (partyType === 'vendor' && movementType === 'Sample Out') {
    return '/api/Transaction/GetAllVendorSampleIssue';
  }
  if (partyType === 'customer' && movementType === 'Sample In') {
    return '/api/Transaction/GetAllIssueItemDetails';
  }
  if (partyType === 'customer' && movementType === 'Sample Out') {
    return '/api/Transaction/GetAllCustomerIssue';
  }
  return '';
};

const toArrayPayload = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.Data)) return payload.Data;
  if (Array.isArray(payload?.data?.Data)) return payload.data.Data;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

const normalizeVendorIssueRows = (payload) => {
  const source = toArrayPayload(payload);

  return source.map((entry, index) => {
    const issueItems = Array.isArray(entry?.IssueItems) ? entry.IssueItems : [];
    const firstItem = issueItems[0] || {};
    return {
      id: entry?.Id ?? index + 1,
      sampleOutNo: entry?.SampleOutNo || '—',
      issueDate: entry?.CreatedOn || entry?.LastUpdated || null,
      vendorName: entry?.Vendor?.VendorName || '—',
      productName: firstItem?.ProductName || '—',
      totalWt: entry?.TotalWt ?? '—',
      totalGrossWt: entry?.TotalGrossWt ?? '—',
      totalNetWt: entry?.TotalNetWt ?? '—',
      fineWastageWt: entry?.FineWastageWt ?? '—',
      quantity: entry?.Quantity ?? '—',
      totalDiamondWeight: entry?.TotalDiamondWeight ?? '—',
      status: entry?.Status || '—',
      sampleStatus: entry?.SampleStatus || 'SampleOut',
      issueItems,
      raw: entry,
    };
  });
};

const normalizeVendorIssueItemDetailsRows = (payload) => {
  const source = toArrayPayload(payload);
  return source.map((entry, index) => {
    const issueItems = Array.isArray(entry?.IssueItems)
      ? entry.IssueItems
      : Array.isArray(entry?.issueItems)
        ? entry.issueItems
        : [];

    const firstItem = issueItems[0] || entry || {};
    const vendorName =
      entry?.Vendor?.VendorName ||
      entry?.VendorName ||
      firstItem?.VendorName ||
      firstItem?.Vendor?.VendorName ||
      '—';

    return {
      id: entry?.Id ?? firstItem?.Id ?? index + 1,
      sampleOutNo: entry?.SampleOutNo || firstItem?.SampleOutNo || '—',
      issueDate: entry?.CreatedOn || entry?.IssueDate || firstItem?.CreatedOn || firstItem?.IssueDate || null,
      vendorName,
      productName: firstItem?.ProductName || '—',
      totalWt: entry?.TotalWt ?? firstItem?.TotalWt ?? '—',
      totalGrossWt: entry?.TotalGrossWt ?? firstItem?.GrossWt ?? '—',
      totalNetWt: entry?.TotalNetWt ?? firstItem?.NetWt ?? '—',
      fineWastageWt: entry?.FineWastageWt ?? firstItem?.FineWastageWt ?? '—',
      quantity: entry?.Quantity ?? firstItem?.Quantity ?? '—',
      totalDiamondWeight: entry?.TotalDiamondWeight ?? firstItem?.DiamondWeight ?? '—',
      status: entry?.Status || firstItem?.Status || 'Active',
      sampleStatus: entry?.SampleStatus || firstItem?.SampleStatus || 'SampleIn',
      issueItems: issueItems.length ? issueItems : [firstItem].filter(Boolean),
      raw: entry,
    };
  });
};

const normalizeCustomerIssueRows = (payload) => {
  const source = toArrayPayload(payload);
  return source.map((entry, index) => {
    const issueItems = Array.isArray(entry?.IssueItems)
      ? entry.IssueItems
      : Array.isArray(entry?.issueItems)
        ? entry.issueItems
        : [];
    const firstItem = issueItems[0] || entry || {};
    const customerArray = Array.isArray(entry?.Customer)
      ? entry.Customer
      : Array.isArray(entry?.Customers)
        ? entry.Customers
        : [];
    const firstCustomer = customerArray[0] || {};
    const inlineCustomerObject =
      entry?.Customer && typeof entry.Customer === 'object' && !Array.isArray(entry.Customer)
        ? entry.Customer
        : {};
    const customerName =
      entry?.Customer?.CustomerName ||
      entry?.CustomerName ||
      entry?.FirstName ||
      inlineCustomerObject?.FirstName ||
      inlineCustomerObject?.CustomerName ||
      firstCustomer?.CustomerName ||
      firstCustomer?.FirstName ||
      firstCustomer?.Name ||
      firstItem?.CustomerName ||
      firstItem?.FirstName ||
      firstItem?.Customer?.CustomerName ||
      firstItem?.Customer?.FirstName ||
      firstItem?.Customer?.Name ||
      '—';
    return {
      id: entry?.Id ?? firstItem?.Id ?? index + 1,
      sampleOutNo: entry?.SampleOutNo || firstItem?.SampleOutNo || '—',
      issueDate: entry?.CreatedOn || entry?.IssueDate || firstItem?.CreatedOn || firstItem?.IssueDate || null,
      vendorName: customerName,
      productName: firstItem?.ProductName || '—',
      totalWt: entry?.TotalWt ?? firstItem?.TotalWt ?? '—',
      totalGrossWt: entry?.TotalGrossWt ?? firstItem?.GrossWt ?? '—',
      totalNetWt: entry?.TotalNetWt ?? firstItem?.NetWt ?? '—',
      fineWastageWt: entry?.FineWastageWt ?? firstItem?.FineWastageWt ?? '—',
      quantity: entry?.Quantity ?? firstItem?.Quantity ?? '—',
      totalDiamondWeight: entry?.TotalDiamondWeight ?? firstItem?.DiamondWeight ?? '—',
      status: entry?.Status || firstItem?.Status || 'Active',
      sampleStatus: entry?.SampleStatus || firstItem?.SampleStatus || 'SampleOut',
      issueItems: issueItems.length ? issueItems : [firstItem].filter(Boolean),
      raw: entry,
    };
  });
};

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

/** One Sample In transaction can return multiple API rows with the same sample no — collapse for display. */
const mergeSampleInRowsForDisplay = (list) => {
  const keyToRows = new Map();
  for (const row of list) {
    const dk = row.issueDate ? new Date(row.issueDate) : null;
    const datePart = dk && !Number.isNaN(dk.getTime()) ? dk.toISOString().slice(0, 10) : '__nodate__';
    const key = `${String(row.sampleOutNo ?? '').trim()}|||${datePart}|||${String(row.vendorName ?? '').trim().toLowerCase()}`;
    if (!keyToRows.has(key)) keyToRows.set(key, []);
    keyToRows.get(key).push(row);
  }

  const parseNum = (v) => {
    const n = parseFloat(String(v ?? '').replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  };

  const mergeNums = (rows, field) => {
    let s = 0;
    let any = false;
    for (const r of rows) {
      const n = parseNum(r[field]);
      if (n !== null) {
        s += n;
        any = true;
      }
    }
    if (!any) return rows[0]?.[field] ?? '—';
    if (field === 'quantity') return String(Math.round(s));
    const rounded = Math.round(s * 1000) / 1000;
    return Number.isInteger(rounded) ? String(rounded) : String(rounded);
  };

  const out = [];
  for (const [key, group] of keyToRows) {
    if (group.length === 1) {
      out.push({ ...group[0], mergedGroup: false, mergedCount: 1, mergedSourceRows: null });
      continue;
    }

    const base = group[0];
    const itemSeen = new Set();
    const mergedIssueItems = [];

    for (const r of group) {
      const items = Array.isArray(r.issueItems) ? r.issueItems : [];
      if (items.length) {
        for (const it of items) {
          const code = String(it?.ItemCode ?? it?.Itemcode ?? it?.itemCode ?? '').trim().toUpperCase();
          const dedupe = code || `id:${it?.Id ?? mergedIssueItems.length}`;
          if (itemSeen.has(dedupe)) continue;
          itemSeen.add(dedupe);
          mergedIssueItems.push(it);
        }
      }
    }

    const nProducts = mergedIssueItems.length > 0 ? mergedIssueItems.length : group.length;
    const productLabel =
      nProducts <= 1 ? base.productName : `${nProducts} products — click to view item codes`;

    out.push({
      ...base,
      id: `merged-${key}`,
      mergedGroup: true,
      mergedCount: nProducts,
      mergedSourceRows: group,
      issueItems: mergedIssueItems.length > 0 ? mergedIssueItems : base.issueItems || [],
      productName: productLabel,
      totalWt: mergeNums(group, 'totalWt'),
      totalGrossWt: mergeNums(group, 'totalGrossWt'),
      totalNetWt: mergeNums(group, 'totalNetWt'),
      fineWastageWt: mergeNums(group, 'fineWastageWt'),
      quantity: mergeNums(group, 'quantity'),
      totalDiamondWeight: mergeNums(group, 'totalDiamondWeight'),
    });
  }
  return out;
};

const sampleStatusPillStyle = (sampleStatus) => {
  const s = String(sampleStatus || '').toLowerCase();
  if (s.includes('in')) {
    return { color: '#065f46', bg: '#ecfdf5', bd: '#6ee7b7' };
  }
  if (s.includes('out')) {
    return { color: '#991b1b', bg: '#fef2f2', bd: '#fca5a5' };
  }
  return { color: '#1e3a8a', bg: '#eff6ff', bd: '#93c5fd' };
};

const RFIDSampleInOut = () => {
  const { addNotification } = useNotifications();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [partyType, setPartyType] = useState('customer');
  const [movementType, setMovementType] = useState('Sample Out');
  const [filterDate, setFilterDate] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsModal, setItemsModal] = useState(null);
  const [sampleDetailsModal, setSampleDetailsModal] = useState(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [viewMode, setViewMode] = useState('table');

  const userInfo = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('userInfo') || '{}');
    } catch {
      return {};
    }
  }, []);

  const fetchRows = useCallback(async () => {
    const clientCode = resolveClientCode(userInfo);
    if (!clientCode) {
      setRows([]);
      setError('Client code missing. Please login again.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const endpoint = getEndpointBySelection(partyType, movementType);
      if (!endpoint) {
        setRows([]);
        setError('Selected combination is not configured yet.');
        return;
      }
      const body = {
        ClientCode: clientCode,
        SampleStatus: resolveSampleStatus(movementType),
      };
      const { data } = await axios.post(toRrgoldApiUrl(endpoint), body, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
        timeout: 120000,
      });
      const normalized =
        partyType === 'customer'
          ? normalizeCustomerIssueRows(data)
          : movementType === 'Sample In'
          ? normalizeVendorIssueItemDetailsRows(data)
          : normalizeVendorIssueRows(data);
      setRows(normalized);
    } catch (e) {
      const msg = e?.response?.data?.Message || e?.message || 'Failed to load vendor sample issue records';
      setRows([]);
      setError(msg);
      addNotification({ type: 'error', title: 'RFID Sample In/Out', message: msg });
    } finally {
      setLoading(false);
    }
  }, [addNotification, movementType, partyType, userInfo]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, movementType, partyType, filterDate]);

  useEffect(() => {
    setSearch('');
    setCurrentPage(1);
  }, [partyType, movementType]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      const issueDate = row.issueDate ? new Date(row.issueDate) : null;
      if (filterDate) {
        const from = new Date(`${filterDate}T00:00:00`);
        const to = new Date(`${filterDate}T23:59:59`);
        if (!issueDate || Number.isNaN(issueDate.getTime()) || issueDate < from || issueDate > to) return false;
      }
      if (!q) return true;
      return [
        row.sampleOutNo,
        row.vendorName,
        row.productName,
        row.status,
        row.sampleStatus,
        row.totalWt,
        row.totalGrossWt,
        row.totalNetWt,
      ]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [rows, search, filterDate]);

  const displayRows = useMemo(() => {
    if (movementType !== 'Sample In') return filteredRows;
    return mergeSampleInRowsForDisplay(filteredRows);
  }, [filteredRows, movementType]);

  const totalPages = Math.max(1, Math.ceil(displayRows.length / PAGE_SIZE));
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return displayRows.slice(start, start + PAGE_SIZE);
  }, [currentPage, displayRows]);
  const paddedRows = useMemo(() => {
    const slots = paginatedRows.map((row) => ({ kind: 'row', row }));
    const padCount = Math.max(0, PAGE_SIZE - paginatedRows.length);
    for (let i = 0; i < padCount; i += 1) {
      slots.push({ kind: 'pad', key: `pad-${currentPage}-${i}` });
    }
    return slots;
  }, [currentPage, paginatedRows]);

  const exportExcel = () => {
    if (!displayRows.length) return;
    const data = displayRows.map((row, idx) => ({
      SrNo: idx + 1,
      SampleOutNo: row.sampleOutNo,
      IssueDate: formatDate(row.issueDate),
      VendorName: row.vendorName,
      ProductName: row.productName,
      TotalWt: row.totalWt,
      GrossWt: row.totalGrossWt,
      NetWt: row.totalNetWt,
      'F+Wt': row.fineWastageWt,
      Qty: row.quantity,
      DWt: row.totalDiamondWeight,
      SampleStatus: row.sampleStatus || row.status,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Vendor Sample Issue');
    XLSX.writeFile(wb, `RFID_Vendor_Sample_Issue_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const exportPdf = () => {
    if (!displayRows.length) return;
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(14);
    doc.text('RFID Vendor Sample In/Out', 14, 16);
    doc.autoTable({
      startY: 24,
      head: [['#', 'Sample Out No', 'Issue Date', 'Vendor', 'Product', 'Total Wt', 'Gr Wt', 'Nt Wt', 'F+Wt', 'Qty', 'D.Wt', 'Sample Status']],
      body: displayRows.map((row, idx) => [
        idx + 1,
        row.sampleOutNo,
        formatDate(row.issueDate),
        row.vendorName,
        row.productName,
        row.totalWt,
        row.totalGrossWt,
        row.totalNetWt,
        row.fineWastageWt,
        row.quantity,
        row.totalDiamondWeight,
        row.sampleStatus || row.status,
      ]),
      styles: { fontSize: 7 },
      headStyles: { fillColor: [15, 23, 42] },
    });
    doc.save(`RFID_Vendor_Sample_Issue_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const handlePrintRow = (row) => {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`
      <html>
        <head>
          <title>${row.sampleOutNo}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; color: #0f172a; }
            table { border-collapse: collapse; width: 100%; margin-top: 8px; }
            td { border: 1px solid #e2e8f0; padding: 8px; font-size: 13px; }
            td:first-child { width: 170px; font-weight: 600; color: #475569; }
          </style>
        </head>
        <body>
          <h2>RFID Vendor Sample Issue</h2>
          <table>
            <tr><td>Sample Out No</td><td>${row.sampleOutNo}</td></tr>
            <tr><td>Issue Date</td><td>${formatDate(row.issueDate)}</td></tr>
            <tr><td>Vendor</td><td>${row.vendorName}</td></tr>
            <tr><td>Product</td><td>${row.productName}</td></tr>
            <tr><td>Total Wt</td><td>${row.totalWt}</td></tr>
            <tr><td>Gross Wt</td><td>${row.totalGrossWt}</td></tr>
            <tr><td>Net Wt</td><td>${row.totalNetWt}</td></tr>
            <tr><td>F+Wt</td><td>${row.fineWastageWt}</td></tr>
            <tr><td>Qty</td><td>${row.quantity}</td></tr>
            <tr><td>D.Wt</td><td>${row.totalDiamondWeight}</td></tr>
            <tr><td>Sample Status</td><td>${row.sampleStatus || row.status}</td></tr>
          </table>
          <script>window.onload=function(){window.print();window.close();}</script>
        </body>
      </html>
    `);
    w.document.close();
  };

  const actionInfo = (label) =>
    addNotification({ type: 'info', title: label, message: `${label} action ready. Share endpoint to wire API.` });

  const buildSampleDetailRows = (row) => {
    if (!row || typeof row !== 'object') return [];
    const raw = row.raw && typeof row.raw === 'object' ? row.raw : {};
    const rowsOut = [
      { label: 'Sample Out No', value: row.sampleOutNo },
      { label: partyType === 'customer' ? 'Customer Name' : 'Vendor Name', value: row.vendorName },
      { label: 'Issue Date', value: formatDate(row.issueDate) },
      ...(row.mergedGroup && row.mergedCount > 1
        ? [{ label: 'Products in this sample in', value: `${row.mergedCount} items (open item list for codes)` }]
        : []),
      { label: 'Sample Status', value: row.sampleStatus || row.status || '—' },
      { label: 'Status', value: row.status || '—' },
      { label: 'Total Wt', value: row.totalWt },
      { label: 'Gross Wt', value: row.totalGrossWt },
      { label: 'Net Wt', value: row.totalNetWt },
      { label: 'Fine+Wt', value: row.fineWastageWt },
      { label: 'Qty', value: row.quantity },
      { label: 'Diamond Wt', value: row.totalDiamondWeight },
      { label: 'Description', value: raw?.Description || raw?.description || '—' },
      { label: 'Return Date', value: raw?.ReturnDate ? formatDate(raw.ReturnDate) : '—' },
      { label: 'Branch', value: raw?.BranchId ?? '—' },
      { label: 'Client Code', value: raw?.ClientCode || '—' },
    ];
    return rowsOut.filter((r) => r.value !== undefined && r.value !== null);
  };

  return (
    <div className="rfid-sample-page" style={{ display: 'flex', flexDirection: 'column', gap: 12, background: '#fff' }}>
      <div className="page-top">
        <div className="page-top-inner">
          <PageHeader
            title="RFID Sample In/Out"
            subtitle={
              partyType === 'customer'
                ? movementType === 'Sample In'
                  ? `Customer sample in · ${displayRows.length.toLocaleString()} records`
                  : `Customer sample out · ${displayRows.length.toLocaleString()} records`
                : movementType === 'Sample In'
                  ? `Vendor sample in · ${displayRows.length.toLocaleString()} records`
                  : `Vendor sample out · ${displayRows.length.toLocaleString()} records`
            }
            barStyle={{ padding: 0, margin: 0, gap: 10, borderBottom: 'none' }}
            actions={(
              <div className="page-tabs" role="tablist" aria-label="Sample view">
                <button type="button" className={`page-tab${viewMode === 'table' ? ' is-on' : ''}`} onClick={() => setViewMode('table')}>
                  <FaTable /> Table
                </button>
                <button type="button" className={`page-tab${viewMode === 'grid' ? ' is-on' : ''}`} onClick={() => setViewMode('grid')}>
                  <FaThLarge /> Grid
                </button>
              </div>
            )}
          />
          <div className="page-toolbar">
            <select className="page-field" value={partyType} onChange={(e) => setPartyType(e.target.value)} style={{ width: 140 }}>
              <option value="vendor">Vendor</option>
              <option value="customer">Customer</option>
            </select>
            <select className="page-field" value={movementType} onChange={(e) => setMovementType(e.target.value)} style={{ width: 140 }}>
              <option value="Sample Out">Sample Out</option>
              <option value="Sample In">Sample In</option>
            </select>
            <input className="page-field" type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} style={{ width: 150 }} />
            <div className="page-toolbar-actions">
              <button type="button" className="page-chip" onClick={fetchRows} disabled={loading}>
                <FaRedo /> Refresh
              </button>
              <button type="button" className="page-chip" onClick={() => setShowExportModal(true)} disabled={!displayRows.length}>
                <FaDownload /> Export
              </button>
            </div>
            <label className="page-search">
              <FaSearch />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search records"
              />
            </label>
          </div>
        </div>
      </div>

      {error ? <div style={{ color: '#b91c1c', padding: '10px 14px 0', fontSize: 12 }}>{error}</div> : null}

      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, overflow: 'hidden', boxShadow: '0 8px 20px rgba(15,23,42,0.05)' }}>
      {viewMode === 'table' ? (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 1280 }}>
          <thead>
            <tr style={{ background: '#f4f4f5' }}>
              {['#', 'Sample Out No', 'Issue Date', partyType === 'customer' ? 'Customer Name' : 'Vendor Name', 'Product Name', 'Total Wt', 'Gr Wt', 'Nt Wt', 'F+Wt', 'Qty', 'D.Wt', 'Sample Status', 'Action'].map((h) => (
                  <th key={h} style={thStyle}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={13} style={{ padding: 20, textAlign: 'center', color: '#64748b' }}>
                  Loading...
                </td>
              </tr>
            ) : displayRows.length ? (
              paddedRows.map((slot, index) => {
                if (slot.kind === 'pad') {
                  return (
                    <tr key={slot.key} style={{ background: '#fafafa', height: 34 }}>
                      <td colSpan={13} style={{ borderBottom: '1px solid #ececec', borderRight: '1px solid #ececec' }} />
                    </tr>
                  );
                }
                const row = slot.row;
                const rowNumber = (currentPage - 1) * PAGE_SIZE + index + 1;
                const issueItemsList = Array.isArray(row.issueItems) ? row.issueItems : [];
                const showIssueItemsModalLink =
                  row.mergedGroup ||
                  issueItemsList.length > 1 ||
                  (movementType === 'Sample In' && issueItemsList.length >= 1);
                return (
                  <tr key={row.id} style={{ background: rowNumber % 2 === 0 ? '#fafafa' : '#ffffff' }}>
                    <td style={tdStyle}>{rowNumber}</td>
                    <td style={{ ...tdStyle, fontWeight: 700 }}>{row.sampleOutNo}</td>
                    <td style={tdStyle}>{formatDate(row.issueDate)}</td>
                    <td style={tdStyle}>
                      <button
                        type="button"
                        onClick={() => setSampleDetailsModal(row)}
                        style={linkBtnStyle}
                        title="View sample details"
                      >
                        {row.vendorName}
                      </button>
                    </td>
                    <td style={tdStyle}>
                      {showIssueItemsModalLink ? (
                        <button
                          type="button"
                          onClick={() => setItemsModal(row)}
                          style={linkBtnStyle}
                          title="View item code, product, design"
                        >
                          {row.productName}
                        </button>
                      ) : (
                        row.productName
                      )}
                    </td>
                    <td style={tdStyle}>{row.totalWt}</td>
                    <td style={tdStyle}>{row.totalGrossWt}</td>
                    <td style={tdStyle}>{row.totalNetWt}</td>
                    <td style={tdStyle}>{row.fineWastageWt}</td>
                    <td style={tdStyle}>{row.quantity}</td>
                    <td style={tdStyle}>{row.totalDiamondWeight}</td>
                    <td style={tdStyle}>
                      <span
                        style={{
                          ...statusPillStyle,
                          color: sampleStatusPillStyle(row.sampleStatus).color,
                          background: sampleStatusPillStyle(row.sampleStatus).bg,
                          borderColor: sampleStatusPillStyle(row.sampleStatus).bd,
                        }}
                      >
                        {row.sampleStatus || row.status || '—'}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button type="button" style={iconBtnStyle('#1d4ed8')} title="Print" onClick={() => handlePrintRow(row)}>
                          <FaPrint />
                        </button>
                        <button type="button" style={iconBtnStyle('#0f766e')} title="Edit" onClick={() => actionInfo('Edit')}>
                          <FaEdit />
                        </button>
                        <button type="button" style={iconBtnStyle('#b91c1c')} title="Delete" onClick={() => actionInfo('Delete')}>
                          <FaTrash />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={13} style={{ padding: 20, textAlign: 'center', color: '#64748b' }}>
                  No vendor sample records found.
                </td>
              </tr>
            )}
          </tbody>
          </table>
        </div>
      ) : (
        <div style={{ padding: 12, background: '#fafafa', minHeight: 420 }}>
          {loading ? (
            <div style={{ padding: 20, textAlign: 'center', color: '#64748b' }}>Loading...</div>
          ) : paginatedRows.length ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 10 }}>
              {paginatedRows.map((row) => {
                const issueItemsList = Array.isArray(row.issueItems) ? row.issueItems : [];
                const showIssueItemsModalLink =
                  row.mergedGroup ||
                  issueItemsList.length > 1 ||
                  (movementType === 'Sample In' && issueItemsList.length >= 1);
                return (
                <div key={`grid-${row.id}`} style={{ border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff', padding: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#0f172a' }}>{row.sampleOutNo}</div>
                    <span
                      style={{
                        ...statusPillStyle,
                        color: sampleStatusPillStyle(row.sampleStatus).color,
                        background: sampleStatusPillStyle(row.sampleStatus).bg,
                        borderColor: sampleStatusPillStyle(row.sampleStatus).bd,
                      }}
                    >
                      {row.sampleStatus || row.status || '—'}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: '#475569', marginBottom: 2 }}>{formatDate(row.issueDate)}</div>
                  <div style={{ fontSize: 11, color: '#334155', marginBottom: 2 }}>{row.vendorName}</div>
                  <div style={{ fontSize: 11, color: '#334155', marginBottom: 6 }}>
                    {showIssueItemsModalLink ? (
                      <button type="button" onClick={() => setItemsModal(row)} style={{ ...linkBtnStyle, fontSize: 11 }}>
                        {row.productName}
                      </button>
                    ) : (
                      row.productName
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
                    <div style={gridStatCardStyle}><span style={gridStatLabelStyle}>Gr Wt</span><strong>{row.totalGrossWt}</strong></div>
                    <div style={gridStatCardStyle}><span style={gridStatLabelStyle}>Nt Wt</span><strong>{row.totalNetWt}</strong></div>
                    <div style={gridStatCardStyle}><span style={gridStatLabelStyle}>Qty</span><strong>{row.quantity}</strong></div>
                    <div style={gridStatCardStyle}><span style={gridStatLabelStyle}>D.Wt</span><strong>{row.totalDiamondWeight}</strong></div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button type="button" style={iconBtnStyle('#1d4ed8')} title="Print" onClick={() => handlePrintRow(row)}><FaPrint /></button>
                    <button type="button" style={iconBtnStyle('#0f766e')} title="Edit" onClick={() => actionInfo('Edit')}><FaEdit /></button>
                    <button type="button" style={iconBtnStyle('#b91c1c')} title="Delete" onClick={() => actionInfo('Delete')}><FaTrash /></button>
                  </div>
                </div>
              );
              })}
            </div>
          ) : (
            <div style={{ padding: 20, textAlign: 'center', color: '#64748b' }}>No records found.</div>
          )}
        </div>
      )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderTop: '1px solid #e5e7eb' }}>
        <div style={{ fontSize: 12, color: '#64748b' }}>
          Showing {movementType} data • {displayRows.length} record{displayRows.length === 1 ? '' : 's'}
          {movementType === 'Sample In' && filteredRows.length !== displayRows.length
            ? ` (${filteredRows.length} line items grouped by sample no.)`
            : ''}{' '}
          • {PAGE_SIZE} per page
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} style={btnStyle}>
            Prev
          </button>
          <span style={{ fontSize: 12, fontWeight: 700 }}>Page {currentPage} / {totalPages}</span>
          <button type="button" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} style={btnStyle}>
            Next
          </button>
        </div>
      </div>
      </div>

      {itemsModal ? (
        <div style={modalOverlayStyle} onClick={() => setItemsModal(null)}>
          <div style={modalCardStyle} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid #e5e7eb' }}>
              <h3 style={{ margin: 0, fontSize: 16, color: '#0f172a', fontWeight: 800 }}>
                {movementType === 'Sample In' ? 'Sample In Items' : 'Issue Items'} • {itemsModal.sampleOutNo}
                {itemsModal.mergedGroup && itemsModal.mergedCount > 1 ? (
                  <span style={{ fontWeight: 600, color: '#64748b', fontSize: 13 }}> ({itemsModal.mergedCount} products)</span>
                ) : null}
              </h3>
              <button type="button" onClick={() => setItemsModal(null)} style={closeBtnStyle}>
                <FaTimes />
              </button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 980 }}>
                <thead>
                  <tr style={{ background: '#f4f4f5' }}>
                    {['#', 'Category', 'Item Code', 'Product', 'Design', 'Gr Wt', 'Net Wt', 'S Wt', 'D Wt'].map((h) => (
                      <th key={h} style={thStyle}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(Array.isArray(itemsModal.issueItems) ? itemsModal.issueItems : []).map((item, idx) => (
                    <tr key={`${itemsModal.id}-${idx}`} style={{ background: idx % 2 === 0 ? '#ffffff' : '#fafafa' }}>
                      <td style={tdStyle}>{idx + 1}</td>
                      <td style={tdStyle}>{item.CategoryName || '—'}</td>
                      <td style={tdStyle}>{item.ItemCode || item.Itemcode || '—'}</td>
                      <td style={tdStyle}>{item.ProductName || item.Product || '—'}</td>
                      <td style={tdStyle}>{item.DesignName || item.Design || '—'}</td>
                      <td style={tdStyle}>{item.GrossWt ?? '—'}</td>
                      <td style={tdStyle}>{item.NetWt ?? '—'}</td>
                      <td style={tdStyle}>{item.StoneWeight ?? '—'}</td>
                      <td style={tdStyle}>{item.DiamondWeight ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {sampleDetailsModal ? (
        <div style={modalOverlayStyle} onClick={() => setSampleDetailsModal(null)}>
          <div style={modalCardStyle} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid #e5e7eb' }}>
              <h3 style={{ margin: 0, fontSize: 16, color: '#0f172a', fontWeight: 800 }}>
                Sample Details • {sampleDetailsModal.sampleOutNo}
              </h3>
              <button type="button" onClick={() => setSampleDetailsModal(null)} style={closeBtnStyle}>
                <FaTimes />
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 32%) 1fr', gap: '8px 12px', fontSize: 12 }}>
              {buildSampleDetailRows(sampleDetailsModal).map((row, idx) => (
                <React.Fragment key={`${row.label}-${idx}`}>
                  <div style={{ color: '#64748b', fontWeight: 700 }}>{row.label}</div>
                  <div style={{ color: '#111827', wordBreak: 'break-word' }}>{String(row.value || '—')}</div>
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {showExportModal ? (
        <div style={modalOverlayStyle} onClick={() => setShowExportModal(false)}>
          <div
            style={{ ...modalCardStyle, width: 'min(430px, 96vw)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid #e5e7eb' }}>
              <h3 style={{ margin: 0, fontSize: 16, color: '#0f172a', fontWeight: 800 }}>Export Records</h3>
              <button type="button" onClick={() => setShowExportModal(false)} style={closeBtnStyle}>
                <FaTimes />
              </button>
            </div>
            <p style={{ margin: '0 0 12px', fontSize: 11, color: '#64748b' }}>
              Export currently filtered data ({displayRows.length} row{displayRows.length === 1 ? '' : 's'}
              {movementType === 'Sample In' && filteredRows.length !== displayRows.length
                ? `, ${filteredRows.length} raw line items`
                : ''}
              ).
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                type="button"
                onClick={() => {
                  exportExcel();
                  setShowExportModal(false);
                }}
                style={exportOptionBtnStyle('#ecfdf5', '#d1fae5', '#065f46')}
              >
                <FaFileExcel /> Export as Excel
              </button>
              <button
                type="button"
                onClick={() => {
                  exportPdf();
                  setShowExportModal(false);
                }}
                style={exportOptionBtnStyle('#fef2f2', '#fecaca', '#991b1b')}
              >
                <FaFilePdf /> Export as PDF
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

const btnStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  border: '1px solid #cbd5e1',
  background: '#fff',
  color: '#1e293b',
  borderRadius: 8,
  padding: '6px 10px',
  fontSize: 11,
  fontWeight: 600,
  cursor: 'pointer',
  height: 32,
};

const thStyle = {
  textAlign: 'left',
  padding: '7px 8px',
  fontSize: 11,
  color: '#18181b',
  borderRight: '1px solid #e4e4e7',
  borderBottom: '2px solid #d4d4d8',
  whiteSpace: 'nowrap',
};

const tdStyle = {
  padding: '6px 8px',
  fontSize: 11,
  color: '#404040',
  borderRight: '1px solid #ececec',
  borderBottom: '1px solid #e5e5e5',
  whiteSpace: 'nowrap',
};

const statusPillStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 76,
  padding: '2px 8px',
  borderRadius: 999,
  border: '1px solid transparent',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.02em',
};

const iconBtnStyle = (color) => ({
  width: 24,
  height: 24,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 6,
  border: '1px solid #e2e8f0',
  background: '#fff',
  color,
  cursor: 'pointer',
  fontSize: 11,
});

const linkBtnStyle = {
  border: 'none',
  padding: 0,
  background: 'transparent',
  color: '#2563eb',
  fontWeight: 700,
  cursor: 'pointer',
  textDecoration: 'underline',
};

const modalOverlayStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15, 23, 42, 0.45)',
  zIndex: 10060,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 14,
};

const modalCardStyle = {
  width: 'min(1120px, 98vw)',
  maxHeight: '88vh',
  overflow: 'auto',
  background: '#fff',
  borderRadius: 14,
  padding: 16,
  border: '1px solid #e2e8f0',
  boxShadow: '0 24px 48px rgba(0,0,0,0.16)',
};

const closeBtnStyle = {
  width: 28,
  height: 28,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 8,
  border: '1px solid #e2e8f0',
  background: '#fff',
  cursor: 'pointer',
  color: '#475569',
};

const exportOptionBtnStyle = (bg, borderColor, color) => ({
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  width: '100%',
  height: 40,
  borderRadius: 10,
  border: `1px solid ${borderColor}`,
  background: bg,
  color,
  fontWeight: 700,
  fontSize: 12,
  padding: '0 12px',
  cursor: 'pointer',
});

const gridStatCardStyle = {
  border: '1px solid #e2e8f0',
  borderRadius: 6,
  background: '#f8fafc',
  padding: '4px 6px',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  fontSize: 10,
  color: '#0f172a',
};

const gridStatLabelStyle = {
  fontSize: 9,
  color: '#64748b',
  fontWeight: 700,
};

export default RFIDSampleInOut;
