import axios from 'axios';
import { toRrgoldApiUrl, toSoniApiUrl } from './apiBaseConfig';
import { handleAxios401 } from '../utils/authRedirect';
import { applyUserErrorMessage } from '../utils/userErrorMessage';

const soniProductMasterBase = () => toSoniApiUrl('api/ProductMaster');
const rrgoldProductMasterBase = () => toRrgoldApiUrl('api/ProductMaster');
const rrgoldDeviceBase = () => toRrgoldApiUrl('api/RFIDDevice');

// Request interceptor for API calls (skip Content-Type for FormData so multipart works)
axios.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    if (!(config.data instanceof FormData)) {
      config.headers['Content-Type'] = 'application/json';
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for API calls
axios.interceptors.response.use(
  (response) => response,
  (error) => handleAxios401(applyUserErrorMessage(error))
);

export const rfidService = {
  // Registration: fetch available auth plans
  getAvailableAuthPlans: async () => {
    try {
      const response = await axios.get(`${soniProductMasterBase()}/GetAvailableAuthPlans`);
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      throw error;
    }
  },

  // Registration: create new auth user with selected plan (Register.js fields)
  registerAuthUser: async (data) => {
    try {
      const payload = {
        Username: String(data?.Username ?? data?.LoginName ?? '').trim(),
        Password: data?.Password ?? '',
        ClientCode: String(data?.ClientCode ?? '').trim().toUpperCase(),
        SelectedPlan: String(data?.SelectedPlan ?? '').trim(),
      };
      const response = await axios.post(`${soniProductMasterBase()}/AuthRegister`, payload);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get RFID Transaction Details
  getRFIDTransactions: async (clientCode, status = "ApiActive") => {
    try {
      const response = await axios.post(
        `${soniProductMasterBase()}/GetRFIDTransactionDetails`, 
        {
          client_code: clientCode,
          status: status
        }
      );
      // Return the data in a consistent format
      return Array.isArray(response.data) ? response.data : response.data?.data || [];
    } catch (error) {
      throw error;
    }
  },

  // Get TID by Barcode (rrgold) - returns TID value(s) for the given RFID/barcode
  getTidByBarcode: async (clientCode, barcodeNumber) => {
    try {
      const response = await axios.post(
        `${rrgoldProductMasterBase()}/GetTidByBarcode`,
        {
          ClientCode: clientCode || '',
          BarcodeNumber: barcodeNumber || ''
        }
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Update RFID Transaction Details
  updateRFIDTransaction: async (data) => {
    try {
      const response = await axios.post(
        `${soniProductMasterBase()}/UpdateRFIDTransactionDetails`, 
        [{
          client_code: data.clientCode,
          itemcode: data.itemCode || data.itemcode || '',
          RFIDNumber: data.rfidNumber,
          status: data.status
        }]
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Delete Labelled Stock Items
  deleteLabelledStock: async (clientCode, itemCodes) => {
    try {
      const response = await axios.post(
        `${soniProductMasterBase()}/DeleteLabelledStockItems`, 
        {
          ClientCode: clientCode,
          ItemCodes: itemCodes
        }
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get RFID Device Details
  getRFIDDeviceDetails: async (clientCode, deviceId) => {
    try {
      const response = await axios.post(
        `${rrgoldDeviceBase()}/GetAllRFIDDetails`,
        {
          ClientCode: clientCode,
          DeviceId: deviceId
        }
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Delete RFID by Client and Device
  deleteRFIDByClientAndDevice: async (clientCode, deviceId) => {
    try {
      const response = await axios.post(
        `${rrgoldDeviceBase()}/DeleteRFIDByClientAndDevice`,
        {
          ClientCode: clientCode,
          DeviceId: deviceId
        }
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Public helper: get Stones and Diamonds in API format (for bulk submit from AddStock)
  getStonesAndDiamondsForApi(stoneList, diamondList) {
    return {
      Stones: this._mapStonesForApi(stoneList),
      Diamonds: this._mapDiamondsForApi(diamondList)
    };
  },

  // Map stone list from form to API "Stones" array format
  _mapStonesForApi(stoneList) {
    if (!Array.isArray(stoneList) || stoneList.length === 0) return [];
    return stoneList.map(entry => ({
      StoneName: entry.StoneName ?? '',
      StoneSize: entry.StoneSize ?? '',
      StoneWeight: String(entry.StoneWeight ?? ''),
      StonePieces: String(entry.StonePieces ?? ''),
      StoneRatePiece: String(entry.StoneRatePerPiece ?? entry.StoneRate ?? '0.00'),
      StoneRateKarate: String(entry.StoneRateKarate ?? '0.00'),
      StoneAmount: String(entry.StoneAmount ?? '0.00'),
      Description: entry.StoneDescription ?? '',
      StoneDeduct: String(entry.StoneLessPercent ?? ''),
      StoneColour: entry.StoneColour ?? '',
      StoneShape: entry.StoneShape ?? entry.StoneSettingType ?? '',
      StoneStatusType: entry.StoneStatusType ?? null,
      StoneWeightType: entry.StoneWeightType ?? 'Gram'
    }));
  },

  // Map diamond list from form to API "Diamonds" array format
  _mapDiamondsForApi(diamondList) {
    if (!Array.isArray(diamondList) || diamondList.length === 0) return [];
    return diamondList.map(entry => ({
      DiamondName: entry.DiamondName ?? '',
      DiamondSieve: entry.DiamondSieve ?? '',
      DiamondWeight: String(entry.DiamondWeight ?? entry.TotalDiamondWeight ?? ''),
      DiamondPieces: String(entry.DiamondPieces ?? ''),
      DiamondClarity: entry.DiamondClarity ?? '',
      DiamondColour: entry.DiamondColour ?? '',
      DiamondCut: entry.DiamondCut ?? '',
      DiamondShape: entry.DiamondShape ?? '',
      DiamondSize: String(entry.DiamondSize ?? ''),
      DiamondSellRate: String(entry.DiamondSellRate ?? ''),
      DiamondSellAmount: String(entry.DiamondSellAmount ?? ''),
      DiamondPurchaseAmount: String(entry.DiamondPurchaseAmount ?? ''),
      Description: entry.DiamondDescription ?? '',
      DiamondCertificate: entry.DiamondCertificate ?? '',
      DiamondSettingType: entry.DiamondSettingType ?? '',
      DiamondMargin: String(entry.DiamondMargin ?? ''),
      TotalDiamondWeight: String(entry.TotalDiamondWeight ?? entry.DiamondWeight ?? '')
    }));
  },

  // Build one payload item (SaveRFIDTransactionDetails / SaveRFIDTransactionDetailsWithUpload shape)
  buildPayloadFromData: function(data) {
    const itemCode = data.itemCode || '';
    const payload = {
      client_code: data.clientCode,
      branch_id: data.branchId || "",
      counter_id: data.counterId || "",
      RFIDNumber: data.rfidNumber || '',
      Itemcode: itemCode,
      itemcode: itemCode,
      product_code: data.productCode || data.product_code || '',
      description: data.description || '',
      category_id: data.categoryId,
      product_id: data.productId,
      design_id: data.designId || '',
      purity_id: data.purityId || '',
      vendor_id: data.vendorId || '',
      box: data.box || '',
      packet: data.packet || '',
      box_details: data.boxDetails || '',
      grosswt: data.grossWeight,
      stonewt: data.stoneWeight,
      diamondheight: data.diamondHeight,
      diamondweight: data.diamondWeight || data.diamondHeight,
      diamondWeight: data.diamondWeight || data.diamondHeight,
      netwt: data.netWeight,
      size: data.size || 0,
      stoneamount: data.stoneAmount,
      diamondAmount: data.diamondAmount,
      HallmarkAmount: data.hallmarkAmount,
      MakingPerGram: data.makingPerGram,
      MakingPercentage: data.makingPercentage,
      MakingFixedAmt: data.makingFixedAmount,
      MRP: data.mrp,
      imageurl: data.imageUrl || "",
      status: data.status || "ApiActive"
    };
    payload.Stones = this._mapStonesForApi(data.stoneList || []);
    payload.Diamonds = this._mapDiamondsForApi(data.diamondList || []);
    return payload;
  },

  // Save RFID Transaction Details
  saveRFIDTransaction: async (data) => {
    try {
      const payload = rfidService.buildPayloadFromData(data);
      const response = await axios.post(
        `${soniProductMasterBase()}/SaveRFIDTransactionDetails`,
        [payload]
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Save RFID Transaction with image upload (multipart/form-data per API doc)
  // Form fields: Data = JSON array of RFIDGunTransaction (string); Image = file(s), order = item order (1st file → 1st item).
  // Do not set Content-Type; axios sets multipart/form-data with boundary.
  saveRFIDTransactionWithUpload: async (payloadArray, imageFiles = []) => {
    const formData = new FormData();
    formData.append('Data', JSON.stringify(payloadArray));
    payloadArray.forEach((_, i) => {
      const file = imageFiles[i];
      const hasFile = file && typeof file === 'object' && file.size > 0;
      if (hasFile) {
        formData.append('Image', file);
      } else {
        formData.append('Image', new Blob([], { type: 'image/png' }), 'nophoto.png');
      }
    });
    const token = localStorage.getItem('token');
    const config = {
      headers: { Authorization: `Bearer ${token}` }
    };
    const response = await axios.post(
      `${soniProductMasterBase()}/SaveRFIDTransactionDetailsWithUpload`,
      formData,
      config
    );
    return response.data;
  }
};