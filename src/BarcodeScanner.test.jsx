// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BarcodeScanner from './BarcodeScanner.jsx';
import { lookupProductFromBrowser } from './productLookup.js';

vi.mock('./productLookup.js', () => ({ lookupProductFromBrowser: vi.fn() }));

describe('BarcodeScanner offline lookup', () => {
  beforeEach(() => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    lookupProductFromBrowser.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('attempts lookup while offline so a service-worker cached product can be used', async () => {
    const product = { barcode: '3017620422003', name: 'Cached Nutella', category: 'comfort' };
    const onProduct = vi.fn();
    lookupProductFromBrowser.mockResolvedValue({ found: true, product });
    render(<BarcodeScanner onProduct={onProduct} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'バーコード番号' }), { target: { value: product.barcode } });
    fireEvent.click(screen.getByRole('button', { name: '商品を検索' }));

    await waitFor(() => expect(lookupProductFromBrowser).toHaveBeenCalledWith(
      product.barcode,
      expect.objectContaining({ signal: expect.any(Object) }),
    ));
    expect(await screen.findByText('商品情報を取得しました。')).toBeInTheDocument();
    expect(screen.getByText(product.name)).toBeInTheDocument();
    expect(onProduct).toHaveBeenCalledWith(product);
  });

  it('keeps the barcode and explains manual entry when no offline cache exists', async () => {
    lookupProductFromBrowser.mockRejectedValue(new TypeError('Failed to fetch'));
    render(<BarcodeScanner />);
    const input = screen.getByRole('textbox', { name: 'バーコード番号' });

    fireEvent.change(input, { target: { value: '3017620422003' } });
    fireEvent.click(screen.getByRole('button', { name: '商品を検索' }));

    expect(await screen.findByText('オフラインで保存済みの商品情報が見つかりません。番号を保持して手入力できます。')).toBeInTheDocument();
    expect(input).toHaveValue('3017620422003');
    expect(screen.getByText(/バーコード「3017620422003」は保持されています/)).toBeInTheDocument();
  });
});
