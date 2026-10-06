// Helper to convert string to hex - no padding, use real hex value
const toHex = (str) => {
  if (!str) return '';
  let hex = '';
  for (let i = 0; i < str.length; i++) {
    hex += str.charCodeAt(i).toString(16).toUpperCase();
  }
  return hex;
};


const stringToHex = (str) => {
  return str
    .split("")
    .map((char) => char.charCodeAt(0).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
};

/** Split item code into prefix/suffix for Code128 composite barcodes (FNC1 + apostrophe). */
const splitItemCodeForBarcode = (code) => {
  const trimmed = String(code || '').trim();
  if (!trimmed) return { prefix: '', suffix: '' };

  // Letter prefix + numeric suffix — SJ126, SJ001234, NSPY1064, S34, SJ25
  const alphaNumeric = trimmed.match(/^([A-Za-z]+)(\d+)$/);
  if (alphaNumeric) {
    return { prefix: alphaNumeric[1].toUpperCase(), suffix: alphaNumeric[2] };
  }

  // Letter prefix + mixed remainder
  const alphaRest = trimmed.match(/^([A-Za-z]+)(.+)$/);
  if (alphaRest?.[2]) {
    return { prefix: alphaRest[1].toUpperCase(), suffix: alphaRest[2] };
  }

  // Fallback: split after first 3 characters when long enough
  if (trimmed.length > 3) {
    return { prefix: trimmed.substring(0, 3), suffix: trimmed.substring(3) };
  }

  return { prefix: trimmed, suffix: '' };
};

/** Code128B composite payload: FNC1 + & + prefix + FNC1 + ' + suffix (or plain &code when no suffix). */
const formatCode128CompositePayload = (itemCode) => {
  const code = String(itemCode || '').trim();
  if (!code) return '';
  const fnc1 = String.fromCharCode(14);
  const { prefix, suffix } = splitItemCodeForBarcode(code);

  if (suffix) {
    return `${fnc1}&${prefix}${fnc1}'${suffix}`;
  }
  return `${fnc1}&${code}`;
};


// Calculate EPC bit length and PC value from actual hex length (no zero padding)
// 4 hex digits = 1 EPC word (16 bits). PC = wordCount << 11 (Incoded RFWTAG format)
// Matches *1800* (48b), *2000* (64b), *2800* (80b), *3000* (96b)
const calculateEpcMemory = (hexCode) => {
  if (!hexCode) {
    return { epcBits: 96, pcValue: '*3000*', epcHex: '000000000000000000000000' };
  }

  let epcHex = String(hexCode).toUpperCase().replace(/[^0-9A-F]/g, '');
  if (!epcHex) {
    return { epcBits: 96, pcValue: '*3000*', epcHex: '000000000000000000000000' };
  }

  const len = epcHex.length;
  // Minimum 3 words (48 bits) for printer compatibility
  const words = Math.max(3, Math.ceil(len / 4));
  const epcBits = words * 16;
  const maxHexLen = words * 4;
  const pcWord = words << 11;
  const pcValue = `*${pcWord.toString(16).toUpperCase().padStart(4, '0')}*`;

  if (len > maxHexLen) {
    epcHex = epcHex.substring(0, maxHexLen);
  } else if (len < maxHexLen) {
    // Pad to full EPC word count (multiple of 4 hex digits) for Incoded printer memory
    epcHex = epcHex.padStart(maxHexLen, '0');
  }

  return { epcBits, pcValue, epcHex };
};

// Generate PRN for LS000224
const generateLS000224Prn = (item) => {
  const code = item.ItemCode || item.RFIDCode || '';
  const epcHex = toHex(code);
  const epcPadded = epcHex.padStart(12, '0').substring(0, 12);
  const design = item.DesignName || item.ProductName || item.CategoryName || '';
  const grossWt = item.GrossWt != null && item.GrossWt !== '' ? String(item.GrossWt) : '0.000';
  const netWt = item.NetWt != null && item.NetWt !== '' ? String(item.NetWt) : '0.000';
  const mrp = item.MRP != null && item.MRP !== '' ? String(item.MRP) : '0';

  return `!PTX_SETUP
ENGINE-WIDTH;1478:LENGTH;710:MIRROR;0.
PTX_END
~PAPER;ROTATE 0
~CONFIG
UPC DESCENDERS;0
END
~CONFIG
CHECK DYNAMIC BCD;0
END
~CREATE;FORM-0;51
SCALE;DOT;203;203
ISET;'UTF8'
RFWTAG;16;PC
16;H;*1C00*
STOP
RFWTAG;48;EPC
48;H;*${epcPadded}*
STOP
VERT
3;180;8;135
STOP
FONT;FACE 92250;BOLD 0;SLANT 0
ALPHA
INV;POINT;39;284;9;11;"${code}"
STOP
BARCODE
QRCODE;INV;XD3;T2;E0;M0;I0;72;207
"${code}"
STOP
ALPHA
INV;POINT;115;148;9;9;"${design}"
INV;POINT;83;148;9;10;"G : ${grossWt}"
INV;POINT;51;148;9;10;"N : ${netWt}"
INV;POINT;21;150;9;9;"${mrp}"
STOP
END
~EXECUTE;FORM-0;1

~NORMAL
~DELETE FORM;FORM-0
`;
};

// Generate PRN for LS000428 (Original template)
const generateLS000428Prn = (item) => {
  // Use MRP if available, otherwise fallback to FixedAmt, then '0'
  const price = item.MRP || item.FixedAmt || '0';
  const purity = item.Purity || item.PurityName || '';
  const epcHex = toHex(item.ItemCode || '');

  return `!PTX_SETUP
ENGINE-WIDTH;2483:LENGTH;1065:MIRROR;0.
PTX_END
~PAPER;ROTATE 0
~CONFIG
UPC DESCENDERS;0
END
~PAPER;LABELS 1;MEDIA 1
~PAPER;FEED SHIFT 0;INTENSITY 0;SPEED IPS 6;SLEW IPS 6;TYPE 0
~PAPER;CUT 0;PAUSE 0;TEAR 0
~CONFIG
CHECK DYNAMIC BCD;0
SLASH ZERO;0
UPPERCASE;0
AUTO WRAP;0
HOST FORM LENGTH;1
END
~CREATE;FORM-0;76
SCALE;DOT;203;203
ISET;'UTF8'
RFWTAG;16;PC
16;H;*1C00*
STOP
RFWTAG;48;EPC
48;H;*${epcHex}*
STOP
FONT;FACE 92250;BOLD 0;SLANT 0
ALPHA
INV;POINT;160;194;6;8;"OPJ"
INV;POINT;160;104;6;11;"DIV"
INV;POINT;132;194;6;9;"${item.ItemCode || ''}"
INV;POINT;132;104;6;9;"1PC"
INV;POINT;188;195;6;8;"${item.ProductName || ''}"
STOP
BARCODE
C128B;INV;XRD1:1:2:2:3:3:4:4;H3.17;31;33
"&${item.ItemCode || ''}"
STOP
ALPHA
INV;POINT;77;197;6;9;"MSRP:"
INV;POINT;79;117;6;10;"Rs"
INV;POINT;79;80;6;8;"${price}/-"
INV;POINT;41;194;6;8;"${purity}"
STOP
END
~EXECUTE;FORM-0;1

~NORMAL
~DELETE FORM;FORM-0
`;
};

// Gold/Silver barcode: & prefix + apostrophe after 3rd char (Code128)
/*const formatBarcodeForLs000443 = (barcodeValue) => {
  if (!barcodeValue || barcodeValue.length <= 3) return `&${barcodeValue}`;
  return `&${barcodeValue.substring(0, 3)}'${barcodeValue.substring(3)}`;
};*/

const resolveLS000606Category = (item) =>
  String(item.Category || item.CategoryName || item.ProductId || item.ProductType || '')
    .trim()
    .toUpperCase();

const resolveLS000606DesignLabel = (item) =>
  String(item.DesignName || item.Design || item.design || item.design_name || '').trim();

const resolveLS000606ProductName = (item) =>
  String(item.ProductName || item.CategoryName || item.Description || item.description || '').trim();

const resolveLS000606GrossWt = (item) =>
  formatWeight3(item.GrossWt ?? item.GrossWeight ?? item.grosswt ?? item.TWt);

const resolveLS000606NetWt = (item) =>
  formatWeight3(item.NetWt ?? item.NetWeight ?? item.netwt ?? item.GrossWt ?? item.TWt ?? 0);

const resolveLS000606StoneWt = (item) => {
  const raw = item.TotalStoneWeight ?? item.StoneWt ?? item.stonewt ?? item.StoneWeight ?? 0;
  const n = parseFloat(raw);
  if (Number.isNaN(n) || n <= 0) return '0.00';
  return formatWeight3(n);
};

const resolveLS000606DiamondPcs = (item) => {
  const raw =
    item.TotalDiamondPieces ??
    item.DiamondPcs ??
    item.DiamondPieces ??
    item.TotalStonePieces ??
    item.StonePcs ??
    item.Pieces ??
    item.pieces ??
    item.Pcs ??
    0;
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? '0' : String(n);
};

const resolveLS000606StonePcs = (item) => {
  const raw = item.TotalStonePieces ?? item.StonePcs ?? item.StonePieces ?? 1;
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? '1' : String(n);
};

const resolveLS000606MakingCharge = (item) => {
  const raw = item.MakingCharge ?? item.Making ?? item.MakingChg ?? item.MRP ?? item.FixedAmt ?? 0;
  const text = String(raw ?? '').trim();
  return text ? `${text}/-` : '0/-';
};

const resolveLS000606BarcodePayload = (itemCode) => formatCode128CompositePayload(itemCode);

const resolveLS000606EpcMemory = (item) => {
  const source = String(item.ItemCode || item.RFIDCode || '').trim();
  return calculateEpcMemory(stringToHex(source));
};

const generateLS000606Prn = (item) => {
  const itemCode = String(item.ItemCode || item.RFIDCode || '').trim();
  const category = resolveLS000606Category(item);
  const isSilver = category === 'SILVER' || category.includes('SILVER');
  const designLabel = prnQuote(resolveLS000606DesignLabel(item));
  const productName = prnQuote(resolveLS000606ProductName(item));
  const grossWt = prnQuote(resolveLS000606GrossWt(item));
  const netWt = prnQuote(resolveLS000606NetWt(item));
  const stoneWt = prnQuote(resolveLS000606StoneWt(item));
  const diamondPcs = prnQuote(resolveLS000606DiamondPcs(item));
  const stonePcs = prnQuote(resolveLS000606StonePcs(item));
  const makingCharge = prnQuote(resolveLS000606MakingCharge(item));
  const purity = prnQuote(String(item.PurityName || item.Purity || item.purity || '').trim());
  const barcodePayload = prnQuote(resolveLS000606BarcodePayload(itemCode));
  const { epcBits, pcValue, epcHex } = resolveLS000606EpcMemory(item);
  const pcsLabel = isSilver ? 'S.PCS :' : 'D.PCS :';
  const pcsValue = isSilver ? stonePcs : diamondPcs;
  const purityLine = isSilver ? `\nINV;POINT;56;360;7;7;"${purity}"` : '';

  return `<xpml><page quantity='0' pitch='18.0 mm'></xpml>!PTX_SETUP
ENGINE-WIDTH;3941:LENGTH;710:MIRROR;0.
PTX_END
~PAPER;ROTATE 0
~CONFIG
UPC DESCENDERS;0
END
~PAPER;LABELS 2;MEDIA 1
~PAPER;FEED SHIFT 0;INTENSITY 15;SPEED IPS 2;SLEW IPS 2;TYPE 0
~PAPER;CUT 0;PAUSE 0;TEAR 0
~CONFIG
CHECK DYNAMIC BCD;0
SLASH ZERO;0
UPPERCASE;0
AUTO WRAP;0
HOST FORM LENGTH;1
END
<xpml></page></xpml><xpml><page quantity='1' pitch='18.0 mm'></xpml>~CREATE;FORM-0;51
SCALE;DOT;203;203
ISET;'UTF8'
RFWTAG;16;PC
16;H;${pcValue}
STOP
RFWTAG;${epcBits};EPC
${epcBits};H;*${epcHex}*
STOP
FONT;FACE 92250;BOLD 0;SLANT 0
ALPHA
INV;POINT;109;775;7;7;"${designLabel}"
INV;POINT;79;775;7;7;"G.WT :"
INV;POINT;53;775;7;7;"S.WT :"
INV;POINT;23;775;7;7;"N.WT :"
INV;POINT;79;720;7;7;"${grossWt}"
INV;POINT;53;720;7;7;"${stoneWt}"
INV;POINT;23;720;7;7;"${netWt}"
INV;POINT;79;640;7;7;"${pcsLabel}"
INV;POINT;53;640;7;7;"PCS :"
INV;POINT;23;640;7;7;"MAK @"
INV;POINT;79;570;7;7;"${pcsValue}"
INV;POINT;53;580;7;7;"${stonePcs}"
INV;POINT;23;581;7;7;"${makingCharge}"
INV;POINT;102;499;7;7;"${productName}"
STOP
BARCODE
C128B;INV;XRD1:1:2:2:3:3:4:4;H3.7;55;370
"${barcodePayload}"
STOP
ALPHA
INV;POINT;19;477;7;7;"${itemCode}"
${purityLine}
STOP
END
~EXECUTE;FORM-0;1
<xpml></page></xpml>
~NORMAL
~DELETE FORM;FORM-0
`;
};
// Generate PRN for LS000443 - Gold Category (matches client sample layout)
const generateLS000443GoldPrn = (item) => {
  const itemCode = item.ItemCode || '';
  const barcodeValue = item.BarcodeValue || item.Barcode || itemCode;
  const grossWt = item.GrossWt || item.GrossWeight || '0.610';
  const purityName = item.PurityName || item.Purity || '18K GOLD PENDANT';
  let rawEpcHex = stringToHex(barcodeValue);

  // Pad to 20 characters (80 bits) for EPC
  if (rawEpcHex.length < 20) {
    rawEpcHex = rawEpcHex.padStart(20, "0");
  } else if (rawEpcHex.length > 20) {
    rawEpcHex = rawEpcHex.substring(0, 20);
  }

  // Format barcode: & prefix + alpha prefix + apostrophe + numeric suffix
  const formattedBarcode = (() => {
    const { prefix, suffix } = splitItemCodeForBarcode(barcodeValue);
    if (suffix) return `&${prefix}'${suffix}`;
    return `&${barcodeValue}`;
  })();

  return `!PTX_SETUP
ENGINE-WIDTH;2838:LENGTH;1380:MIRROR;0.
PTX_END
~PAPER;ROTATE 0
~CONFIG
UPC DESCENDERS;0
END
~PAPER;LABELS 2;MEDIA 1
~PAPER;FEED SHIFT 0;INTENSITY 15;SPEED IPS 2;SLEW IPS 2;TYPE 0
~PAPER;CUT 0;PAUSE 0;TEAR 0
~CONFIG
CHECK DYNAMIC BCD;0
SLASH ZERO;0
UPPERCASE;0
AUTO WRAP;0
HOST FORM LENGTH;1
END
~CREATE;FORM-0;99
SCALE;DOT;203;203
ISET;'UTF8'
RFWTAG;16;PC
16;H;*2C00*
STOP
RFWTAG;80;EPC
80;H;*${rawEpcHex}*
STOP
FONT;FACE 92250;BOLD 0;SLANT 0
ALPHA
INV;POINT;187;543;7;8;"G.Wt :"
INV;POINT;187;473;7;7;"${grossWt}"
INV;POINT;216;543;7;7;"${purityName}"
STOP
BARCODE
C128B;INV;XRD1:1:2:2:3:3:4:4;H3.18;70;381
"${barcodeValue}"
STOP
ALPHA
INV;POINT;39;501;7;7;"${itemCode}"
INV;POINT;190;316;7;7;"LASHEEN JEWELLERY"
STOP
END
~EXECUTE;FORM-0;1

~NORMAL
~DELETE FORM;FORM-0
`;
};

// Generate PRN for LS000443 - Diamond Category (New template)
const generateLS000443DiamondPrn = (item) => {
  const itemCode = item.ItemCode || '';
  const barcodeValue = item.BarcodeValue || item.Barcode || itemCode;
  const vendorName = item.VendorName || '';
  const purityName = item.PurityName || item.Purity || '';
  const description = item.Description || '';
  const mrp = item.MRP || item.FixedAmt || item.CounterCode || '';
  const grossWt = item.GrossWt || item.GrossWeight || '0.000';
  const dWt = item.TotalDiamondWeight || item.DiamondWt || '0.000';
  const oWt = item.TotalStoneWeight || item.StoneWt || '0.000';
  const { epcHex: rawEpcHex } = calculateEpcMemory(stringToHex(barcodeValue));

  const isGrossWtVisible = parseFloat(grossWt) > 0;
  const isDWtVisible = parseFloat(dWt) > 0;
  const isOWtVisible = parseFloat(oWt) > 0;

  return `!PTX_SETUP
ENGINE-WIDTH;2838:LENGTH;1380:MIRROR;0.
PTX_END
~PAPER;ROTATE 0
~CONFIG
UPC DESCENDERS;0
END
~PAPER;LABELS 2;MEDIA 1
~PAPER;FEED SHIFT 0;INTENSITY 15;SPEED IPS 2;SLEW IPS 2;TYPE 0
~PAPER;CUT 0;PAUSE 0;TEAR 0
~CONFIG
CHECK DYNAMIC BCD;0
SLASH ZERO;0
UPPERCASE;0
AUTO WRAP;0
HOST FORM LENGTH;1
END
~CREATE;FORM-0;99
SCALE;DOT;203;203
ISET;'UTF8'
RFWTAG;16;PC
16;H;*3400*
STOP
RFWTAG;96;EPC
96;H;*${rawEpcHex}*
STOP
FONT;FACE 92250;BOLD 0;SLANT 0
ALPHA
${isGrossWtVisible ? `INV;POINT;237;515;8;7;"G.Wt :"\nINV;POINT;240;458;7;7;"${grossWt}"` : ''}
${isDWtVisible ? `INV;POINT;219;515;7;7;"D.Wt :"\nINV;POINT;220;456;7;7;"${dWt}"` : ''}
${isOWtVisible ? `INV;POINT;199;515;7;7;"O.Wt :"\nINV;POINT;199;455;7;7;"${oWt}"` : ''}
INV;POINT;177;515;7;7;"${vendorName}"
INV;POINT;157;536;6;6;"${description}"
INV;POINT;117;531;7;7;"LJ"
INV;POINT;117;489;7;7;"${mrp}"
INV;POINT;94;531;7;7;"${purityName}"
INV;POINT;71;531;7;7;"${itemCode}"
STOP
BARCODE
C128B;INV;XRD1:1:2:2:3:3:4:4;H3.9;36;380
"${barcodeValue}"
STOP
ALPHA
INV;POINT;192;306;7;7;"LASHEEN JEWELLERY"
STOP
END
~EXECUTE;FORM-0;1

~NORMAL
~DELETE FORM;FORM-0
`;
};

// Exact LS000431 baseline PRN from DELHILOGOOPNew (1).prn (byte-preserved via base64)
const LS000431_BASE_PRN_B64 = "PHhwbWw+PHBhZ2UgcXVhbnRpdHk9JzAnIHBpdGNoPScyNy4wIG1tJz48L3hwbWw+IVBUWF9TRVRVUA0KRU5HSU5FLVdJRFRIOzI0ODM6TEVOR1RIOzEwNjU6TUlSUk9SOzAuDQpQVFhfRU5EDQp+UEFQRVI7Uk9UQVRFIDANCn5DT05GSUcNClVQQyBERVNDRU5ERVJTOzANCkVORA0KflBBUEVSO0xBQkVMUyAyO01FRElBIDENCn5QQVBFUjtGRUVEIFNISUZUIDA7SU5URU5TSVRZIDA7U1BFRUQgSVBTIDY7U0xFVyBJUFMgNjtUWVBFIDANCn5QQVBFUjtDVVQgMDtQQVVTRSAwO1RFQVIgMA0KfkNPTkZJRw0KQ0hFQ0sgRFlOQU1JQyBCQ0Q7MA0KU0xBU0ggWkVSTzswDQpVUFBFUkNBU0U7MA0KQVVUTyBXUkFQOzANCkhPU1QgRk9STSBMRU5HVEg7MQ0KRU5EDQo8eHBtbD48L3BhZ2U+PC94cG1sPjx4cG1sPjxwYWdlIHF1YW50aXR5PScxJyBwaXRjaD0nMjcuMCBtbSc+PC94cG1sPn5MT0dPO0xPR08tMDtQQ1gNCgoFAQEAAAAAKQAdACwBLAEAAAD///8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQYAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwcDEAMH/gMQAf7/B/bd/wf9/f8H3t1/B/7/G/8HwAMH/wcADwf/BwAB/gADB/4AAP8IAf4AAHsIAf4AADMIAf4DEAH/BwB/B4cH+AMH/weAfweHB/gHB/8HwH8HAwf4Dwf/B+A/BwMH8B8H/wfwHwcDB+A/B/8H+A8HhwfAfwf/B/wHB88HgP8H/wf+Awf/BwH/B/8H/wcB/gML/wf/B4D8Bwv/B/8HwHgPC/8H/wfgMB8L/wf/B/AAPwv/B/8H+AB/C/8L/AD/C/8L/gH/C/8L/wcDD/8L/weHD/8L/wfPD/35SQVNURVJFTkQNCkVORA0KfkNSRUFURTtGT1JNLTA7NzYNClNDQUxFO0RPVDsyMDM7MjAzDQpJU0VUOydVVEY4Jw0KUkZXVEFHOzE2O1BDDQoxNjtIOyoxQzAwKg0KU1RPUA0KUkZXVEFHOzQ4O0VQQw0KNDg7SDsqNTM0NjQ5MzMzOTM3Kg0KU1RPUA0KRk9OVDtGQUNFIDkyMjUwO0JPTEQgMDtTTEFOVCAwDQpBTFBIQQ0KSU5WO1BPSU5UOzE2MDsxOTQ7Njs4OyJPUEoiDQpJTlY7UE9JTlQ7MTYwOzEwMzs2OzExOyJESVYiDQpJTlY7UE9JTlQ7MTMyOzE5NDs2Ozk7IlNGSTM5NyINCklOVjtQT0lOVDsxMzI7MTAzOzY7OTsiMVBDIg0KSU5WO1BPSU5UOzE4ODsxOTU7Njs4OyJTSUxWRVIgRkFOQ1kgSVRFTSINClNUT1ANCkJBUkNPREUNCkMxMjhCO0lOVjtYUkQxOjE6MjoyOjM6Mzo0OjQ7SDMuMTc7MzE7MzMNCiIOJlNGSTM5NyINClNUT1ANCkFMUEhBDQpJTlY7UE9JTlQ7Nzc7MTk3OzY7OTsiTVNSUDoiDQpJTlY7UE9JTlQ7Nzk7MTE3OzY7MTA7IlJzIg0KSU5WO1BPSU5UOzc5OzgwOzY7ODsiMjAxMDAvLSINCklOVjtQT0lOVDs4Ozk5OzY7ODsiOTk5Ig0KU1RPUA0KTE9HTw0KMzA7MTUyO0xPR08tMA0KU1RPUA0KRU5EDQp+RVhFQ1VURTtGT1JNLTA7MQ0KPHhwbWw+PC9wYWdlPjwveHBtbD4NCn5OT1JNQUwNCn5ERUxFVEUgRk9STTtGT1JNLTANCn5ERUxFVEUgTE9HTztMT0dPLTANCg==";

const decodeBase64Latin1 = (base64) => {
  const binary = atob(base64);
  return Array.from(binary, (ch) => String.fromCharCode(ch.charCodeAt(0))).join('');
};

// Generate PRN for LS000431 by replacing only dynamic fields in exact base file
const generateLS000431Prn = (item) => {
  const price = item.MRP || item.FixedAmt || '0';
  const purity = item.Purity || item.PurityName || '';
  const itemCode = item.ItemCode || '';
  const productName = item.ProductName || '';
  const description = String(
    item.Description || item.description || productName || ''
  )
    .replace(/"/g, ' ')
    .trim();
  const vendorName = String(item.VendorName || item.Vendor || item.vendor_id || '').trim();
  const epcHex = toHex(itemCode).padStart(12, '0').substring(0, 12);
  const barcodePrefix = String.fromCharCode(14);

  let prn = decodeBase64Latin1(LS000431_BASE_PRN_B64);
  prn = prn.replace("*534649333937*", `*${epcHex}*`);
  prn = prn.replaceAll('"SFI397"', `"${itemCode}"`);
  prn = prn.replaceAll('"OP16P0426"', `"${description}"`);
  prn = prn.replaceAll('"OP10B0426"', `"${description}"`);
  prn = prn.replace('"SILVER FANCY ITEM"', `"${productName}"`);
  prn = prn.replace('"DIV"', `"${vendorName || 'DIV'}"`);
  prn = prn.replace('"20100/-"', `"${price}/-"`);
  prn = prn.replace('"999"', `"${purity}"`);
  prn = prn.replace(`${barcodePrefix}&SFI397`, `${barcodePrefix}&${itemCode}`);
  prn = prn.split(`${barcodePrefix}&OP16P0426`).join(`${barcodePrefix}&${description}`);
  prn = prn.split(`${barcodePrefix}&OP10B0426`).join(`${barcodePrefix}&${description}`);
  return prn;
};
/** Escape text embedded in PRN quoted strings */
const prnQuote = (value) => String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const formatWeight3 = (value) => {
  const n = parseFloat(value);
  if (Number.isNaN(n)) return '0.000';
  return n.toFixed(3);
};

const formatDiamondCt = (value) => {
  const n = parseFloat(value);
  if (Number.isNaN(n)) return '0.00 Ct';
  return `${n.toFixed(2)} Ct`;
};

const formatDiamondCtLower = (value) => {
  const n = parseFloat(value);
  if (Number.isNaN(n)) return '0.00 ct';
  return `${n.toFixed(2)} ct`;
};

/** Design label for LS000533 bottom field — matches grid "Design" column (e.g. 1pt, 1.5pt, 3pt) */
const resolveLS000533DesignLabel = (item) => {
  const designName = String(
    item.DesignName || item.Design || item.design || item.design_name || ''
  ).trim();
  if (designName) return designName;

  const designId = item.DesignId ?? item.design_id ?? item.DesignID ?? '';
  if (designId !== '' && designId != null && String(designId).trim() !== '0') {
    return String(designId).trim();
  }

  return '';
};

/** Purity line on LS000533 label (e.g. "14kt") */
const resolveLS000533Purity = (item) =>
  String(item.PurityName || item.Purity || item.purity || '').trim();

/** Description line on LS000533 label (e.g. "7.25in 155pc") */
const resolveLS000533Description = (item) => {
  const base = String(
    item.Description || item.description || item.Size || item.size || item.ProductName || ''
  ).trim();
  const pcsRaw =
    item.TotalStonePieces ??
    item.StonePcs ??
    item.StonePieces ??
    item.TotalDiamondPieces ??
    item.DiamondPcs ??
    item.Pieces ??
    item.pieces ??
    '';
  const pcsNum = parseInt(pcsRaw, 10);
  if (!Number.isNaN(pcsNum) && pcsNum > 0 && !/\bpc\b/i.test(base)) {
    return base ? `${base} ${pcsNum}pc` : `${pcsNum}pc`;
  }
  return base;
};

/** Stone weight line on LS000533 stone label (e.g. "1.25pt") */
const resolveLS000533StoneWeightLabel = (item) => {
  const raw = item.TotalStoneWeight ?? item.StoneWt ?? item.stonewt ?? item.StoneWeight ?? '';
  const n = parseFloat(raw);
  if (Number.isNaN(n) || n <= 0) return '';
  const value = Number.isInteger(n) ? String(n) : String(parseFloat(n.toFixed(2)));
  return `${value}pt`;
};

/** Stone weight value for LS000533 stone QR (e.g. "1.25") */
const resolveLS000533StoneWeightQr = (item) => {
  const raw = item.TotalStoneWeight ?? item.StoneWt ?? item.stonewt ?? item.StoneWeight ?? '';
  const n = parseFloat(raw);
  if (Number.isNaN(n) || n <= 0) return '0';
  return String(parseFloat(n.toFixed(2)));
};

/** Diamond weight value for LS000533 QR (e.g. "15.00") */
const resolveLS000533DiamondWeightQr = (item) => {
  const raw =
    item.TotalDiamondWeight ?? item.DiamondWt ?? item.DiamondWeight ?? item.diamondweight ?? '';
  const n = parseFloat(raw);
  if (Number.isNaN(n) || n <= 0) return '0';
  return String(parseFloat(n.toFixed(2)));
};

const resolveLS000533ProductCode = (item) =>
  String(
    item.ProductCode ||
    item.productCode ||
    item.PacketName ||
    item.packet_name ||
    item.ProductName ||
    item.CategoryName ||
    ''
  ).trim();

/** Product name printed on LS000533 and appended to the QR */
const resolveLS000533ProductName = (item) =>
  String(item.ProductName || item.productName || item.CategoryName || '').trim();

const resolveLS000533DesignCode = (item) =>
  String(item.DesignName || item.Design || item.design || item.design_name || '').trim();

/** PWY line on LS000533 stone label — uses Design Name */
const resolveLS000533Pwy = (item) =>
  String(
    item.DesignName || item.Design || item.design || item.design_name || item.DesignId || ''
  ).trim();

/** ASCII EPC memory for LS000533 — dynamic PC + EPC bank, no leading zeros */
const calculateAsciiEpcMemory = (text) => {
  const rawHex = stringToHex(String(text || '').trim());
  return calculateEpcMemory(rawHex);
};

/** Code128B payload: FNC1 (0x0E) + & + item code (matches client sample `&FLX-4P1.5FD`) */
const formatLS000533C128BPayload = (itemCode) => {
  const v = String(itemCode || '').trim();
  return `${String.fromCharCode(14)}&${v}`;
};

/** Hallmark amount for LS000533 label display and QR */
const resolveLS000533HallmarkAmount = (item) =>
  String(
    item?.HallmarkAmount ??
    item?.hallmarkAmount ??
    item?.HallmarkAmt ??
    item?.hallmarkAmt ??
    ''
  ).trim();

/** Code128C payload: FNC1 (0x0E) + apostrophe + numeric pairs from item code */
const formatLS000533C128CPayload = (item) => {
  const itemCode = String(item.ItemCode || item.RFIDCode || '').trim();
  if (!itemCode) return `${String.fromCharCode(14)}'00`;

  // Pure numeric codes use C128C directly
  if (/^\d+$/.test(itemCode)) {
    const digits = itemCode.length % 2 === 0 ? itemCode : `0${itemCode}`;
    return `${String.fromCharCode(14)}'${digits}`;
  }

  // Alphanumeric codes: encode numeric suffix, or full code via C128B-style payload
  const { suffix } = splitItemCodeForBarcode(itemCode);
  if (suffix && /^\d+$/.test(suffix)) {
    const digits = suffix.length % 2 === 0 ? suffix : `0${suffix}`;
    return `${String.fromCharCode(14)}'${digits}`;
  }

  return formatLS000533C128BPayload(itemCode);
};

/** Hallmark amount printed on the LS000533 stone label */
const resolveLS000533HallmarkAmountQr = (item) => {
  const raw = resolveLS000533HallmarkAmount(item);
  if (!raw) return '0';
  const amount = parseFloat(raw);
  if (!Number.isNaN(amount)) {
    return Number.isInteger(amount) ? String(amount) : String(parseFloat(amount.toFixed(2)));
  }
  return raw;
};

const ls000533Pick = (item, keys) => {
  for (const key of keys) {
    const value = item?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }
  return '';
};

/** Skip master ids (107, 216) when the stock row also has the display name. */
const ls000533PickLabel = (item, keys) => {
  let idFallback = '';
  for (const key of keys) {
    const value = item?.[key];
    if (value === undefined || value === null || String(value).trim() === '') continue;
    if (/^-?\d+$/.test(String(value).trim())) {
      if (!idFallback) idFallback = value;
      continue;
    }
    return value;
  }
  return idFallback;
};

/** QR values have no spaces. Fields are joined as value|value. */
const ls000533QrText = (value) => String(value ?? '').replace(/\s+/g, '');

/** Append pt / pc / ct. Keeps an existing suffix and does not add a space. */
const ls000533QrWithUnit = (value, unit) => {
  const text = ls000533QrText(value);
  if (!text) return '';
  if (text.toLowerCase().endsWith(unit)) return text;
  const numeric = text.replace(/,/g, '');
  if (/^-?\d+(\.\d+)?$/.test(numeric)) {
    const n = parseFloat(numeric);
    const shown = Number.isInteger(n) ? String(n) : String(parseFloat(n.toFixed(2)));
    return `${shown}${unit}`;
  }
  return `${text}${unit}`;
};

/**
 * LS000533 QR matches the client sheet order:
 * Bar Code | D. code | Item | Color | Pt | Pcs | Dia wt | Size | Nt Wt
 * Template keys: product_id, Itemcode, product_code, design_id,
 * HallmarkAmount+pt, MRP+pc, diamondweight+ct, description, netwt
 */
const formatLS000533StoneQrPayload = (item) => {
  const barCode = ls000533QrText(
    ls000533PickLabel(item, [
      'ProductName',
      'productName',
      'Product',
      'BarCode',
      'Barcode',
      'product_id',
      'ProductId',
      'ProductID',
    ])
  );
  const itemCode = ls000533QrText(
    ls000533Pick(item, ['Itemcode', 'ItemCode', 'itemCode', 'itemcode'])
  );
  const productCode = ls000533QrText(
    ls000533PickLabel(item, ['product_code', 'ProductCode', 'productCode'])
  );
  const color = ls000533QrText(
    ls000533PickLabel(item, [
      'DesignName',
      'designName',
      'Design',
      'design',
      'Color',
      'design_id',
      'DesignId',
      'designId',
    ])
  );
  const pt = ls000533QrWithUnit(
    ls000533Pick(item, ['HallmarkAmount', 'hallmarkAmount', 'HallmarkAmt', 'hallmarkAmt']),
    'pt'
  );
  const pcs = ls000533QrWithUnit(ls000533Pick(item, ['MRP', 'Mrp', 'mrp']), 'pc');
  const diaWt = ls000533QrWithUnit(
    ls000533Pick(item, [
      'diamondweight',
      'DiamondWeight',
      'DiamondWt',
      'diamondWt',
      'TotalDiamondWeight',
    ]),
    'ct'
  );
  const size = ls000533QrText(
    ls000533Pick(item, ['description', 'Description', 'Size', 'size'])
  );
  const netWt = ls000533QrText(
    ls000533Pick(item, ['netwt', 'NetWt', 'NetWeight', 'netWeight'])
  );

  return [barCode, itemCode, productCode, color, pt, pcs, diaWt, size, netWt].join('|');
};

const resolveLS000533PrnVariant = (item) => {
  const stoneWt = parseFloat(
    item.TotalStoneWeight ?? item.StoneWt ?? item.stonewt ?? item.StoneWeight ?? 0
  );
  const stonePcs = parseInt(
    item.TotalStonePieces ?? item.StonePcs ?? item.StonePieces ?? 0,
    10
  );
  if ((!Number.isNaN(stoneWt) && stoneWt > 0) || (!Number.isNaN(stonePcs) && stonePcs > 0)) {
    return 'stone';
  }
  return 'standard';
};

/** QR payload for LS000533 standard label — same field order as stone QR */
const formatLS000533QrPayload = (item) => formatLS000533StoneQrPayload(item);

/** EPC text for LS000533 stone labels — matches C128C numeric suffix when present. */
const resolveLS000533StoneEpcSource = (item) => {
  const itemCode = String(item.RFIDCode || item.ItemCode || '').trim();
  if (!itemCode) return '';
  if (/^\d+$/.test(itemCode)) return itemCode;

  const { suffix } = splitItemCodeForBarcode(itemCode);
  if (suffix && /^\d+$/.test(suffix)) return suffix;

  return itemCode;
};

/** 48-bit ASCII EPC memory for LS000533 stone labels (same as standard label). */
const resolveLS000533StoneEpcMemory = (item) => {
  const epcSource = resolveLS000533StoneEpcSource(item);
  return calculateAsciiEpcMemory(epcSource);
};

// LS000533 — diamond / fancy label (ENGINE 3941×710, RFID 96-bit EPC, QR + C128B)
const generateLS000533Prn = (item) => {
  const itemCode = String(item.ItemCode || item.RFIDCode || '').trim();
  const barcodeValue = String(item.RFIDCode || item.Barcode || item.BarcodeValue || itemCode).trim();
  const grossWt = formatWeight3(item.GrossWt ?? item.GrossWeight ?? item.grosswt ?? item.TWt);
  const diamondWt = formatDiamondCt(
    item.TotalDiamondWeight ?? item.DiamondWt ?? item.DiamondWeight ?? item.diamondweight
  );
  const purity = prnQuote(resolveLS000533Purity(item));
  const description = prnQuote(resolveLS000533Description(item));
  const designLabel = prnQuote(resolveLS000533DesignLabel(item));
  const productName = prnQuote(resolveLS000533ProductName(item));
  // Full HallmarkAmount text (keep units like PT) — shown to the right of design
  const hallmarkDisplay = prnQuote(resolveLS000533HallmarkAmount(item));
  const qrPayload = prnQuote(formatLS000533QrPayload(item));
  const { epcBits, pcValue, epcHex } = calculateAsciiEpcMemory(itemCode || barcodeValue);
  const c128Payload = formatLS000533C128BPayload(itemCode);

  return `!PTX_SETUP
ENGINE-WIDTH;3941:LENGTH;710:MIRROR;0.
PTX_END
~PAPER;ROTATE 0
~CONFIG
UPC DESCENDERS;0
END
~PAPER;LABELS 2;MEDIA 1
~PAPER;FEED SHIFT 0;INTENSITY 15;SPEED IPS 2;SLEW IPS 2;TYPE 0
~PAPER;CUT 0;PAUSE 0;TEAR 0
~CONFIG
CHECK DYNAMIC BCD;0
SLASH ZERO;0
UPPERCASE;0
AUTO WRAP;0
HOST FORM LENGTH;1
END
~CREATE;FORM-0;51
SCALE;DOT;203;203
ISET;'UTF8'
RFWTAG;16;PC
16;H;${pcValue}
STOP
RFWTAG;${epcBits};EPC
${epcBits};H;*${epcHex}*
STOP
FONT;FACE 92250;BOLD 1;SLANT 0
ALPHA
INV;POINT;116;778;8;9;"${productName}"
STOP
FONT;FACE 92250;BOLD 0;SLANT 0
ALPHA
INV;POINT;90;778;7;8;"Wt :"
INV;POINT;90;728;7;7;"${grossWt}"
INV;POINT;59;780;7;7;"Dw :"
INV;POINT;59;728;7;7;"${diamondWt}"
INV;POINT;24;693;7;7;"${purity}"
INV;POINT;24;780;7;7;"${description}"
STOP
BARCODE
QRCODE;INV;XD2;T2;E0;M0;I0;24;558
"${qrPayload}"
STOP
ALPHA
INV;POINT;119;615;7;7;"${designLabel}"
INV;POINT;119;585;7;7;"${hallmarkDisplay}"
STOP
BARCODE
C128B;INV;XRD1:1:2:2:3:3:4:4;H4.8;49;326
"${c128Payload}"
STOP
END
~EXECUTE;FORM-0;1

~NORMAL
~DELETE FORM;FORM-0
`;
};

// LS000533 — stone label (client sample: QR + C128C + PWY, RFID PC/EPC at bottom)
const generateLS000533StonePrn = (item) => {
  const grossWt = formatWeight3(item.GrossWt ?? item.GrossWeight ?? item.grosswt ?? item.TWt);
  const diamondWt = formatDiamondCtLower(
    item.TotalDiamondWeight ?? item.DiamondWt ?? item.DiamondWeight ?? item.diamondweight
  );
  const purity = prnQuote(resolveLS000533Purity(item));
  const description = prnQuote(resolveLS000533Description(item));
  const stoneWeightLabel = prnQuote(resolveLS000533StoneWeightLabel(item));
  const pwy = prnQuote(resolveLS000533Pwy(item));
  const hallmarkDisplay = prnQuote(resolveLS000533HallmarkAmountQr(item));
  const qrPayload = prnQuote(formatLS000533StoneQrPayload(item));
  const { epcBits, pcValue, epcHex } = resolveLS000533StoneEpcMemory(item);
  const c128Payload = formatLS000533C128CPayload(item);

  return `<xpml><page quantity='0' pitch='18.0 mm'></xpml>!PTX_SETUP
ENGINE-WIDTH;3941:LENGTH;710:MIRROR;0.
PTX_END
~PAPER;ROTATE 0
~CONFIG
UPC DESCENDERS;0
END
~PAPER;LABELS 2;MEDIA 1
~PAPER;FEED SHIFT 0;INTENSITY 15;SPEED IPS 2;SLEW IPS 2;TYPE 0
~PAPER;CUT 0;PAUSE 0;TEAR 0
~CONFIG
CHECK DYNAMIC BCD;0
SLASH ZERO;0
UPPERCASE;0
AUTO WRAP;0
HOST FORM LENGTH;1
END
<xpml></page></xpml><xpml><page quantity='1' pitch='18.0 mm'></xpml>~CREATE;FORM-0;51
SCALE;DOT;203;203
ISET;'UTF8'
FONT;FACE 92250;BOLD 0;SLANT 0
ALPHA
INV;POINT;47;792;7;7;"Dwt :"
INV;POINT;47;741;7;7;"${diamondWt}"
INV;POINT;19;685;6;6;"${purity}"
INV;POINT;19;792;6;6;"${description}"
STOP
BARCODE
QRCODE;INV;XD2;T2;E0;M0;I0;20;555
"${qrPayload}"
STOP
BARCODE
C128C;INV;XRD2:2:4:4:6:6:8:8;H4.8;49;368
"${c128Payload}"
STOP
ALPHA
INV;POINT;80;788;8;9;"Wt :"
INV;POINT;80;748;8;8;"${grossWt}"
INV;POINT;115;788;8;8;"${hallmarkDisplay}"
INV;POINT;115;660;8;8;"${pwy}"
INV;POINT;117;608;8;8;"${stoneWeightLabel}"
STOP
RFWTAG;16;PC
16;H;${pcValue}
STOP
RFWTAG;${epcBits};EPC
${epcBits};H;*${epcHex}*
STOP
END
~EXECUTE;FORM-0;1
<xpml></page></xpml>

~NORMAL
~DELETE FORM;FORM-0
`;
};

const formatWeight2 = (value) => {
  const n = parseFloat(value);
  if (Number.isNaN(n)) return '0.00';
  return n.toFixed(2);
};

/** Melting / purity line on LS000544 label (e.g. "916") */
const resolveLS000544Melting = (item) =>
  String(item.Purity || item.PurityName || item.purity || '').trim();

/** HUID value line on LS000544 — maps from Description (e.g. "AA6754") */
const resolveLS000544HuidValue = (item) =>
  String(
    item.Description ||
    item.description ||
    item.HUIDCode ||
    item.HallmarkAmount ||
    ''
  ).trim();

// LS000544 — mangalsutra label (ENGINE 3941×710, RFID 48-bit EPC, QR)
const generateLS000544Prn = (item) => {
  const itemCode = String(item.ItemCode || item.RFIDCode || '').trim();
  const productName = prnQuote(item.ProductName || item.CategoryName || '');
  const grossWt = prnQuote(formatWeight2(item.GrossWt ?? item.GrossWeight ?? item.grosswt));
  const netWt = prnQuote(formatWeight2(item.NetWt ?? item.netwt));
  const size = prnQuote(String(item.MRP ?? item.Size ?? item.size ?? '').trim());
  const melting = prnQuote(resolveLS000544Melting(item));
  const huidValue = prnQuote(resolveLS000544HuidValue(item));
  const displayCode = prnQuote(itemCode);
  const { epcBits, pcValue, epcHex } = calculateAsciiEpcMemory(itemCode);

  return `!PTX_SETUP
ENGINE-WIDTH;3941:LENGTH;710:MIRROR;0.
PTX_END
~PAPER;ROTATE 0
~CONFIG
UPC DESCENDERS;0
END
~PAPER;LABELS 2;MEDIA 1
~PAPER;FEED SHIFT 0;INTENSITY 15;SPEED IPS 2;SLEW IPS 2;TYPE 0
~PAPER;CUT 0;PAUSE 0;TEAR 0
~CONFIG
CHECK DYNAMIC BCD;0
SLASH ZERO;0
UPPERCASE;0
AUTO WRAP;0
HOST FORM LENGTH;1
END
~CREATE;FORM-0;51
SCALE;DOT;203;203
ISET;'UTF8'
RFWTAG;16;PC
16;H;${pcValue}
STOP
RFWTAG;${epcBits};EPC
${epcBits};H;*${epcHex}*
STOP
FONT;FACE 92250;BOLD 0;SLANT 0
ALPHA
INV;POINT;120;777;7;7;"${productName}"
INV;POINT;97;778;7;8;"Gross wt:"
INV;POINT;76;778;7;8;"Net wt:"
INV;POINT;53;778;7;7;"Size:"
INV;POINT;30;778;7;8;"Melting:"
INV;POINT;97;684;7;8;"${grossWt}"
INV;POINT;76;684;7;7;"${netWt}"
INV;POINT;53;685;7;7;"${size}"
INV;POINT;31;685;7;7;"${melting}"
INV;POINT;8;685;7;8;"${huidValue}"
INV;POINT;8;777;7;7;"HUID:"
STOP
BARCODE
QRCODE;INV;XD4;T2;E0;M0;I0;42;370
"${displayCode}"
STOP
ALPHA
INV;POINT;13;442;7;7;"${displayCode}"
STOP
END
~EXECUTE;FORM-0;1

~NORMAL
~DELETE FORM;FORM-0
`;
};

// Generate PRN for LS000443 - Silver Category (New template)
const generateLS000443SilverPrn = (item) => {
  const itemCode = item.ItemCode || '';
  const barcodeValue = item.BarcodeValue || item.Barcode || itemCode;
  const purityName = item.PurityName || item.Purity || 'SILVER NECKLASE';
  const grossWt = item.GrossWt || item.GrossWeight || '0.610';
  const { epcHex: rawEpcHex } = calculateEpcMemory(stringToHex(barcodeValue));

  // Format barcode: & prefix + alpha prefix + apostrophe + suffix
  const formattedBarcode = (() => {
    const { prefix, suffix } = splitItemCodeForBarcode(barcodeValue);
    if (suffix) return `&${prefix}'${suffix}`;
    return `&${barcodeValue}`;
  })();

  return `!PTX_SETUP
ENGINE-WIDTH;2838:LENGTH;1380:MIRROR;0.
PTX_END
~PAPER;ROTATE 0
~CONFIG
UPC DESCENDERS;0
END
~PAPER;LABELS 2;MEDIA 1
~PAPER;FEED SHIFT 0;INTENSITY 15;SPEED IPS 2;SLEW IPS 2;TYPE 0
~PAPER;CUT 0;PAUSE 0;TEAR 0
~CONFIG
CHECK DYNAMIC BCD;0
SLASH ZERO;0
UPPERCASE;0
AUTO WRAP;0
HOST FORM LENGTH;1
END
~CREATE;FORM-0;99
SCALE;DOT;203;203
ISET;'UTF8'
RFWTAG;16;PC
16;H;*3400*
STOP
RFWTAG;96;EPC
96;H;*${rawEpcHex}*
STOP
FONT;FACE 92250;BOLD 0;SLANT 0
ALPHA
INV;POINT;192;538;7;8;"GWt :"
INV;POINT;192;472;7;7;"${grossWt}"
INV;POINT;218;538;7;7;"${purityName}"
STOP
BARCODE
C128B;INV;XRD1:1:2:2:3:3:4:4;H3.17;81;390
"${barcodeValue}"
STOP
ALPHA
INV;POINT;48;511;7;7;"${itemCode}"
INV;POINT;193;323;7;7;"LASHEEN JEWELLERY"
STOP
END
~EXECUTE;FORM-0;1

~NORMAL
~DELETE FORM;FORM-0
`;
};

// Exact LS000488 baseline PRN ("SanpreetTestDemo") with embedded PCX logo — byte-preserved via base64.
// Only the dynamic fields (RFID memory + item code) are swapped at print time; the logo bytes stay untouched.
const LS000488_BASE_PRN_B64 = "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";

// LS000488 — SanpreetAtwal label with client logo + single item-code field.
// Reuses the exact approved PRN (incl. embedded PCX logo) and swaps only dynamic fields.
const generateLS000488Prn = (item) => {
  const itemCode = String(item.ItemCode || item.RFIDCode || '').trim();
  const displayCode = prnQuote(itemCode);
  const { epcBits, pcValue, epcHex } = calculateAsciiEpcMemory(itemCode);

  let prn = decodeBase64Latin1(LS000488_BASE_PRN_B64);

  // Print a single label (sample file had LABELS 2, which duplicates the form across the web)
  prn = prn.replace('~PAPER;LABELS 2;MEDIA 1', '~PAPER;LABELS 1;MEDIA 1');

  // RFID memory (PC + EPC bank) — sized to the item code, so it adapts to any code length
  prn = prn.replace('16;H;*2C00*', `16;H;${pcValue}`);
  prn = prn.replace('RFWTAG;80;EPC', `RFWTAG;${epcBits};EPC`);
  prn = prn.replace('80;H;*363438312D312D353130*', `${epcBits};H;*${epcHex}*`);

  // Item code field — replace the sample's auto-increment field (`I;...;+0000000001;`)
  // with a plain ALPHA field so the text actually renders on the label
  prn = prn.replace(
    'I;INV;POINT;63;337;8;8;+0000000001;"6481-1-513"',
    `INV;POINT;63;337;8;8;"${displayCode}"`
  );

  return prn;
};

// LS000551 — diamond / fancy label (ENGINE 3941×710, RFID 96-bit EPC, QR + C128B)
const generateLS000551Prn = (item) => {
  const itemCode = String(item.ItemCode || item.RFIDCode || '').trim();
  const barcodeValue = String(item.RFIDCode || item.Barcode || item.BarcodeValue || itemCode).trim();
  const grossWt = formatWeight3(item.GrossWt ?? item.GrossWeight ?? item.grosswt ?? item.TWt);
  const netWt = formatWeight3(item.NetWt ?? item.netwt ?? item.netweight);
  const stoneWt = formatWeight3(item.TotalStoneWeight ?? item.StoneWt ?? item.stonewt ?? item.StoneWeight ?? 0);
  const totalStonePrice = formatWeight3(item.TotalStonePrice ?? item.TotalStoneAmount ?? item.totalstoneamount ?? 0);
  const purity = prnQuote(resolveLS000533Purity(item));
  const designLabel = prnQuote(resolveLS000533DesignLabel(item));
  const { epcBits, pcValue, epcHex } = calculateAsciiEpcMemory(itemCode || barcodeValue);
  return `
!PTX_SETUP
ENGINE-WIDTH;2641:LENGTH;1065:MIRROR;0.
PTX_END
~PAPER;ROTATE 0
~CONFIG
UPC DESCENDERS;0
END
~PAPER;LABELS 2;MEDIA 1;CALIBRATE
~PAPER;FEED SHIFT 0;INTENSITY 15;SPEED IPS 2;SLEW IPS 2;TYPE 0
~PAPER;CUT 0;PAUSE 0;TEAR 0
~CONFIG
CHECK DYNAMIC BCD;0
SLASH ZERO;0
UPPERCASE;0
AUTO WRAP;0
HOST FORM LENGTH;1
END
<xpml></page></xpml><xpml><page quantity='1' pitch='27.0 mm'></xpml>~CREATE;FORM-0;76
SCALE;DOT;203;203
ISET;'UTF8'
RFWTAG;16;PC
16;H;${pcValue}
STOP
RFWTAG;${epcBits};EPC
${epcBits};H;*${epcHex}*
STOP
FONT;FACE 92250;BOLD 0;SLANT 0
ALPHA
INV;POINT;183;192;7;7;"GWT :"
INV;POINT;183;118;7;8;"${grossWt}"
INV;POINT;163;192;7;7;"NWT :"
INV;POINT;163;118;7;7;"${netWt}"
INV;POINT;136;192;7;7;"STN :"
INV;POINT;136;118;7;8;"${stoneWt}"
INV;POINT;116;192;7;7;"TSTN :"
INV;POINT;116;118;7;9;"${totalStonePrice}"
STOP
BARCODE
QRCODE;INV;XD3;T2;E0;M0;I0;28;27
"${itemCode}"
STOP
ALPHA
INV;POINT;72;191;7;7;"${itemCode}"
INV;POINT;41;192;7;7;"${purity}"
INV;POINT;12;192;7;7;"${designLabel}"
STOP
END
~EXECUTE;FORM-0;1
<xpml></page></xpml>
~NORMAL
~DELETE FORM;FORM-0
`;
};

// Main function to generate client-specific PRN
export const generateClientPrn = (item, clientCode) => {
  const rawCode = (clientCode || '').trim().toUpperCase();
  const code = rawCode === '533' ? 'LS000533' : rawCode;
  switch (code) {
    case 'LS000224':
      return generateLS000224Prn(item);
    case 'LS000428':
      return generateLS000428Prn(item);
    case 'LS000431':
      return generateLS000431Prn(item);
    case 'LS000488':
      return generateLS000488Prn(item);
    case 'LS000533':
      return resolveLS000533PrnVariant(item) === 'stone'
        ? generateLS000533StonePrn(item)
        : generateLS000533Prn(item);
    case 'LS000544':
      return generateLS000544Prn(item);
    case 'LS000551':
      return generateLS000551Prn(item);
    case 'LS000606':
      return generateLS000606Prn(item);
    case 'LS000443':
      // Check category for LS000443 - Gold, Silver, or Diamond
      // Also check ProductId for category detection
      const category = item.Category || item.CategoryName || item.ProductId || '';
      const categoryUpper = category.toUpperCase();

      if (categoryUpper === 'GOLD' || categoryUpper.includes('GOLD')) {
        return generateLS000443GoldPrn(item);
      } else if (categoryUpper === 'SILVER' || categoryUpper.includes('SILVER')) {
        return generateLS000443SilverPrn(item);
      } else if (categoryUpper === 'DIAMOND' || categoryUpper.includes('DIAMOND')) {
        return generateLS000443DiamondPrn(item);
      } else {
        throw new Error(`PRN template for client ${code} is only available for Gold, Silver, or Diamond category. Current category: ${category || 'N/A'}`);
      }
    default:
      throw new Error(`PRN template not configured for client code: ${code}`);
  }
};
