import axios from 'axios';
import { toRrgoldApiUrl } from '../services/apiBaseConfig';

export const STOCK_VERIFICATION_SESSION_URL = toRrgoldApiUrl(
  '/api/ProductMaster/GetAllStockVerificationBySession'
);

export const SESSION_LIST_PAGE_SIZE = 20;
export const SESSION_DETAIL_PAGE_SIZE = 50;

export const parseStockVerificationPaging = (data = {}) => {
  const paging = data?.Paging || data?.paging || {};
  const pageNumber = Number(paging.PageNumber ?? paging.pageNumber ?? 1) || 1;
  const pageSize = Number(paging.PageSize ?? paging.pageSize ?? 0) || 0;
  const totalRecords =
    Number(
      paging.TotalRecords ??
        paging.totalRecords ??
        data.TotalSessions ??
        data.totalSessions ??
        data.TotalRecords ??
        data.totalRecords ??
        0
    ) || 0;
  const totalPages = Number(paging.TotalPages ?? paging.totalPages ?? 0) || 0;
  const hasNextPage = Boolean(paging.HasNextPage ?? paging.hasNextPage);
  const hasPreviousPage = Boolean(paging.HasPreviousPage ?? paging.hasPreviousPage);
  return {
    pageNumber,
    pageSize,
    totalRecords,
    totalPages,
    hasNextPage,
    hasPreviousPage,
  };
};

/** Normalize GetAllStockVerificationBySession list response (array or wrapped object). */
export const parseStockVerificationSessionsResponse = (data) => {
  const paging = parseStockVerificationPaging(data);
  if (!data) return { list: [], total: 0, paging };

  if (Array.isArray(data)) {
    return { list: data, total: paging.totalRecords || data.length, paging };
  }

  const nested =
    data.Sessions ||
    data.sessions ||
    data.Data ||
    data.data ||
    data.Result ||
    data.result ||
    data.Items ||
    data.items;

  if (Array.isArray(nested)) {
    const total = paging.totalRecords || nested.length;
    return { list: nested, total, paging: { ...paging, totalRecords: total } };
  }

  const innerSessions = nested?.Sessions || nested?.sessions;
  if (Array.isArray(innerSessions)) {
    const total = paging.totalRecords || nested.TotalSessions || nested.totalSessions || innerSessions.length;
    return { list: innerSessions, total, paging: { ...paging, totalRecords: total } };
  }

  return { list: [], total: paging.totalRecords || 0, paging };
};

export const resolveSessionListPageCount = (paging, fallbackPageSize = SESSION_LIST_PAGE_SIZE) => {
  if (paging?.totalPages > 0) return paging.totalPages;
  const size = paging?.pageSize || fallbackPageSize;
  if (paging?.totalRecords > 0 && size > 0) {
    return Math.max(1, Math.ceil(paging.totalRecords / size));
  }
  const page = paging?.pageNumber || 1;
  return paging?.hasNextPage ? page + 1 : page;
};

/** API expects date-time (Swagger: StockVerificationBatchQuery.FromDate / ToDate). */
export const toStockVerificationApiDateTime = (dateStr, { endOfDay = false } = {}) => {
  const d = String(dateStr || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return undefined;
  return endOfDay ? `${d}T23:59:59` : `${d}T00:00:00`;
};

/** List all sessions — do not send ScanBatchId or ReturnAllData. */
export const buildStockVerificationListPayload = ({
  clientCode,
  pageNumber = 1,
  pageSize = SESSION_LIST_PAGE_SIZE,
  dateFrom = '',
  dateTo = '',
} = {}) => {
  const payload = {
    ClientCode: clientCode,
    PageNumber: pageNumber,
    PageSize: pageSize,
  };
  const from = toStockVerificationApiDateTime(dateFrom, { endOfDay: false });
  const to = toStockVerificationApiDateTime(dateTo, { endOfDay: true });
  if (from) payload.FromDate = from;
  if (to) payload.ToDate = to;
  return payload;
};

/** Open one session — page of match + unmatch rows. Totals are for the full session. */
export const buildStockVerificationSessionPayload = ({
  clientCode,
  scanBatchId,
  pageNumber = 1,
  pageSize = SESSION_DETAIL_PAGE_SIZE,
} = {}) => ({
  ClientCode: clientCode,
  ScanBatchId: scanBatchId,
  PageNumber: pageNumber,
  PageSize: pageSize,
});

/** Batch save — one ScanBatchId per tray verification session. */
export const ADD_STOCK_VERIFICATION_BY_SESSION_URL = toRrgoldApiUrl(
  '/api/ProductMaster/AddStockVerificationBySession'
);

/** Day-wise add/update (no ScanBatchId). Prefer batch API for tray sessions. */
export const ADD_STOCK_VERIFICATION_URL = toRrgoldApiUrl(
  '/api/ProductMaster/AddStockVerification'
);

const pickField = (obj, keys, fallback = undefined) => {
  if (!obj) return fallback;
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return fallback;
};

/** Item quantity — API totals count pieces/qty, not always one row per piece. */
export const getSessionItemQty = (item) => {
  const qty = Number(
    item?.Quantity ?? item?.quantity ?? item?.Pieces ?? item?.pieces ?? item?.Qty ?? item?.qty ?? 1
  );
  return Number.isFinite(qty) && qty > 0 ? qty : 1;
};

export const sumSessionListQty = (items = []) =>
  (items || []).reduce((sum, item) => sum + getSessionItemQty(item), 0);

export const sumSessionListWeight = (items = [], field) =>
  (items || []).reduce((sum, item) => sum + (parseFloat(item?.[field]) || 0), 0);

export const normalizeSessionDetails = (data = {}) => ({
  ...data,
  ScanBatchId: data.ScanBatchId ?? data.scanBatchId,
  SessionId: data.SessionId ?? data.sessionId,
  SessionNumber: data.SessionNumber ?? data.sessionNumber,
  BatchName: data.BatchName ?? data.batchName,
  BranchId: data.BranchId ?? data.branchId,
  BranchName: data.BranchName ?? data.branchName,
  CounterId: data.CounterId ?? data.counterId,
  CounterName: data.CounterName ?? data.counterName,
  ClientCode: data.ClientCode ?? data.clientCode,
  MatchedList: data.MatchedList ?? data.matchedList ?? [],
  UnmatchedList: data.UnmatchedList ?? data.unmatchedList ?? [],
  Totals: data.Totals ?? data.totals ?? {},
});

const mergeSessionItems = (existing, incoming) => {
  const seen = new Set();
  const merged = [];
  [...existing, ...incoming].forEach((item) => {
    const key =
      item?.Id ??
      item?.id ??
      `${item?.RFIDCode ?? item?.rfidCode ?? ''}|${item?.ItemCode ?? item?.itemCode ?? ''}|${item?.ProductName ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(item);
  });
  return merged;
};

/** Fetch one session page (50 match + 50 unmatch by default). Does not send ReturnAllData. */
export const fetchStockVerificationSessionPage = async (
  clientCode,
  scanBatchId,
  { pageNumber = 1, pageSize = SESSION_DETAIL_PAGE_SIZE, headers = {} } = {}
) => {
  const { data } = await axios.post(
    STOCK_VERIFICATION_SESSION_URL,
    buildStockVerificationSessionPayload({ clientCode, scanBatchId, pageNumber, pageSize }),
    {
      headers: { 'Content-Type': 'application/json', ...headers },
      timeout: 90000,
      skipGlobalLoader: true,
    }
  );
  const session = normalizeSessionDetails(data);
  return {
    ...session,
    Paging: parseStockVerificationPaging(data),
  };
};

/**
 * Walk PageNumber until Paging.HasNextPage is false. Use for export only — UI should load one page.
 */
export const fetchStockVerificationSessionPages = async (clientCode, scanBatchId, headers = {}) => {
  let page = 1;
  let session = null;
  let matchedList = [];
  let unmatchedList = [];
  while (page <= 100) {
    const next = await fetchStockVerificationSessionPage(clientCode, scanBatchId, {
      pageNumber: page,
      pageSize: SESSION_DETAIL_PAGE_SIZE,
      headers,
    });
    if (!session) session = next;
    matchedList = mergeSessionItems(matchedList, next.MatchedList || []);
    unmatchedList = mergeSessionItems(unmatchedList, next.UnmatchedList || []);
    if (!next.Paging?.hasNextPage) break;
    page += 1;
  }
  return {
    ...session,
    MatchedList: matchedList,
    UnmatchedList: unmatchedList,
  };
};

/** Open-session helper used by the details page — first page only. */
export const fetchFullStockVerificationSession = async (clientCode, scanBatchId, headers = {}) =>
  fetchStockVerificationSessionPage(clientCode, scanBatchId, {
    pageNumber: 1,
    pageSize: SESSION_DETAIL_PAGE_SIZE,
    headers,
  });

/** Align summary totals with loaded lists (qty + weight). Prefer list sums when data is loaded. */
export const reconcileSessionDetails = (session, matchedList, unmatchedList) => {
  const apiTotals = session.Totals || {};
  const matchedQty = sumSessionListQty(matchedList);
  const unmatchQty = sumSessionListQty(unmatchedList);
  const totalQty = matchedQty + unmatchQty;

  const apiMatchQty = Number(pickField(apiTotals, ['TotalMatchQty', 'MatchedQty', 'matchedQty'], 0)) || 0;
  const apiUnmatchQty = Number(pickField(apiTotals, ['TotalUnmatchQty', 'UnmatchQty', 'unmatchQty'], 0)) || 0;
  const apiTotalQty = Number(pickField(apiTotals, ['TotalQty', 'totalQty'], 0)) || 0;

  const listsLookComplete =
    (apiMatchQty > 0 && matchedQty >= apiMatchQty && unmatchQty >= apiUnmatchQty) ||
    (apiTotalQty > 0 && totalQty >= apiTotalQty) ||
    (matchedList.length + unmatchedList.length > 0 && apiTotalQty === 0 && apiMatchQty === 0);

  const useListTotals = listsLookComplete || (matchedQty + unmatchQty > 0 && apiTotalQty === 0);

  const Totals = useListTotals
    ? {
        ...apiTotals,
        TotalQty: totalQty,
        TotalMatchQty: matchedQty,
        TotalUnmatchQty: unmatchQty,
        TotalGrossWeight: sumSessionListWeight([...matchedList, ...unmatchedList], 'GrossWeight'),
        TotalNetWeight: sumSessionListWeight([...matchedList, ...unmatchedList], 'NetWeight'),
        TotalMatchGrossWeight: sumSessionListWeight(matchedList, 'GrossWeight'),
        TotalMatchNetWeight: sumSessionListWeight(matchedList, 'NetWeight'),
      }
    : {
        ...apiTotals,
        TotalQty: apiTotalQty || totalQty,
        TotalMatchQty: apiMatchQty || matchedQty,
        TotalUnmatchQty: apiUnmatchQty || unmatchQty,
      };

  return {
    ...session,
    MatchedList: matchedList,
    UnmatchedList: unmatchedList,
    Totals,
  };
};

/** Badge / footer count for a filtered list — uses qty sum to match summary. */
export const getSessionListDisplayQty = (items = []) => sumSessionListQty(items);

const numOr = (value, fallback = 0) => {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
};

const idOr = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/**
 * Build AddStockVerificationBySession items[] from tray Match / UnMatch rows.
 * status must be "Match" | "UnMatch". itemCode is required.
 */
export const buildStockVerificationSessionItems = ({
  matchedItems = [],
  unmatchedCodes = [],
  scanTagByRfid = {},
  branchId,
  counterId,
} = {}) => {
  const items = [];

  (matchedItems || []).forEach((row) => {
    const itemCode = String(row?.ItemCode || row?.itemCode || '').trim();
    const rfidCode = String(row?.RFIDCode || row?.rfidCode || '').trim();
    if (!itemCode && !rfidCode) return;
    const tag = scanTagByRfid[rfidCode.toUpperCase()] || {};
    items.push({
      itemCode: itemCode || rfidCode,
      status: 'Match',
      quantity: numOr(row?.Qty ?? row?.quantity ?? row?.Quantity, 1) || 1,
      grossWeight: numOr(row?.GrossWt ?? row?.grossWeight ?? row?.GrossWeight),
      netWeight: numOr(row?.NetWt ?? row?.netWeight ?? row?.NetWeight),
      tidNumber: String(
        row?.TIDNumber || row?.TidNumber || row?.HexCode || tag?.tid || tag?.epc || ''
      ).trim(),
      rfidCode,
      boxName: String(row?.BoxName || row?.boxName || '').trim(),
      counterId: idOr(row?.CounterId ?? row?.counterId ?? counterId),
      categoryId: idOr(row?.CategoryId ?? row?.categoryId),
      productId: idOr(row?.ProductId ?? row?.productId),
      designId: idOr(row?.DesignId ?? row?.designId),
      purityId: idOr(row?.PurityId ?? row?.purityId),
      companyId: idOr(row?.CompanyId ?? row?.companyId),
      branchId: idOr(row?.BranchId ?? row?.branchId ?? branchId),
      counterName: String(row?.CounterName || row?.counterName || '').trim(),
      categoryName: String(row?.CategoryName || row?.categoryName || '').trim(),
      productName: String(row?.ProductName || row?.productName || '').trim(),
      designName: String(row?.DesignName || row?.designName || '').trim(),
      purityName: String(row?.PurityName || row?.purityName || '').trim(),
      companyName: String(row?.CompanyName || row?.companyName || '').trim(),
      branchName: String(row?.BranchName || row?.branchName || '').trim(),
    });
  });

  (unmatchedCodes || []).forEach((code) => {
    const rfidCode = String(code || '').trim();
    if (!rfidCode) return;
    const tag = scanTagByRfid[rfidCode.toUpperCase()] || {};
    items.push({
      itemCode: rfidCode,
      status: 'UnMatch',
      quantity: 1,
      grossWeight: 0,
      netWeight: 0,
      tidNumber: String(tag?.tid || tag?.epc || '').trim(),
      rfidCode,
      boxName: '',
      branchId: idOr(branchId),
      counterId: idOr(counterId),
    });
  });

  return items;
};

export const normalizeAddStockVerificationBySessionResponse = (data = {}) => {
  const scanBatchId = data.scanBatchId ?? data.ScanBatchId ?? null;
  return {
    message: String(data.message ?? data.Message ?? '').trim(),
    scanBatchId,
    ScanBatchId: scanBatchId,
    match: data.match ?? data.Match ?? [],
    unmatch: data.unmatch ?? data.Unmatch ?? [],
    totals: data.totals ?? data.Totals ?? {},
    raw: data,
  };
};

/** POST /api/ProductMaster/DeleteStockVerificationByDate — one client, one date, full batches. */
export const DELETE_STOCK_VERIFICATION_BY_DATE_URL = toRrgoldApiUrl(
  '/api/ProductMaster/DeleteStockVerificationByDate'
);

export const deleteStockVerificationByDate = async ({ clientCode, date }, headers = {}) => {
  const { data } = await axios.post(
    DELETE_STOCK_VERIFICATION_BY_DATE_URL,
    {
      ClientCode: String(clientCode || '').trim(),
      Date: String(date || '').trim(),
    },
    {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
        'Content-Type': 'application/json',
        ...headers,
      },
      timeout: 90000,
    }
  );
  return data || {};
};

/** POST /api/ProductMaster/AddStockVerificationBySession */
export const addStockVerificationBySession = async (payload, headers = {}) => {
  const { data } = await axios.post(ADD_STOCK_VERIFICATION_BY_SESSION_URL, payload, {
    headers: {
      Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
      'Content-Type': 'application/json',
      ...headers,
    },
    timeout: 90000,
  });
  return normalizeAddStockVerificationBySessionResponse(data);
};

/** POST /api/ProductMaster/AddStockVerification (day-wise, no batch). */
export const addStockVerification = async (payload, headers = {}) => {
  const { data } = await axios.post(ADD_STOCK_VERIFICATION_URL, payload, {
    headers: {
      Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
      'Content-Type': 'application/json',
      ...headers,
    },
    timeout: 90000,
  });
  return data;
};
