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
    expect(prn).toContain('18037 | TNL4P2.25FD');
    expect(prn).toContain('14KT | W | W');
  });

  it('appends product name and description at the end of the QR', () => {
    const prn = generateClientPrn(
      {
        ItemCode: '13016',
        RFIDCode: '13016',
        GrossWt: '3.790',
        HallmarkAmount: 'ZER-5044',
        DesignName: 'RING',
        ProductName: 'GOLD RING',
        Description: '7.25in 155pc',
        Purity: '14KT',
      },
      'LS000533'
    );

    expect(prn).toContain('14KT | GOLD RING | 7.25in 155pc');
  });
});
