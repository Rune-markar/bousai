// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  it('opens the image chooser from a focusable native button', () => {
    const { container } = render(<BarcodeScanner />);
    const imageButton = screen.getByRole('button', { name: '画像から読み取る' });
    const fileInput = container.querySelector('input[type="file"]');
    const openChooser = vi.spyOn(fileInput, 'click');

    expect(imageButton).toHaveAttribute('type', 'button');
    imageButton.focus();
    expect(imageButton).toHaveFocus();

    fireEvent.click(imageButton);
    expect(openChooser).toHaveBeenCalledOnce();
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

  it('reuses local product and management defaults without copying lot quantity or expiry', async () => {
    const onBarcode = vi.fn();
    const onProduct = vi.fn();
    const localProduct = {
      barcode: '4901234567894',
      name: '端末内の保存水',
      category: 'water',
      waterPurpose: 'drinking-cooking',
      unit: '本',
      tier: 2,
      quantity: 24,
      target: 30,
      price: 148,
      expiry: '2031-04-05',
      packingVolumeMl: 650,
      volumeMl: 500,
      foodWeightG: 0,
      location: '玄関右棚',
      rotationEnabled: false,
      rotationLeadDays: 45,
      replenishmentPriority: 'low',
      replenishBy: '2027-02-03',
      purchaseFrom: '近所のスーパー',
    };
    render(<BarcodeScanner localProducts={[localProduct]} onBarcode={onBarcode} onProduct={onProduct} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'バーコード番号' }), { target: { value: localProduct.barcode } });
    fireEvent.click(screen.getByRole('button', { name: '商品を検索' }));

    expect(await screen.findByText('登録済みの商品情報を端末から読み込みました。')).toBeInTheDocument();
    expect(onBarcode).toHaveBeenCalledWith(localProduct.barcode);
    expect(onProduct).toHaveBeenCalledWith(expect.objectContaining({
      barcode: localProduct.barcode,
      name: localProduct.name,
      category: 'water',
      waterPurpose: 'drinking-cooking',
      unit: '本',
      tier: 2,
      price: 148,
      packingVolumeMl: 650,
      location: '玄関右棚',
      rotationEnabled: false,
      rotationLeadDays: 45,
      replenishmentPriority: 'low',
      replenishBy: '2027-02-03',
      purchaseFrom: '近所のスーパー',
    }));
    const emittedProduct = onProduct.mock.calls[0][0];
    expect(emittedProduct).not.toHaveProperty('quantity');
    expect(emittedProduct).not.toHaveProperty('target');
    expect(emittedProduct).not.toHaveProperty('expiry');
    expect(lookupProductFromBrowser).not.toHaveBeenCalled();
  });

  it('clears a found product and resets the parent as soon as its visible code changes', async () => {
    const onBarcode = vi.fn();
    const onProduct = vi.fn();
    const product = { barcode: '4901234567894', name: '商品A', category: 'food', foodWeightG: 150 };
    render(<BarcodeScanner localProducts={[product]} onBarcode={onBarcode} onProduct={onProduct} />);
    const input = screen.getByRole('textbox', { name: 'バーコード番号' });

    fireEvent.change(input, { target: { value: product.barcode } });
    fireEvent.click(screen.getByRole('button', { name: '商品を検索' }));
    expect(await screen.findByText('商品A')).toBeInTheDocument();
    fireEvent.change(input, { target: { value: '4909876543210' } });

    expect(onBarcode).toHaveBeenLastCalledWith('4909876543210');
    expect(screen.queryByText('商品A')).not.toBeInTheDocument();
    expect(screen.queryByText('登録済みの商品情報を端末から読み込みました。')).not.toBeInTheDocument();
  });

  it('ignores a stale lookup that resolves after the visible code changes', async () => {
    let resolveLookup;
    const staleProduct = { barcode: '4901234567894', name: '遅れて届いた商品A', category: 'food' };
    lookupProductFromBrowser.mockImplementation(() => new Promise((resolve) => { resolveLookup = resolve; }));
    const onBarcode = vi.fn();
    const onProduct = vi.fn();
    render(<BarcodeScanner onBarcode={onBarcode} onProduct={onProduct} />);
    const input = screen.getByRole('textbox', { name: 'バーコード番号' });

    fireEvent.change(input, { target: { value: staleProduct.barcode } });
    fireEvent.click(screen.getByRole('button', { name: '商品を検索' }));
    await waitFor(() => expect(lookupProductFromBrowser).toHaveBeenCalledOnce());
    fireEvent.change(input, { target: { value: '4909876543210' } });
    await act(async () => {
      resolveLookup({ found: true, product: staleProduct });
      await Promise.resolve();
    });

    expect(onBarcode).toHaveBeenLastCalledWith('4909876543210');
    expect(input).toHaveValue('4909876543210');
    expect(onProduct).not.toHaveBeenCalled();
    expect(screen.queryByText('遅れて届いた商品A')).not.toBeInTheDocument();
    expect(screen.queryByText('商品情報を取得しました。')).not.toBeInTheDocument();
  });
});
