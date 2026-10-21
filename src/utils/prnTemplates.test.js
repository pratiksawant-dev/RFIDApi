import { generateClientPrn } from './prnTemplates';

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

  it('reproduces the Oswal sample label and keeps the logo bytes', () => {
    const prn = generateClientPrn(sampleItem, 'LS000677');
    const file = require('fs').readFileSync('public/Oswal_Jwellers.prn');
    const original = Array.from(file, (byte) => String.fromCharCode(byte)).join('');
    const logoStart = original.indexOf('~LOGO;LOGO-0;PCX');
    const logoEnd = original.indexOf('~RASTEREND') + '~RASTEREND'.length;

    expect(prn.slice(logoStart, logoEnd)).toBe(original.slice(logoStart, logoEnd));
    expect(prn).toContain('15;426;LOGO-0');
    expect(prn).toContain('~DELETE LOGO;LOGO-0');
    expect(prn).toContain('RFWTAG;64;EPC');
    expect(prn).toContain('16;H;*2400*');
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
