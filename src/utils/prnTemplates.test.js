import {
  applyLS000728DynamicTemplate,
  generateClientPrn,
  prnBytesToString,
} from './prnTemplates';

describe('LS000728 PRN template', () => {
  it('removes the UTF-8 BOM and substitutes label and EPC values', () => {
    const bytes = require('fs').readFileSync('public/SMPUKLabel.prn');
    const template = prnBytesToString(new Uint8Array(bytes));
    const prn = applyLS000728DynamicTemplate(template, {
      ItemCode: 'AB1234',
      GrossWt: '5.25',
      TotalDiamondWeight: '0.125',
    });

    expect(prn.startsWith('^XA')).toBe(true);
    expect(prn).toContain('^FDLA,AB1234^FS');
    expect(prn).toContain('^FDAB1234^FS');
    expect(prn).toContain('^FD5.25^FS');
    expect(prn).toContain('^FD0.125^FS');
    expect(prn).toContain('^FD414231323334^FS');
    expect(prn).not.toContain('SM001');
    expect(prn).not.toContain('^FD534d303031^FS');
  });
});

describe('LS000606 PRN generation', () => {
  const baseItem = {
    ItemCode: 'NSPY1064',
    Category: 'Gold',
    CategoryName: 'GOLD',
    DesignName: 'G DORLE',
    ProductName: 'AASHIRWAD ALANKAR',
    GrossWt: '27.220',
    NetWt: '27.220',
    TotalStoneWeight: '0.00',
    MRP: '15',
    PurityName: '916',
  };

  it('generates a gold label PRN for LS000606', () => {
    const prn = generateClientPrn(baseItem, 'LS000606');

    expect(prn).toContain('RFWTAG;64;EPC');
    expect(prn).toContain('16;H;*2000*');
    expect(prn).toContain('*4E53505931303634*');
    expect(prn).toContain('G DORLE');
    expect(prn).toContain('AASHIRWAD ALANKAR');
    expect(prn).toContain('15/-');
    expect(prn).toContain('NSPY1064');
  });

  it('generates a silver label PRN for LS000606', () => {
    const prn = generateClientPrn(
      {
        ...baseItem,
        ItemCode: 'NDOR0059',
        Category: 'Silver',
        CategoryName: 'SILVER',
        DesignName: 'S PAYAL',
        PurityName: '916 HM',
      },
      'LS000606'
    );

    expect(prn).toContain('RFWTAG;64;EPC');
    expect(prn).toContain('16;H;*2000*');
    expect(prn).toContain('*4E444F5230303539*');
    expect(prn).toContain('S PAYAL');
    expect(prn).toContain('916 HM');
  });

  it.each(['SJ126', 'SJ001234', 'SJ25', 'S34'])(
    'supports varied alphanumeric item codes: %s',
    (itemCode) => {
      const prn = generateClientPrn({ ...baseItem, ItemCode: itemCode }, 'LS000606');

      expect(prn).toContain(`"${itemCode}"`);
      expect(prn).toMatch(/RFWTAG;\d+;EPC/);
      expect(prn).toMatch(/C128B;INV;[^\n]+\n"[^"]+"/);
      expect(prn).not.toContain("''");
    }
  );
});

describe('LS000533 PRN generation', () => {
  it('writes 48-bit stone EPC for item 3016', () => {
    const prn = generateClientPrn(
      {
        ItemCode: '3016',
        RFIDCode: '3016',
        GrossWt: '6.630',
        TotalStoneWeight: '6',
        TotalStonePieces: 65,
        Purity: '14KT',
      },
      'LS000533'
    );

    expect(prn).toContain('RFWTAG;48;EPC');
    expect(prn).toContain('16;H;*1800*');
    expect(prn).toContain('*000033303136*');
    expect(prn).not.toContain('RFWTAG;80;EPC');
    expect(prn).not.toContain('*2800*');
  });

  it('writes 48-bit standard EPC for item 13016', () => {
    const prn = generateClientPrn(
      {
        ItemCode: '13016',
        RFIDCode: '13016',
        GrossWt: '3.790',
        HallmarkAmount: 'ZER-5044',
        Purity: '14KT',
      },
      'LS000533'
    );

    expect(prn).toContain('RFWTAG;48;EPC');
    expect(prn).toContain('16;H;*1800*');
    expect(prn).toContain('*003133303136*');
  });

  it('writes 48-bit stone EPC for item 18037', () => {
    const prn = generateClientPrn(
      {
        ItemCode: '18037',
        RFIDCode: '18037',
        GrossWt: '14.400',
        TotalStoneWeight: '9.02',
        TotalStonePieces: 186,
        HallmarkAmount: 'TNL4P2.25FD',
        DesignName: 'TENNIS NECKLACE',
        ProductName: 'W',
        Purity: '14KT',
      },
      'LS000533'
    );

    expect(prn).toContain('RFWTAG;48;EPC');
    expect(prn).toContain('16;H;*1800*');
    expect(prn).toContain('*003138303337*');
    expect(prn).toContain('W|18037||TENNISNECKLACE|TNL4P2.25FDpt||||');
  });

  it('uses stock-list names instead of product and design ids', () => {
    const prn = generateClientPrn(
      {
        ProductId: 107,
        ProductName: 'TNLCR1.5HD',
        ItemCode: '18001',
        ProductCode: 'TENNIS NECKLACE',
        DesignId: 216,
        DesignName: 'Y',
        HallmarkAmount: '1.5pt',
        MRP: '1',
        DiamondWt: '1.680',
        Description: '18in 107pc',
        NetWt: '10.710',
      },
      'LS000533'
    );

    expect(prn).toContain('TNLCR1.5HD|18001|TENNISNECKLACE|Y|1.5pt|1pc|1.68ct|18in107pc|10.710');
    expect(prn).not.toContain('|107|');
    expect(prn).not.toContain('|216|');
  });

  it('builds the client sheet QR with pt, pc, and ct and no spaces', () => {
    const prn = generateClientPrn(
      {
        product_id: 'TNLCR1.5',
        Itemcode: '18001',
        product_code: 'TENNIS N',
        design_id: 'Y',
        HallmarkAmount: '1.5',
        MRP: '1',
        diamondweight: '1.68',
        description: '18in 107pc',
        netwt: '10.710',
      },
      'LS000533'
    );

    expect(prn).toContain('TNLCR1.5|18001|TENNISN|Y|1.5pt|1pc|1.68ct|18in107pc|10.710');
  });
});

describe('LS000677 PRN generation', () => {
  const sampleItem = {
    ItemCode: 'MP-00413',
    ProductName: 'DESIRE',
    ProductCode: 'P',
    CategoryName: 'STK',
    DesignName: '228324',
    PurityName: '14KT',
    Size: 'A',
    GrossWt: '1.010',
    NetWt: '0.960',
    DiamondWt: '0.001',
    TotalDiamondWeight: '0.620',
    TotalDiamondPieces: 46,
    TotalStoneWeight: '0.001',
    HallmarkAmount: '613464',
    HUIDCode: 'SHOULD-NOT-PRINT',
  };

  it('reproduces the updated Oswal sample label and keeps the logo bytes', () => {
    const prn = generateClientPrn(sampleItem, 'LS000677');
    const file = require('fs').readFileSync('public/Oswal_changed_new.prn');
    const original = Array.from(file, (byte) => String.fromCharCode(byte)).join('');
    const logoStart = original.indexOf('~LOGO;LOGO-0;PCX');
    const logoEnd = original.indexOf('~RASTEREND') + '~RASTEREND'.length;

    expect(prn.slice(logoStart, logoEnd)).toBe(original.slice(logoStart, logoEnd));
    expect(prn).toContain('15;426;LOGO-0');
    expect(prn).toContain('~DELETE LOGO;LOGO-0');
    expect(prn).toContain('RFWTAG;64;EPC');
    expect(prn).toContain('16;H;*2000*');
    expect(prn).toContain('*4D502D3030343133*');
    expect(prn).toContain('"1.010"');
    expect(prn).toContain('"0.960"');
    expect(prn).toContain('INV;POINT;93;647;7;7;"14KT:"');
    expect(prn).toContain('INV;POINT;93;594;7;7;""');
    expect(prn).toContain('INV;POINT;93;502;7;7;""');
    expect(prn).toContain('"46/0.620"');
    expect(prn).toContain('"DESIRE"');
    expect(prn).toContain('"STK"');
    expect(prn).toContain('"(A)"');
    expect(prn).not.toContain('"P"');
    expect(prn).not.toContain('"228324"');
    expect(prn).toContain('"613464"');
    expect(prn).toContain('"MP-00413"');
    expect(prn).not.toContain('SHOULD-NOT-PRINT');
    expect(prn.match(/"MP-00413"/g)).toHaveLength(1);
  });

  it('fills another item without leaving the sample values', () => {
    const prn = generateClientPrn(
      {
        ItemCode: 'MP-00999',
        ProductName: 'CUBAN',
        ProductCode: 'RG',
        CategoryName: 'GOLD',
        DesignName: '1001',
        PurityName: '18KT',
        Size: 'B',
        GrossWt: '2.5',
        NetWt: '2.1',
        TotalDiamondWeight: '0.25',
        TotalDiamondPieces: 12,
        TotalStoneWeight: '0.05',
        HallmarkAmount: '999111',
      },
      'LS000677'
    );

    expect(prn).toContain('"MP-00999"');
    expect(prn).toContain('"CUBAN"');
    expect(prn).toContain('"GOLD"');
    expect(prn).toContain('INV;POINT;93;647;7;7;"18KT:"');
    expect(prn).toContain('INV;POINT;93;594;7;7;""');
    expect(prn).toContain('INV;POINT;93;502;7;7;""');
    expect(prn).not.toContain('"RG"');
    expect(prn).not.toContain('"1001"');
    expect(prn).toContain('"18KT:"');
    expect(prn).toContain('"(B)"');
    expect(prn).toContain('"2.500"');
    expect(prn).toContain('"2.100"');
    expect(prn).toContain('"0.250"');
    expect(prn).toContain('"0.050"');
    expect(prn).toContain('"12/0.250"');
    expect(prn).toContain('"999111"');
    expect(prn).toContain('*4D502D3030393939*');
    expect(prn).not.toContain('MP-00413');
    expect(prn).not.toContain('613464');
    expect(prn).not.toContain('DESIRE');
    expect(prn.match(/"MP-00999"/g)).toHaveLength(1);
  });

  it('pads a 4-character item code to the 48-bit EPC minimum', () => {
    const prn = generateClientPrn({ ItemCode: 'GL31' }, 'LS000677');

    expect(prn).toContain('16;H;*1800*');
    expect(prn).toContain('RFWTAG;48;EPC');
    expect(prn).toContain('48;H;*0000474C3331*');
    expect(prn).not.toContain('RFWTAG;32;EPC');
  });
});

describe('LS000680 PRN generation', () => {
  it('matches the client diamond label for SFRI322', () => {
    const prn = generateClientPrn(
      {
        ItemCode: 'SFRI322',
        ProductName: 'DIAMOND NOSE PIN',
        GrossWt: '5.080',
        NetWt: '0.446',
        TotalDiamondWeight: '0.12',
        TotalDiamondPieces: 6,
        DiamondColour: 'E-F',
        DiamondClarity: 'VVS',
        MRP: '120000',
        PurityName: 'T925',
        DesignName: 'VJDD',
        MakingPercentage: '20',
        MakingFixedAmt: '1000',
      },
      'LS000680'
    );

    expect(prn).toContain('~PAPER;LABELS 2;MEDIA 0');
    expect(prn).toContain('~PAPER;INTENSITY 0;SPEED IPS 2;SLEW IPS 2;TYPE 0');
    expect(prn).toContain('RFWTAG;64;EPC');
    expect(prn).toContain('16;H;*2400*');
    expect(prn).toContain('*53465249333232*');
    expect(prn).toContain('"DIAMOND NOSE PIN"');
    expect(prn).toContain('"5.080"');
    expect(prn).toContain('"0.12 cts\\"');
    expect(prn).toContain('"0.446"');
    expect(prn).toContain('"6 \\"');
    expect(prn).toContain('"E-F \\"');
    expect(prn).toContain('"120000"');
    expect(prn).toContain('"VVS"');
    expect(prn).toContain('"T925 \\"');
    expect(prn).toContain('"VJDD"');
    expect(prn).toContain('"SFRI322"');
    expect(prn).toContain('"%.20.00"');
    expect(prn).toContain('"1000"');
    expect(prn).toContain(`${String.fromCharCode(14)}&SFRI322`);
    expect(prn).not.toContain("SFRI'322");
  });
});

describe('LS000726 PRN generation', () => {
  it('fills the Diamour label from the stock columns', () => {
    const prn = generateClientPrn(
      {
        ItemCode: 'DM0001',
        ProductCode: 'DA-34',
        DiamondWt: '4',
        DiamondColour: 'E',
        DiamondClarity: 'VVS2',
        DiamondCertificate: 'LG7000786434',
        PurityName: 'PT-950',
        StoneWt: '0.05',
        MRP: '4000',
      },
      'LS000726'
    );

    expect(prn).toContain('^PW791');
    expect(prn).toContain('^LL484');
    expect(prn).toContain('^FT538,223^A0N,29,28^FH\\^CI28^FDDM0001^FS^CI27');
    expect(prn).toContain('^FT642,223^A0N,29,28^FH\\^CI28^FDDA-34^FS^CI27');
    expect(prn).toContain('^FT538,259^A0N,29,28^FH\\^CI28^FD4.00ct^FS^CI27');
    expect(prn).toContain('^FT642,259^A0N,29,28^FH\\^CI28^FDE-VVS2^FS^CI27');
    expect(prn).toContain('^FT538,298^A0N,29,28^FH\\^CI28^FDLG7000786434^FS^CI27');
    expect(prn).toContain('^FT547,376^A0N,29,28^FH\\^CI28^FDPT-950^FS^CI27');
    expect(prn).toContain('^FT545,416^A0N,29,28^FH\\^CI28^FDS/D^FS^CI27');
    expect(prn).toContain('^FT597,416^A0N,29,28^FH\\^CI28^FD0.05 ct^FS^CI27');
    expect(prn).toContain(`^FT544,452^A0N,29,28^FH\\^CI28^FD${'\u00C2\u00A3'} 4000.00^FS^CI27`);
    expect(prn).toContain('^RFW,H,1,2,1^FD2000^FS');
    expect(prn).toContain('^RFW,H,2,8,1^FD0000444d30303031^FS');
  });

  it('uses the centre diamond row and pads a short item code to 48 bits', () => {
    const prn = generateClientPrn(
      {
        ItemCode: 'DM001',
        DesignName: 'DA-48',
        PurityName: 'Pt-950',
        MRP: '4000.5',
        Diamonds: [
          {
            DiamondWeight: '4.02',
            DiamondColour: 'E',
            DiamondClarity: 'VVS2',
            DiamondCertificate: 'LG799607688',
          },
          { DiamondWeight: '0.5' },
        ],
      },
      'LS000726'
    );

    expect(prn).toContain('^FDDM001^FS');
    expect(prn).toContain('^FDDA-48^FS');
    expect(prn).toContain('^FD4.02ct^FS');
    expect(prn).toContain('^FDE-VVS2^FS');
    expect(prn).toContain('^FDLG799607688^FS');
    expect(prn).toContain('^FDPt-950^FS');
    expect(prn).toContain('^FD0.50 ct^FS');
    expect(prn).toContain(`${'\u00C2\u00A3'} 4000.50`);
    expect(prn).toContain('^RFW,H,1,2,1^FD1800^FS');
    expect(prn).toContain('^RFW,H,2,6,1^FD00444d303031^FS');
  });

  it('pads DM01 and DM0002 so the EPC starts with 00', () => {
    const shortCode = generateClientPrn({ ItemCode: 'DM01' }, 'LS000726');
    const exactCode = generateClientPrn({ ItemCode: 'DM0002' }, 'LS000726');

    expect(shortCode).toContain('^RFW,H,1,2,1^FD1800^FS');
    expect(shortCode).toContain('^RFW,H,2,6,1^FD0000444d3031^FS');
    expect(shortCode).not.toContain('^FD1000^FS');

    expect(exactCode).toContain('^RFW,H,1,2,1^FD2000^FS');
    expect(exactCode).toContain('^RFW,H,2,8,1^FD0000444d30303032^FS');
    expect(exactCode).not.toContain('^FD444d30303032^FS');
  });
});

describe('LS000736 PRN generation', () => {
  it('matches the Amira sample label for NS-001A', () => {
    const prn = generateClientPrn(
      {
        Itemcode: 'NS-001A',
        PurityName: '22KT',
        grosswt: '200',
        netwt: '200.00',
        stonewt: '100',
        diamondweight: '100',
        description: '100',
        product_code: '100',
        product_id: '999999',
        HallmarkAmount: '500',
        design_id: '100',
        MRP: '100',
      },
      'LS000736'
    );

    expect(prn).toContain('ENGINE-WIDTH;3941:LENGTH;710:MIRROR;0.');
    expect(prn).toContain('~PAPER;LABELS 2;MEDIA 1');
    expect(prn).toContain('~PAPER;FEED SHIFT 0;INTENSITY 15;SPEED IPS 2;SLEW IPS 2;TYPE 0');
    expect(prn).toContain('RFWTAG;64;EPC');
    expect(prn).toContain('16;H;*2400*');
    expect(prn).toContain('*4E532D30303141*');
    expect(prn).toContain('INV;POINT;124;789;7;7;"NS-001A"');
    expect(prn).toContain('INV;POINT;124;697;7;7;"22KT"');
    expect(prn).toContain('INV;POINT;97;789;7;7;"G.WT -"');
    expect(prn).toContain('INV;POINT;98;702;7;7;"200.00"');
    expect(prn).toContain('INV;POINT;75;702;7;7;"200.00"');
    expect(prn).toContain('INV;POINT;53;789;7;7;"D.WT -"');
    expect(prn).toContain('INV;POINT;53;704;7;7;"100.00"');
    expect(prn).toContain('INV;POINT;31;789;7;7;"FWT -"');
    expect(prn).toContain('INV;POINT;31;704;7;7;"100.00"');
    expect(prn).toContain('INV;POINT;8;788;7;7;"C.ST.WT -"');
    expect(prn).toContain('INV;POINT;9;704;7;7;"100.00"');
    expect(prn).toContain('INV;POINT;110;518;7;7;"Pot WT -"');
    expect(prn).toContain('INV;POINT;111;431;7;7;"100.00"');
    expect(prn).toContain('INV;POINT;86;518;7;7;"Moti WT -"');
    expect(prn).toContain('INV;POINT;87;431;7;7;"100.00"');
    expect(prn).toContain('INV;POINT;65;520;7;7;"Jadai -"');
    expect(prn).toContain('INV;POINT;65;409;7;7;"500"');
    expect(prn).toContain('INV;POINT;41;520;7;7;"Wax WT -"');
    expect(prn).toContain('INV;POINT;41;429;7;7;"100.00"');
    expect(prn).toContain('INV;POINT;16;519;7;7;"Extra -"');
    expect(prn).toContain('INV;POINT;16;433;7;7;"999999"');
    expect(prn).toContain('"gms"');
    expect(prn).toContain('"cts"');
    expect(prn).toContain('"pcs"');
    expect(prn).toContain('"Rs"');
  });

  it('reads the labelled-stock names for the mapped columns and ignores stone rows', () => {
    const prn = generateClientPrn(
      {
        ItemCode: 'AM12',
        PurityName: '18KT',
        GrossWt: '12.5',
        NetWt: '8.2',
        DiamondWt: '1.25',
        StoneWt: '3.2',
        Description: '0.8',
        ProductCode: '2.5',
        ProductName: '1500',
        HallmarkAmount: '40',
        DesignName: '1.1',
        MRP: '0.4',
        Stones: [{ StoneName: 'Ruby', StoneWeight: '99', StonePieces: 8 }],
      },
      'LS000736'
    );

    expect(prn).toContain('RFWTAG;48;EPC');
    expect(prn).toContain('16;H;*1C00*');
    expect(prn).toContain('*414D3132*');
    expect(prn).toContain('"AM12"');
    expect(prn).toContain('"18KT"');
    expect(prn).toContain('"12.50"');
    expect(prn).toContain('"8.20"');
    expect(prn).toContain('"1.25"');
    expect(prn).toContain('"0.80"');
    expect(prn).toContain('"3.20"');
    expect(prn).toContain('"2.50"');
    expect(prn).toContain('"0.40"');
    expect(prn).toContain('"1.10"');
    expect(prn).toContain('"40"');
    expect(prn).toContain('"1500"');
    expect(prn).not.toContain('NS-001A');
    expect(prn).not.toContain('22KT');
    expect(prn).not.toContain('999999');
    expect(prn).not.toContain('"99.00"');
  });

  it('uses the saved column when the list field is only a zero default', () => {
    const prn = generateClientPrn(
      {
        ItemCode: 'ER0157',
        PurityName: '22KT',
        GrossWt: '42.46',
        NetWt: '31.76',
        Description: '0',
        ProductCode: '0',
        ProductName: '0',
        DesignName: '0',
        HallmarkAmount: 0,
        MRP: 0,
        description: '1.20',
        product_code: '2.50',
        product_id: '999999',
        design_id: '3.25',
        hallmarkAmount: '40',
        mrp: '100',
      },
      'LS000736'
    );

    expect(prn).toContain('"ER0157"');
    expect(prn).toContain('"42.46"');
    expect(prn).toContain('"31.76"');
    expect(prn).toContain('INV;POINT;31;704;7;7;"1.20"');
    expect(prn).toContain('INV;POINT;87;431;7;7;"2.50"');
    expect(prn).toContain('INV;POINT;111;431;7;7;"100.00"');
    expect(prn).toContain('INV;POINT;41;429;7;7;"3.25"');
    expect(prn).toContain('INV;POINT;65;409;7;7;"40"');
    expect(prn).toContain('INV;POINT;16;433;7;7;"999999"');
  });
});
