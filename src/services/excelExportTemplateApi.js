import axios from 'axios';
import * as XLSX from 'xlsx';
import { toRrgoldApiUrl } from './apiBaseConfig';

const TEMPLATE_ID_KEY = 'excelExportTemplateId';

/** *_id column keys export display names; UI shows the mapped hint (not the raw id). */
export const EXCEL_EXPORT_ID_TO_NAME_HINT = {
  branch_id: 'branch_name',
  counter_id: 'counter_name',
  category_id: 'category_name',
  product_id: 'product_name',
  design_id: 'design_name',
  purity_id: 'purity_name',
  vendor_id: 'vendor_name',
};

const EXCEL_EXPORT_NAME_TO_ID_KEY = Object.fromEntries(
  Object.entries(EXCEL_EXPORT_ID_TO_NAME_HINT).map(([idKey, nameHint]) => [nameHint, idKey])
);

/** Template / Excel header key — always the original id key when mapped. */
export const storageExcelExportFieldKey = (key) =>
  EXCEL_EXPORT_NAME_TO_ID_KEY[key] || key;

/** Resolve values for export (name fields on stock row, not numeric ids). */
export const excelExportValueLookupKey = (key) =>
  EXCEL_EXPORT_ID_TO_NAME_HINT[storageExcelExportFieldKey(key)] || key;

/** Subtitle in Export fields modal: show name hint instead of *_id. */
export const excelExportFieldDisplayHint = (key) => {
  const storageKey = storageExcelExportFieldKey(key);
  return EXCEL_EXPORT_ID_TO_NAME_HINT[storageKey] || key;
};

const normalizeExportFieldRow = (field) => {
  const key = storageExcelExportFieldKey(field.key);
  if (key === field.key) return field;
  const catalog = EXCEL_EXPORT_FIELD_CATALOG.find((row) => row.key === key);
  return {
    ...field,
    key,
    label: field.label || catalog?.label || field.key,
  };
};

export const EXCEL_EXPORT_FIELD_CATALOG = [
  { key: 'client_code', label: 'Client Code' },
  { key: 'branch_id', label: 'Branch' },
  { key: 'counter_id', label: 'Counter' },
  { key: 'RFIDNumber', label: 'RFID Number' },
  { key: 'Itemcode', label: 'Item Code' },
  { key: 'product_code', label: 'Product Code' },
  { key: 'description', label: 'Description' },
  { key: 'category_id', label: 'Category' },
  { key: 'product_id', label: 'Product' },
  { key: 'design_id', label: 'Design' },
  { key: 'purity_id', label: 'Purity' },
  { key: 'vendor_id', label: 'Vendor' },
  { key: 'box', label: 'Box' },
  { key: 'packet', label: 'Packet' },
  { key: 'box_details', label: 'Box Details' },
  { key: 'grosswt', label: 'Gross Wt' },
  { key: 'stonewt', label: 'Stone Wt' },
  { key: 'diamondweight', label: 'Diamond Weight' },
  { key: 'netwt', label: 'Net Wt' },
  { key: 'size', label: 'Size' },
  { key: 'stoneamount', label: 'Stone Amount' },
  { key: 'diamondAmount', label: 'Diamond Amount' },
  { key: 'HallmarkAmount', label: 'Hallmark Amount' },
  { key: 'MakingPerGram', label: 'Making Per Gram' },
  { key: 'MakingPercentage', label: 'Making Percentage' },
  { key: 'MakingFixedAmt', label: 'Making Fixed Amt' },
  { key: 'MRP', label: 'MRP' },
  { key: 'imageurl', label: 'Image URL' },
  { key: 'status', label: 'Status' },
  { key: 'Stones', label: 'Stones' },
  { key: 'Diamonds', label: 'Diamonds' },
];

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
  'Content-Type': 'application/json',
});

export const readExcelExportSession = () => {
  try {
    const user = JSON.parse(localStorage.getItem('userInfo') || '{}');
    const clientCode = String(user?.ClientCode || user?.clientCode || user?.clientcode || '').trim();
    const userId = Number(
      user?.Id ?? user?.id ?? user?.UserId ?? user?.userId ?? user?.EmployeeId ?? user?.employeeId ?? 0
    ) || 0;
    return { clientCode, userId };
  } catch {
    return { clientCode: '', userId: 0 };
  }
};

export const excelExportApiError = (error, fallback = 'Request failed.') => {
  const data = error?.response?.data;
  if (data && typeof data === 'object' && data.message) return String(data.message);
  if (typeof data === 'string' && data.trim()) return data.trim();
  return error?.message || fallback;
};

const postJson = (path, body) =>
  axios.post(toRrgoldApiUrl(path), body, {
    headers: authHeaders(),
    timeout: 60000,
    skipGlobalLoader: true,
  });

const HIDDEN_DUPLICATE_KEYS = {
  itemcode: 'Itemcode',
  diamondWeight: 'diamondweight',
};

const collapseDuplicateFields = (fields) => {
  const kept = [];
  const indexByKey = new Map();
  fields.forEach((field) => {
    const key = storageExcelExportFieldKey(HIDDEN_DUPLICATE_KEYS[field.key] || field.key);
    const existingIndex = indexByKey.get(key);
    if (existingIndex === undefined) {
      indexByKey.set(key, kept.length);
      kept.push({ ...field, key });
      return;
    }
    if (field.selected) kept[existingIndex].selected = true;
  });
  return kept.map((field, index) => ({ ...field, order: index + 1 }));
};

const asFieldList = (raw) => {
  const list = Array.isArray(raw) ? raw : raw?.fields || raw?.Fields || raw?.data || [];
  if (!Array.isArray(list)) return [];
  const fields = list
    .map((field, index) => ({
      key: String(field?.key ?? field?.Key ?? '').trim(),
      label: String(field?.label ?? field?.Label ?? field?.key ?? '').trim(),
      selected: field?.selected !== false && field?.Selected !== false,
      order: Number(field?.order ?? field?.Order ?? index + 1) || index + 1,
    }))
    .filter((field) => field.key)
    .map(normalizeExportFieldRow)
    .sort((a, b) => a.order - b.order);
  return collapseDuplicateFields(fields);
};

const asTemplate = (raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const id = Number(raw.id ?? raw.Id ?? 0) || 0;
  const fields = mergeExcelExportFieldsWithCatalog(asFieldList(raw.fields ?? raw.Fields));
  if (!id && !fields.length && !raw.templateName && !raw.TemplateName) return null;
  return {
    id,
    clientCode: String(raw.clientCode ?? raw.ClientCode ?? '').trim(),
    templateName: String(raw.templateName ?? raw.TemplateName ?? 'Default').trim() || 'Default',
    isDefault: raw.isDefault === true || raw.IsDefault === true,
    userId: Number(raw.userId ?? raw.UserId ?? 0) || 0,
    fields,
    createdOn: raw.createdOn ?? raw.CreatedOn ?? '',
    lastUpdated: raw.lastUpdated ?? raw.LastUpdated ?? '',
  };
};

const asTemplateList = (data) => {
  const rows = Array.isArray(data) ? data : data?.data || data?.Data || data?.templates || [];
  return (Array.isArray(rows) ? rows : []).map(asTemplate).filter(Boolean);
};

export const defaultCatalogFields = () =>
  EXCEL_EXPORT_FIELD_CATALOG.map((field, index) => ({
    ...field,
    selected: true,
    order: index + 1,
  }));

/** Always show full catalog in the editor; apply saved/API selection and order where present. */
export const mergeExcelExportFieldsWithCatalog = (templateFields = []) => {
  if (!Array.isArray(templateFields) || !templateFields.length) {
    return defaultCatalogFields();
  }
  const normalized = collapseDuplicateFields(
    (Array.isArray(templateFields) ? templateFields : [])
      .map((field, index) => ({
        key: storageExcelExportFieldKey(String(field?.key ?? field?.Key ?? '').trim()),
        label: String(field?.label ?? field?.Label ?? '').trim(),
        selected: field?.selected !== false && field?.Selected !== false,
        order: Number(field?.order ?? field?.Order ?? index + 1) || index + 1,
      }))
      .filter((field) => field.key)
      .map(normalizeExportFieldRow)
  );

  const byKey = new Map(normalized.map((field) => [field.key, field]));

  const merged = EXCEL_EXPORT_FIELD_CATALOG.map((cat, catalogIndex) => {
    const saved = byKey.get(cat.key);
    if (saved) byKey.delete(cat.key);
    return {
      key: cat.key,
      label: saved?.label || cat.label,
      selected: saved ? saved.selected : false,
      order: saved?.order ?? catalogIndex + 1,
    };
  });

  byKey.forEach((field) => {
    merged.push({
      key: field.key,
      label: field.label || field.key,
      selected: field.selected,
      order: field.order || merged.length + 1,
    });
  });

  merged.sort((a, b) => {
    const orderDiff = (Number(a.order) || 0) - (Number(b.order) || 0);
    if (orderDiff !== 0) return orderDiff;
    const ai = EXCEL_EXPORT_FIELD_CATALOG.findIndex((row) => row.key === a.key);
    const bi = EXCEL_EXPORT_FIELD_CATALOG.findIndex((row) => row.key === b.key);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  return merged.map((field, index) => ({ ...field, order: index + 1 }));
};

export const getExcelExportFields = async (clientCode) => {
  const { data } = await postJson('/api/ProductMaster/GetExcelExportFields', { clientCode });
  const fields = asFieldList(data);
  return fields.length ? mergeExcelExportFieldsWithCatalog(fields) : defaultCatalogFields();
};

export const getExcelExportTemplates = async (clientCode, userId) => {
  const { data } = await postJson('/api/ProductMaster/GetExcelExportTemplates', { clientCode, userId });
  return asTemplateList(data);
};

export const getExcelExportTemplateById = async (clientCode, id) => {
  const body = id ? { clientCode, id: Number(id) } : { clientCode };
  const { data } = await postJson('/api/ProductMaster/GetExcelExportTemplateById', body);
  return asTemplate(data);
};

export const saveExcelExportTemplate = async (payload) => {
  const { data } = await postJson('/api/ProductMaster/SaveExcelExportTemplate', payload);
  const saved = asTemplate(data);
  if (!saved) {
    const message = data?.message || data?.Message;
    if (message) throw new Error(String(message));
  }
  return saved;
};

export const setDefaultExcelExportTemplate = async (clientCode, id) => {
  const { data } = await postJson('/api/ProductMaster/SetDefaultExcelExportTemplate', {
    clientCode,
    id: Number(id),
  });
  return asTemplate(data);
};

export const deleteExcelExportTemplate = async (clientCode, id) => {
  const { data } = await postJson('/api/ProductMaster/DeleteExcelExportTemplate', {
    clientCode,
    id: Number(id),
  });
  return data;
};

export const rememberExcelExportTemplateId = (id) => {
  if (!id) {
    sessionStorage.removeItem(TEMPLATE_ID_KEY);
    return;
  }
  sessionStorage.setItem(TEMPLATE_ID_KEY, String(id));
};

export const rememberedExcelExportTemplateId = () => {
  const raw = sessionStorage.getItem(TEMPLATE_ID_KEY);
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : 0;
};

export const pickActiveExcelExportTemplate = (templates) => {
  const list = Array.isArray(templates) ? templates : [];
  const remembered = rememberedExcelExportTemplateId();
  return (
    list.find((item) => remembered && Number(item.id) === remembered) ||
    list.find((item) => item.isDefault) ||
    list[0] ||
    null
  );
};

export const loadActiveExcelExportTemplate = async () => {
  const { clientCode, userId } = readExcelExportSession();
  if (!clientCode) return null;
  const templates = await getExcelExportTemplates(clientCode, userId);
  const active = pickActiveExcelExportTemplate(templates);
  if (active?.id) rememberExcelExportTemplateId(active.id);
  return active;
};

const textValue = (value) => {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }
  return String(value);
};

const weightValue = (value) => {
  if (value === undefined || value === null || value === '') return '';
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(3) : textValue(value);
};

const firstText = (item, keys) => {
  for (const key of keys) {
    const value = item?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return '';
};

export const valueForExcelExportKey = (item, key, clientCode = '') => {
  const row = item || {};
  switch (excelExportValueLookupKey(key)) {
    case 'client_code':
      return textValue(firstText(row, ['client_code', 'ClientCode']) || clientCode);
    case 'branch_name':
      return textValue(firstText(row, ['BranchName', 'Branch', 'branchName', 'branch_name']));
    case 'counter_name':
      return textValue(firstText(row, ['CounterName', 'Counter', 'counterName', 'counter_name']));
    case 'RFIDNumber':
      return textValue(firstText(row, ['RFIDNumber', 'RFIDCode', 'RFID', 'rfidCode', 'RFIDTag', 'rfidTag']));
    case 'Itemcode':
    case 'itemcode':
      return textValue(firstText(row, ['Itemcode', 'ItemCode', 'itemcode']));
    case 'product_code':
      return textValue(firstText(row, ['ProductCode', 'product_code', 'productCode']));
    case 'description': {
      const description = textValue(firstText(row, ['Description', 'description']));
      if (description) return description;
      const size = textValue(firstText(row, ['Size', 'size', 'itemsize']));
      const huid = textValue(firstText(row, ['HUIDCode', 'HuidCode', 'huid']));
      const parts = [];
      if (size) parts.push(`itemsize:${size}`);
      if (huid) parts.push(`HUIDCode:${huid}`);
      return parts.join(', ');
    }
    case 'category_name':
      return textValue(firstText(row, ['CategoryName', 'Category', 'categoryName', 'category_name']));
    case 'product_name':
      return textValue(firstText(row, ['ProductName', 'Product', 'productName', 'product_name']));
    case 'design_name':
      return textValue(firstText(row, ['DesignName', 'Design', 'designName', 'design_name']));
    case 'purity_name':
      return textValue(firstText(row, ['PurityName', 'Purity', 'purityName', 'purity_name']));
    case 'vendor_name':
      return textValue(firstText(row, ['VendorName', 'Vendor', 'vendorName', 'vendor_name']));
    case 'box':
    case 'box_details':
      return textValue(firstText(row, ['BoxName', 'box_details', 'Box', 'box']));
    case 'packet':
      return textValue(firstText(row, ['PacketName', 'Packet', 'packet']));
    case 'grosswt':
      return weightValue(firstText(row, ['GrossWt', 'grosswt', 'GrossWeight']));
    case 'stonewt':
      return weightValue(firstText(row, ['StoneWt', 'TotalStoneWeight', 'stonewt', 'StoneWeight', 'stoneWeight']));
    case 'diamondweight':
    case 'diamondWeight':
      return weightValue(firstText(row, ['DiamondWt', 'TotalDiamondWeight', 'diamondweight', 'diamondWeight']));
    case 'netwt':
      return weightValue(firstText(row, ['NetWt', 'netwt', 'NetWeight']));
    case 'size':
      return textValue(firstText(row, ['Size', 'size']));
    case 'stoneamount':
      return textValue(firstText(row, ['StoneAmt', 'TotalStoneAmount', 'stoneamount']));
    case 'diamondAmount':
      return textValue(firstText(row, ['DiamondAmount', 'TotalDiamondAmount', 'diamondAmount']));
    case 'HallmarkAmount':
      return textValue(firstText(row, ['HallmarkAmount', 'hallmarkAmount', 'HallmarkAmt']));
    case 'MakingPerGram':
      return textValue(firstText(row, ['MakingPerGram', 'makingPerGram']));
    case 'MakingPercentage':
      return textValue(firstText(row, ['MakingPercentage', 'makingPercentage']));
    case 'MakingFixedAmt':
      return textValue(firstText(row, ['MakingFixedAmt', 'FixedAmt', 'makingFixedAmt']));
    case 'MRP':
      return textValue(firstText(row, ['MRP', 'Mrp', 'mrp']));
    case 'imageurl':
      return textValue(firstText(row, ['ImageUrl', 'ImageURL', 'imageurl', 'ImagePath']));
    case 'status':
      return textValue(firstText(row, ['Status', 'status']));
    case 'Stones':
      return textValue(row.Stones ?? row.stones ?? '');
    case 'Diamonds':
      return textValue(row.Diamonds ?? row.diamonds ?? '');
    default:
      return textValue(row[key]);
  }
};

export const selectedExportFields = (fields) =>
  (Array.isArray(fields) ? fields : [])
    .filter((field) => field?.selected && field?.key)
    .slice()
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));

export const buildExcelRowsFromTemplate = (items, fields, clientCode = '') => {
  const columns = selectedExportFields(fields);
  return (Array.isArray(items) ? items : []).map((item) => {
    const row = {};
    columns.forEach((field) => {
      row[field.key] = valueForExcelExportKey(item, field.key, clientCode);
    });
    return row;
  });
};

export const worksheetFromTemplateRows = (rows) => {
  const safeRows = rows?.length ? rows : [{}];
  const ws = XLSX.utils.json_to_sheet(safeRows);
  const headers = Object.keys(safeRows[0] || {});
  ws['!cols'] = headers.map((key) => ({ wch: Math.min(36, Math.max(12, String(key).length + 2)) }));
  return ws;
};

export const writeExcelRowsFile = (rows, sheetName, filePrefix) => {
  const wb = XLSX.utils.book_new();
  const ws = worksheetFromTemplateRows(rows);
  XLSX.utils.book_append_sheet(wb, ws, String(sheetName || 'Export').slice(0, 31));
  const stamp = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const fileStamp = `${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}_${pad(stamp.getHours())}${pad(stamp.getMinutes())}${pad(stamp.getSeconds())}`;
  XLSX.writeFile(wb, `${filePrefix || 'Export'}_${fileStamp}.xlsx`);
};

export const rowsForActiveExportTemplate = async (items) => {
  const { clientCode } = readExcelExportSession();
  const template = await loadActiveExcelExportTemplate();
  const fields = selectedExportFields(template?.fields);
  if (!fields.length) {
    throw new Error('Select at least one export field in the template.');
  }
  const rows = buildExcelRowsFromTemplate(items, fields, clientCode);
  if (rows.length) return rows;
  const blank = {};
  fields.forEach((field) => {
    blank[field.key] = '';
  });
  return [blank];
};

export const exportItemsWithSavedTemplate = async (items, { sheetName = 'Label Stock', filePrefix = 'LabelledStock_Export' } = {}) => {
  const rows = await rowsForActiveExportTemplate(items);
  writeExcelRowsFile(rows, sheetName, filePrefix);
  return rows;
};

export const labelledStockExportFileName = () => {
  const stamp = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `LabelledStock_Export_${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}_${pad(stamp.getHours())}${pad(stamp.getMinutes())}${pad(stamp.getSeconds())}.xlsx`;
};
