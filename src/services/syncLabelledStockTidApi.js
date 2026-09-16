import axios from 'axios';
import { toRrgoldApiUrl } from './apiBaseConfig';

export const SYNC_LABELLED_STOCK_TID_PATH = '/api/ProductMaster/SyncLabelledStockTIDFromRfidTable';

export const getSyncLabelledStockTidUrl = () => toRrgoldApiUrl(SYNC_LABELLED_STOCK_TID_PATH);

const pick = (obj, ...keys) => {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return undefined;
};

export const normalizeSyncSample = (row = {}) => ({
  id: pick(row, 'Id', 'id') ?? '',
  itemCode: String(pick(row, 'ItemCode', 'itemCode') || ''),
  rfidCode: String(pick(row, 'RFIDCode', 'rfidCode', 'RfidCode') || ''),
  oldTidNumber: String(pick(row, 'OldTIDNumber', 'oldTIDNumber', 'OldTidNumber') || ''),
  newTidNumber: String(pick(row, 'NewTIDNumber', 'newTIDNumber', 'NewTidNumber') || ''),
  epcCount: Number(pick(row, 'EpcCount', 'epcCount') || 0),
});

export const normalizeSyncResult = (data = {}) => {
  const samples = pick(data, 'Samples', 'samples');
  return {
    message: String(pick(data, 'Message', 'message') || 'Labelled stock TIDNumber updated from RFID table EPC values.'),
    clientCode: String(pick(data, 'ClientCode', 'clientCode') || ''),
    totalChecked: Number(pick(data, 'TotalChecked', 'totalChecked') || 0),
    updated: Number(pick(data, 'Updated', 'updated') || 0),
    notFoundInRfidTable: Number(pick(data, 'NotFoundInRfidTable', 'notFoundInRfidTable') || 0),
    alreadySame: Number(pick(data, 'AlreadySame', 'alreadySame') || 0),
    rfidTableMappings: Number(pick(data, 'RfidTableMappings', 'rfidTableMappings') || 0),
    samples: Array.isArray(samples) ? samples.map(normalizeSyncSample) : [],
  };
};

export const syncLabelledStockTidFromRfidTable = async (clientCode, token) => {
  const code = String(clientCode || '').trim();
  if (!code) {
    throw new Error('Client Code is required.');
  }

  const response = await axios.post(
    getSyncLabelledStockTidUrl(),
    { ClientCode: code },
    {
      timeout: 180000,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    }
  );

  return normalizeSyncResult(response?.data || {});
};
