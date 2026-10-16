import { quoteDescriptionLines, quotePricingSubtotal, quoteEditorLines, quoteEditorError } from "./quote-pricing";

describe("Quote pricing layouts", () => {
  const validTotal = () => ({ hasClient: true, title: 'Pump repair', mode: 'TOTAL_PRICE' as const,
    lines: quoteEditorLines('TOTAL_PRICE', [], '', 'Repair pump\nTest installation'), totalPrice: 100, taxPercent: 13 });

  it('saves scope-only total-price quotes without validating hidden itemized fields', () => {
    const lines = quoteEditorLines('TOTAL_PRICE', [{ description: '', quantity: 0, unit: '', rate: -1 }], '', 'Repair pump\nTest installation');
    expect(lines).toEqual([{ description: 'Repair pump', quantity: 1, unit: '', rate: 0 }, { description: 'Test installation', quantity: 1, unit: '', rate: 0 }]);
    expect(quoteEditorError({ ...validTotal(), lines })).toBe('');
  });

  it('uses explicit description lines when supplied instead of duplicating the scope', () => {
    expect(quoteEditorLines('TOTAL_PRICE', [], ' Supply parts \n Install parts ', 'Other scope')).toEqual([
      { description: 'Supply parts', quantity: 1, unit: '', rate: 0 },
      { description: 'Install parts', quantity: 1, unit: '', rate: 0 },
    ]);
  });

  it('identifies the actual missing client, title or description', () => {
    expect(quoteEditorError({ ...validTotal(), hasClient: false })).toBe('Select a client or enter a one-time client name.');
    expect(quoteEditorError({ ...validTotal(), title: ' ' })).toBe('Enter a quote title.');
    expect(quoteEditorError({ ...validTotal(), lines: [] })).toBe('Enter the Description (Scope of Work) or add work descriptions.');
  });

  it('requires a valid total while permitting a zero-price quote', () => {
    expect(quoteEditorError({ ...validTotal(), totalPrice: null })).toBe('Enter a valid total price before tax.');
    expect(quoteEditorError({ ...validTotal(), totalPrice: NaN })).toBe('Enter a valid total price before tax.');
    expect(quoteEditorError({ ...validTotal(), totalPrice: -1 })).toBe('Enter a valid total price before tax.');
    expect(quoteEditorError({ ...validTotal(), totalPrice: 0 })).toBe('');
  });

  it('retains itemized validation and does not substitute the scope for blank pricing items', () => {
    const lines = quoteEditorLines('ITEMIZED', [{ description: '', quantity: 1, unit: 'each', rate: 10 }], '', 'Scope');
    expect(quoteEditorError({ ...validTotal(), mode: 'ITEMIZED', lines })).toBe('Enter a description for item 1.');
    expect(quoteEditorError({ ...validTotal(), mode: 'ITEMIZED', lines: [{ description: 'Item', quantity: 0, unit: '', rate: 1 }] })).toBe('Enter a quantity of at least 0.01 for item 1.');
  });

  it('reports oversized descriptions and invalid tax rates before sending a request', () => {
    expect(quoteEditorError({ ...validTotal(), lines: [{ description: 'a'.repeat(4001), quantity: 1, unit: '', rate: 0 }] })).toBe('Shorten description 1 to 4000 characters or fewer.');
    expect(quoteEditorError({ ...validTotal(), taxPercent: 101 })).toBe('Enter an HST rate between 0 and 100%.');
  });
  it("normalizes mobile and desktop description lines without empty items", () => {
    expect(
      quoteDescriptionLines(" Repair pump\r\n\r\n Test installation \n"),
    ).toEqual(["Repair pump", "Test installation"]);
    expect(quoteDescriptionLines(" \n ")).toEqual([]);
  });

  it("uses the single total without adding internal line prices", () => {
    expect(
      quotePricingSubtotal("TOTAL_PRICE", [{ quantity: 9, rate: 99 }], 1000),
    ).toBe(1000);
    expect(quotePricingSubtotal("TOTAL_PRICE", [], 0)).toBe(0);
  });

  it("rounds each item before summing to match backend line totals", () => {
    expect(
      quotePricingSubtotal(
        "ITEMIZED",
        [
          { quantity: 0.33, rate: 0.1 },
          { quantity: 0.33, rate: 0.1 },
        ],
        1000,
      ),
    ).toBeCloseTo(0.06, 2);
    expect(
      quotePricingSubtotal(
        "ITEMIZED",
        [
          { quantity: 2, rate: 25 },
          { quantity: 1, rate: 5 },
        ],
        0,
      ),
    ).toBe(55);
  });
});
