import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Camera, Check, ImageUp, Keyboard, LoaderCircle, ScanBarcode, Square } from 'lucide-react';
import { lookupProductFromBrowser } from './productLookup.js';

const digitsOnly = (value) => String(value || '').replace(/[^0-9]/g, '');
const createReader = async (options) => {
  const { BrowserMultiFormatReader } = await import('@zxing/browser');
  return new BrowserMultiFormatReader(undefined, options);
};

export default function BarcodeScanner({ initialProduct = null, localProducts = [], onBarcode, onProduct }) {
  const [manualCode, setManualCode] = useState(initialProduct?.barcode || '');
  const [status, setStatus] = useState(initialProduct ? 'found' : 'idle');
  const [message, setMessage] = useState(initialProduct ? '登録済みの商品情報です。' : '');
  const [product, setProduct] = useState(initialProduct);
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef(null);
  const imageInputRef = useRef(null);
  const controlsRef = useRef(null);
  const requestRef = useRef(null);
  const foundRef = useRef(false);

  const stopCamera = () => {
    controlsRef.current?.stop?.();
    controlsRef.current = null;
    const stream = videoRef.current?.srcObject;
    stream?.getTracks?.().forEach((track) => track.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
  };

  useEffect(() => () => {
    requestRef.current?.abort();
    stopCamera();
  }, []);

  const lookup = async (rawCode) => {
    requestRef.current?.abort();
    const code = digitsOnly(rawCode);
    setManualCode(code);
    onBarcode?.(code);
    if (!code) {
      setStatus('idle');
      setMessage('');
      setProduct(null);
      return;
    }
    setStatus('loading');
    setMessage('商品情報を照会しています…');
    setProduct(null);
    const local = localProducts.find((item) => item.barcode === code);
    if (local) {
      // Reuse product and replenishment defaults, but never copy the quantity or
      // expiry of an existing lot into the new lot being registered.
      const localProduct = {
        barcode: code,
        name: local.name,
        brand: local.brand,
        packageSize: local.packageSize,
        volumeMl: local.volumeMl,
        foodWeightG: local.foodWeightG,
        packingVolumeMl: local.packingVolumeMl,
        category: local.category,
        waterPurpose: local.waterPurpose,
        unit: local.unit,
        tier: local.tier,
        price: local.price,
        location: local.location,
        rotationEnabled: local.rotationEnabled,
        rotationLeadDays: local.rotationLeadDays,
        replenishmentPriority: local.replenishmentPriority,
        replenishBy: local.replenishBy,
        purchaseFrom: local.purchaseFrom,
        imageUrl: local.imageUrl,
        source: local.source || '端末内の商品',
        sourceUrl: local.sourceUrl,
      };
      setProduct(localProduct);
      setStatus('found');
      setMessage('登録済みの商品情報を端末から読み込みました。');
      onProduct?.(localProduct);
      return;
    }
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const result = await lookupProductFromBrowser(code, { signal: controller.signal });
      // Some lookup adapters can resolve even after AbortController.abort().
      // Apply a response only while it still belongs to the visible code.
      if (controller.signal.aborted || requestRef.current !== controller) return;
      if (!result.found) {
        setStatus('not-found');
        setMessage(result.message || '商品が見つかりませんでした。');
        return;
      }
      setProduct(result.product);
      setStatus('found');
      setMessage('商品情報を取得しました。');
      onProduct?.(result.product);
    } catch (error) {
      if (error?.name === 'AbortError' || controller.signal.aborted || requestRef.current !== controller) return;
      const offline = !navigator.onLine;
      setStatus(offline ? 'not-found' : 'error');
      setMessage(offline
        ? 'オフラインで保存済みの商品情報が見つかりません。番号を保持して手入力できます。'
        : error?.message || '商品情報サービスへ接続できませんでした。');
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
    }
  };

  const changeManualCode = (value) => {
    const code = digitsOnly(value);
    requestRef.current?.abort();
    requestRef.current = null;
    setManualCode(code);
    setProduct(null);
    setStatus('idle');
    setMessage('');
    // The visible code and parent form must never describe different products.
    // Reset the parent identity immediately; a successful search will then add
    // canonical product fields back through onProduct.
    onBarcode?.(code);
  };

  const acceptDetectedCode = (code) => {
    if (foundRef.current) return;
    foundRef.current = true;
    stopCamera();
    lookup(code);
  };

  const startCamera = async () => {
    stopCamera();
    foundRef.current = false;
    setStatus('scanning');
    setMessage('バーコードを枠の中央に合わせてください。');
    setCameraActive(true);
    try {
      const reader = await createReader({ delayBetweenScanAttempts: 250, delayBetweenScanSuccess: 1000 });
      controlsRef.current = await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
        videoRef.current,
        (result) => result && acceptDetectedCode(result.getText()),
      );
    } catch (error) {
      stopCamera();
      setStatus('error');
      setMessage(error?.name === 'NotAllowedError' ? 'カメラの使用が許可されていません。番号入力または画像読込をお使いください。' : 'カメラを起動できませんでした。番号入力または画像読込をお使いください。');
    }
  };

  const readImage = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    stopCamera();
    foundRef.current = false;
    setStatus('scanning');
    setMessage('画像内のバーコードを解析しています…');
    const url = URL.createObjectURL(file);
    try {
      const reader = await createReader();
      const result = await reader.decodeFromImageUrl(url);
      acceptDetectedCode(result.getText());
    } catch {
      setStatus('error');
      setMessage('画像からバーコードを読み取れませんでした。明るく、正面から撮った画像をお試しください。');
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  return <section className="barcode-box">
    <div className="barcode-heading"><span><ScanBarcode />バーコードから商品を入力</span><small>JAN / EAN / UPC</small></div>
    {cameraActive && <div className="camera-preview"><video ref={videoRef} muted playsInline /><div className="scan-frame"><span /><span /><span /><span /></div><button type="button" onClick={stopCamera}><Square />停止</button></div>}
    <div className="scan-actions">
      <button type="button" className="scan-primary" onClick={startCamera}><Camera />カメラで読み取る</button>
      <button type="button" className="scan-secondary" onClick={() => imageInputRef.current?.click()}><ImageUp />画像から読み取る</button>
      <input ref={imageInputRef} hidden type="file" accept="image/*" capture="environment" onChange={readImage} />
    </div>
    <div className="barcode-divider"><span>または番号を入力</span></div>
    <div className="barcode-manual">
      <Keyboard /><input aria-label="バーコード番号" inputMode="numeric" autoComplete="off" placeholder="例：3017620422003" value={manualCode} onChange={(event) => changeManualCode(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); lookup(manualCode); } }} /><button type="button" onClick={() => lookup(manualCode)} disabled={!manualCode || status === 'loading'}>商品を検索</button>
    </div>
    {status !== 'idle' && <div className={`lookup-status ${status}`} role="status" aria-live="polite">
      {status === 'loading' || status === 'scanning' ? <LoaderCircle className="spin" /> : status === 'found' ? <Check /> : <AlertCircle />}
      <span>{message}</span>
    </div>}
    {product && <div className="lookup-product">
      {product.imageUrl ? <img src={product.imageUrl} alt="" /> : <span className="product-placeholder"><ScanBarcode /></span>}
      <div><b>{product.name}</b>{product.brand && <span>{product.brand}</span>}<small>{product.packageSize || `JAN ${product.barcode}`}</small></div>
      {product.sourceUrl && <a href={product.sourceUrl} target="_blank" rel="noreferrer">Open Food Facts</a>}
    </div>}
    {(status === 'not-found' || status === 'error') && manualCode && <p className="lookup-fallback">バーコード「{manualCode}」は保持されています。下の項目を手入力して保存できます。</p>}
  </section>;
}
