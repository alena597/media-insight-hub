import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import '@tensorflow/tfjs';
import { useAuth } from '../hooks/useAuth';
import { dataUrlFromImageElement, thumbnailFromDataUrl } from '../lib/imageData';
import { consumeResumeForPath } from '../lib/mihResumeBridge';
import type { MihResumeDetection } from '../lib/mihResume';
import { detectionsFromResume } from '../lib/mihResume';
import { saveLastWorkbenchResume } from '../lib/lastWorkbenchSession';
import { addHistoryEntry } from '../lib/userDataApi';
import { FavoriteResultStar } from '../components/FavoriteResultStar';
import '../theme/det.css';

type Mode = 'image' | 'webcam';

type Det = cocoSsd.DetectedObject;

/**
 * Обмежує числове значення в діапазоні від 0 до 100.
 *
 * @param {number} x - Вхідне значення
 * @returns {number} Значення в діапазоні [0, 100]
 *
 * @example
 * clampPct(150) // повертає 100
 * clampPct(-5)  // повертає 0
 * clampPct(75)  // повертає 75
 */
function clampPct(x: number) {
  return Math.max(0, Math.min(100, x));
}

/**
 * Генерує унікальний HSL колір для конкретного класу об'єкта.
 *
 * @description
 * Використовує хеш-функцію на основі символів рядка для генерації
 * детермінованого кольору. Один і той самий клас завжди отримує
 * однаковий колір між різними запусками детекції.
 *
 * @param {string} label - Назва класу об'єкта (наприклад 'person', 'car')
 * @returns {string} CSS колір у форматі HSL
 *
 * @example
 * colorForLabel('person') // повертає 'hsl(120 85% 60%)'
 * colorForLabel('car')    // повертає 'hsl(45 85% 60%)'
 */
function colorForLabel(label: string) {
  let hash = 0;
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 85% 60%)`;
}

/**
 * Форматує score детекції об'єкта у рядок відсотка.
 *
 * @param {number | undefined} score - Значення впевненості від 0 до 1
 * @returns {string} Відформатований рядок відсотка або '—' якщо значення відсутнє
 *
 * @example
 * fmtPct(0.94)      // повертає '94%'
 * fmtPct(undefined) // повертає '—'
 */
function fmtPct(score: number | undefined) {
  if (typeof score !== 'number') return '—';
  return `${Math.round(score * 100)}%`;
}

/**
 * Сторінка детекції об'єктів за допомогою моделі COCO-SSD.
 *
 * @description
 * Підтримує два режими роботи:
 * - Image: завантаження статичного зображення та одноразова детекція
 * - Webcam: детекція в реальному часі через getUserMedia з ~5 FPS
 *
 * Архітектурне рішення: canvas-оверлей накладається поверх
 * зображення/відео через абсолютне позиціонування. Координати
 * bounding boxes масштабуються через scaleX/scaleY коефіцієнти
 * між натуральним розміром медіа та відображуваним розміром.
 *
 * Взаємодія компонентів:
 * - COCO-SSD model.detect() → detections → draw() → canvas overlay
 * - Клік на список об'єктів → activeIdx → перемальовування canvas
 *
 * @returns {JSX.Element} Сторінка детекції об'єктів
 */
export function ObjectDetectionPage() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const resumeApplied = useRef(false);

  const [mode, setMode] = useState<Mode>('image');
  const [model, setModel] = useState<cocoSsd.ObjectDetection | null>(null);
  const [isLoadingModel, setIsLoadingModel] = useState(false);
  const [, setStatus] = useState('');
  const [isRunning, setIsRunning] = useState(false);


  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [detections, setDetections] = useState<Det[]>([]);

  const showResults = isRunning || detections.length > 0;
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);

  const [detectionResultSnapshot, setDetectionResultSnapshot] = useState<{
    previewImage: string;
    resumePayload: string;
  } | null>(null);

  const sorted = useMemo(() => {
    return [...detections].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }, [detections]);

  useEffect(() => {
    if (resumeApplied.current) return;
    const st = location.state as { mihResume?: unknown } | undefined;
    let raw: unknown = st?.mihResume;
    if (!raw || typeof raw !== 'object') {
      const bridged = consumeResumeForPath('/detection');
      if (bridged && typeof bridged === 'object') raw = bridged;
    }
    if (!raw || typeof raw !== 'object') return;
    const o = raw as Record<string, unknown>;
    if (o.module !== 'detection' || o.mode !== 'image' || typeof o.imageDataUrl !== 'string') return;
    resumeApplied.current = true;
    navigate('/detection', { replace: true, state: {} });
    setMode('image');
    setImageUrl(o.imageDataUrl);
    const rawDets = Array.isArray(o.detections) ? o.detections : [];
    const restored = detectionsFromResume(
      rawDets as MihResumeDetection['detections']
    ) as Det[];
    setDetections(restored);
    setActiveIdx(restored.length ? 0 : null);
    void (async () => {
      try {
        const full = o.imageDataUrl as string;
        const thumb = await thumbnailFromDataUrl(full, 320);
        const payload: MihResumeDetection = {
          v: 1,
          module: 'detection',
          mode: 'image',
          imageDataUrl: full,
          detections: restored.map((d) => ({
            bbox: d.bbox as [number, number, number, number],
            class: d.class ?? 'object',
            score: d.score ?? 0
          }))
        };
        setDetectionResultSnapshot({
          previewImage: thumb,
          resumePayload: JSON.stringify(payload)
        });
      } catch {
        /* ignore */
      }
    })();
  }, [location.state, navigate]);

  const buildDetectionSnapshot = async (dets: Det[]) => {
    const img = imgRef.current;
    if (!img || mode !== 'image' || dets.length === 0) return null;
    try {
      const full = await dataUrlFromImageElement(img, 920, 0.8);
      const payload: MihResumeDetection = {
        v: 1,
        module: 'detection',
        mode: 'image',
        imageDataUrl: full,
        detections: dets.map((d) => ({
          bbox: d.bbox as [number, number, number, number],
          class: d.class ?? 'object',
          score: d.score ?? 0
        }))
      };
      const s = JSON.stringify(payload);
      if (s.length > 1_450_000) return null;
      const thumb = await thumbnailFromDataUrl(full, 320);
      return { s, thumb, n: dets.length };
    } catch {
      return null;
    }
  };

  const logAnalysisHistory = async (dets: Det[]) => {
    if (!user) return;
    const snap = await buildDetectionSnapshot(dets);
    if (!snap) return;
    setDetectionResultSnapshot({ previewImage: snap.thumb, resumePayload: snap.s });
    saveLastWorkbenchResume('/detection', snap.s);
    try {
      await addHistoryEntry({
        kind: 'analysis',
        label: `Детекція · ${snap.n} об’єктів`,
        path: '/detection',
        previewImage: snap.thumb,
        resumePayload: snap.s
      });
    } catch {
      /* ignore */
    }
  };

  const ensureModel = async () => {
    if (model) return model;
    if (isLoadingModel) return null;
    setIsLoadingModel(true);
    setStatus('Loading COCO-SSD model...');
    try {
      const loaded = await cocoSsd.load();
      setModel(loaded);
      setStatus('Model ready');
      return loaded;
    } catch (e) {
      console.error(e);
      setStatus('Model load error');
      return null;
    } finally {
      setIsLoadingModel(false);
    }
  };

  const clearAll = () => {
    setDetections([]);
    setActiveIdx(null);
    setImageUrl(null);
    setDetectionResultSnapshot(null);
    setStatus("");
    const c = overlayRef.current;
    if (c) c.getContext('2d')?.clearRect(0, 0, c.width, c.height);
  };

  const stopWebcam = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    lastTickRef.current = 0;
    setIsRunning(false);
    const s = streamRef.current;
    if (s) s.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  useEffect(() => {
    return () => stopWebcam();
  }, []);

  useEffect(() => {
    
    stopWebcam();
    setDetections([]);
    setActiveIdx(null);
    const c = overlayRef.current;
    if (c) c.getContext('2d')?.clearRect(0, 0, c.width, c.height);
    setStatus("");
  }, [mode]);

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    setDetections([]);
    setActiveIdx(null);
    setDetectionResultSnapshot(null);
    setStatus('Image added — press “Run detection”');
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (mode !== 'image') return;
    handleFiles(e.dataTransfer.files);
  };

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const syncOverlayToMedia = (el: HTMLImageElement | HTMLVideoElement) => {
    const canvas = overlayRef.current;
    if (!canvas) return null;
    const rect = el.getBoundingClientRect();
    const parentRect = (el.parentElement ?? el).getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const left = rect.left - parentRect.left;
    const top = rect.top - parentRect.top;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    canvas.style.left = `${left}px`;
    canvas.style.top = `${top}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, rect };
  };

  const draw = (dets: Det[], el: HTMLImageElement | HTMLVideoElement) => {
    const s = syncOverlayToMedia(el);
    if (!s) return;
    const { ctx, rect } = s;
    ctx.clearRect(0, 0, rect.width, rect.height);

    const naturalW =
      el instanceof HTMLVideoElement ? el.videoWidth || rect.width : el.naturalWidth || rect.width;
    const naturalH =
      el instanceof HTMLVideoElement ? el.videoHeight || rect.height : el.naturalHeight || rect.height;
    const scaleX = rect.width / naturalW;
    const scaleY = rect.height / naturalH;

    dets.forEach((d, idx) => {
      const [x, y, w, h] = d.bbox;
      const sx = x * scaleX;
      const sy = y * scaleY;
      const sw = w * scaleX;
      const sh = h * scaleY;
      const label = d.class ?? 'object';
      const score = d.score ?? 0;
      const col = colorForLabel(label);
      const isActive = activeIdx === idx;

      ctx.lineWidth = isActive ? 3 : 2;
      ctx.strokeStyle = col;
      ctx.strokeRect(sx, sy, sw, sh);

      const tag = `${label} · ${Math.round(score * 100)}%`;
      ctx.font = '12px system-ui, -apple-system, Segoe UI, sans-serif';
      const padX = 6;
      const tw = ctx.measureText(tag).width;
      const th = 16;
      ctx.fillStyle = 'rgba(2, 6, 23, 0.85)';
      ctx.fillRect(sx, Math.max(0, sy - th), tw + padX * 2, th);
      ctx.fillStyle = col;
      ctx.fillText(tag, sx + padX, Math.max(12, sy - 4));
    });
  };

  const runImageDetection = async () => {
    if (!imageUrl || isRunning) return;
    setIsRunning(true);
    try {
      const key = "mih_analyses_count";
      const cur = Number(localStorage.getItem(key) || "0");
      localStorage.setItem(key, String(cur + 1));
    } catch {
      // ignore
    }
    const m = await ensureModel();
    if (!m) {
      setIsRunning(false);
      return;
    }
    const img = imgRef.current;
    if (!img) {
      setIsRunning(false);
      return;
    }
    setStatus('Detecting...');
    try {
      const dets = (await m.detect(img)) as Det[];
      const sortedDets = [...dets].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
      setDetections(sortedDets);
      setActiveIdx(sortedDets.length ? 0 : null);
      setStatus(sortedDets.length ? `Found: ${sortedDets.length}` : 'No objects found');
      draw(sortedDets, img);
      void logAnalysisHistory(sortedDets);
    } catch (e) {
      console.error(e);
      setStatus('Detection error');
    } finally {
      setIsRunning(false);
    }
  };

  const startWebcam = async () => {
    if (isRunning) return;
    setIsRunning(true);
    try {
      const key = "mih_analyses_count";
      const cur = Number(localStorage.getItem(key) || "0");
      localStorage.setItem(key, String(cur + 1));
    } catch {
      // ignore
    }
    const m = await ensureModel();
    if (!m) {
      setIsRunning(false);
      return;
    }
    try {
      setStatus('Requesting camera access...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false
      });
      streamRef.current = stream;
      const v = videoRef.current;
      if (!v) throw new Error('video ref not ready');
      v.srcObject = stream;
      await v.play();
      setStatus('Live detection…');

      const tick = async (t: number) => {
        rafRef.current = requestAnimationFrame(tick);
        // throttle: ~5 fps
        if (t - lastTickRef.current < 200) return;
        lastTickRef.current = t;
        if (!videoRef.current) return;
        if (videoRef.current.readyState < 2) return;
        try {
          const dets = (await m.detect(videoRef.current)) as Det[];
          const sortedDets = [...dets].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
          setDetections(sortedDets);
          setActiveIdx(sortedDets.length ? 0 : null);
          draw(sortedDets, videoRef.current);
        } catch (e) {
          console.error(e);
          setStatus('Live detection error');
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (e) {
      console.error(e);
      setStatus('Failed to start webcam');
      stopWebcam();
    } finally {
      setIsRunning(false);
    }
  };

  const onSelectDet = (idx: number) => {
    setActiveIdx(idx);
    const el = mode === 'image' ? imgRef.current : videoRef.current;
    if (!el) return;
    // important: use the same ordering as drawn
    draw(sorted, el);
  };

  const mediaEl = mode === 'image' ? imgRef.current : videoRef.current;
  useEffect(() => {
    if (!mediaEl) return;
    if (detections.length === 0) {
      const c = overlayRef.current;
      if (c) c.getContext('2d')?.clearRect(0, 0, c.width, c.height);
      return;
    }
    draw(sorted, mediaEl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIdx, detections.length, sorted.length, mode]);

  return (
    <div className={"panel-grid " + (showResults ? "det-has-results" : "det-no-results")}>

        <div className="panel det-panel--rel">
        {user &&
        detectionResultSnapshot &&
        mode === 'image' &&
        sorted.length > 0 ? (
          <div className="mih-fav-star-host">
            <FavoriteResultStar
              path="/detection"
              title={`Детекція (${sorted.length})`}
              previewImage={detectionResultSnapshot.previewImage}
              resumePayload={detectionResultSnapshot.resumePayload}
            />
          </div>
        ) : null}
        <div className="panel-header">
          <div>
            <div className="panel-title">
              <span>Object Detection</span>
              <span className="label-pill">COCO-SSD</span>
            </div>
          </div>
          <div className="det-mode-tabs">
            <button
              type="button"
              className={`secondary-button ${mode === 'image' ? 'det-tab--active' : ''}`}
              onClick={() => setMode('image')}
              disabled={mode === 'image' || isRunning}
            >
              Image
            </button>
            <button
              type="button"
              className={`secondary-button ${mode === 'webcam' ? 'det-tab--active' : ''}`}
              onClick={() => setMode('webcam')}
              disabled={mode === 'webcam' || isRunning}
            >
              Webcam
            </button>
          </div>
        </div>

        <div className="det-controls">
          {mode === 'image' ? (
            <>
              <button type="button" className="secondary-button" onClick={() => fileInputRef.current?.click()}>
                ＋
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={runImageDetection}
                disabled={!imageUrl || isRunning || isLoadingModel}
              >
                {isRunning ? 'Detecting…' : 'Run detection'}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="primary-button" onClick={startWebcam} disabled={!!streamRef.current || isLoadingModel}>
                ▶ Start
              </button>
              <button type="button" className="secondary-button" onClick={stopWebcam} disabled={!streamRef.current}>
                ⏹ Stop
              </button>
            </>
          )}
          <button type="button" className="secondary-button" onClick={clearAll} disabled={mode === 'image' ? !imageUrl && detections.length === 0 : detections.length === 0}>
            🧹 Clear
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>

        <div className="file-drop-zone det-zone" onDrop={onDrop} onDragOver={onDragOver} onClick={() => mode === 'image' && fileInputRef.current?.click()}>
          {mode === 'image' ? (
            imageUrl ? (
              <div className={"det-stage " + (showResults ? "" : "det-stage--full")}>
                <img
                  ref={imgRef}
                  className="det-media"
                  src={imageUrl}
                  alt=""
                  onLoad={() => {
                    if (imgRef.current) syncOverlayToMedia(imgRef.current);
                  }}
                />
                <canvas ref={overlayRef} className="det-overlay" />
              </div>
            ) : (
              <div className="det-empty">
                <div className="det-empty-title">Click or drop an image</div>
                <div className="det-empty-sub"></div>
              </div>
            )
          ) : (
            <div className={"det-stage " + (showResults ? "" : "det-stage--full")}>
              <video ref={videoRef} className="det-media" playsInline muted />
              <canvas ref={overlayRef} className="det-overlay" />
            </div>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">
              <span>Detected objects</span>
              <span className="badge">
                {sorted.length} items
              </span>
            </div>
          </div>
        </div>

        {sorted.length === 0 ? (
          <div className="det-list-empty"></div>
        ) : (
          <div className="det-list">
            {sorted.map((d, idx) => {
              const label = d.class ?? 'object';
              const score = d.score ?? 0;
              const col = colorForLabel(label);
              const pct = clampPct(score * 100);
              const isActive = activeIdx === idx;
              return (
                <button
                  key={`${label}-${idx}-${d.bbox.join('-')}`}
                  type="button"
                  className={`det-item ${isActive ? 'det-item--active' : ''}`}
                  onClick={() => onSelectDet(idx)}
                >
                  <div className="det-item-top">
                    <span className="det-chip" style={{ borderColor: col, color: col }}>
                      {label}
                    </span>
                    <span className="det-score">{fmtPct(score)}</span>
                  </div>
                  <div className="det-bar">
                    <div className="det-bar-fill" style={{ width: `${pct}%`, background: col }} />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}

