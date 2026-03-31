import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import '@tensorflow/tfjs';
import { gsap } from 'gsap';
import { useAuth } from '../hooks/useAuth';
import { dataUrlFromImageElement, thumbnailFromDataUrl } from '../lib/imageData';
import { consumeResumeForPath } from '../lib/mihResumeBridge';
import type { MihResumeDetection } from '../lib/mihResume';
import { detectionsFromResume } from '../lib/mihResume';
import { saveLastWorkbenchResume } from '../lib/lastWorkbenchSession';
import { addHistoryEntry } from '../lib/userDataApi';
import { postDetectionAnalytics } from '../lib/detectionAnalyticsApi';
import { FavoriteResultStar } from '../components/FavoriteResultStar';
import '../theme/det.css';

type Mode = 'image' | 'webcam' | 'video';

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
 * Підрахунок кількості об'єктів по класах.
 *
 * @param dets - Детекції COCO-SSD.
 * @returns Об'єкт «клас → кількість».
 */
function countsByClass(dets: Det[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const d of dets) {
    const c = d.class ?? 'object';
    m[c] = (m[c] || 0) + 1;
  }
  return m;
}

/**
 * Сторінка детекції об'єктів за допомогою моделі COCO-SSD.
 *
 * @description
 * Підтримує три режими роботи:
 * - Image: завантаження статичного зображення та одноразова детекція
 * - Webcam: детекція в реальному часі через getUserMedia з ~5 FPS
 * - Video: аналіз відеофайлу через посекундне семплування кадрів та детекцію кожного кадру
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

  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [imageRevealKey, setImageRevealKey] = useState(0);
  const [batchUrls, setBatchUrls] = useState<string[]>([]);
  const [batchIndex, setBatchIndex] = useState(0);
  const [batchDetectionsMap, setBatchDetectionsMap] = useState<Record<number, Det[]>>({});
  const [sessionClassTotals, setSessionClassTotals] = useState<Record<string, number>>({});

  const [videoProgress, setVideoProgress] = useState(0);
  const [videoFrameResults, setVideoFrameResults] = useState<Array<{ timeMs: number; count: number; classes: string[] }>>([]);
  const [isAnalyzingVideo, setIsAnalyzingVideo] = useState(false);

  const showResults =
    isRunning ||
    detections.length > 0 ||
    Object.keys(sessionClassTotals).length > 0;

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoFileInputRef = useRef<HTMLInputElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);
  const opacityProxiesRef = useRef<{ o: number }[]>([]);
  const revealTimelineRef = useRef<gsap.core.Timeline | null>(null);
  const imageRafRef = useRef<number | null>(null);
  const pulseRef = useRef(1);
  const lastWebcamAnalyticsRef = useRef(0);

  const [detectionResultSnapshot, setDetectionResultSnapshot] = useState<{
    previewImage: string;
    resumePayload: string;
  } | null>(null);

  const sorted = useMemo(() => {
    return [...detections].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }, [detections]);

  const sortedRef = useRef<Det[]>([]);
  sortedRef.current = sorted;

  const classDistribution = useMemo(() => {
    const entries = Object.entries(countsByClass(sorted));
    entries.sort((a, b) => b[1] - a[1]);
    const max = entries.length ? Math.max(...entries.map(([, n]) => n), 1) : 1;
    return entries.map(([label, count]) => ({
      label,
      count,
      pct: Math.round((count / max) * 100)
    }));
  }, [sorted]);

  const sessionDistribution = useMemo(() => {
    const entries = Object.entries(sessionClassTotals);
    entries.sort((a, b) => b[1] - a[1]);
    const max = entries.length ? Math.max(...entries.map(([, n]) => n), 1) : 1;
    return entries.map(([label, count]) => ({
      label,
      count,
      pct: Math.round((count / max) * 100)
    }));
  }, [sessionClassTotals]);

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
    revealTimelineRef.current?.kill();
    revealTimelineRef.current = null;
    opacityProxiesRef.current = [];
    batchUrls.forEach((u) => URL.revokeObjectURL(u));
    setBatchUrls([]);
    setBatchIndex(0);
    setBatchDetectionsMap({});
    setDetections([]);
    setActiveIdx(null);
    setImageUrl(null);
    setSessionClassTotals({});
    setDetectionResultSnapshot(null);
    setStatus('');
    setVideoFrameResults([]);
    setVideoProgress(0);
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
    revealTimelineRef.current?.kill();
    revealTimelineRef.current = null;
    opacityProxiesRef.current = [];
    stopWebcam();
    setDetections([]);
    setActiveIdx(null);
    const c = overlayRef.current;
    if (c) c.getContext('2d')?.clearRect(0, 0, c.width, c.height);
    setStatus('');
  }, [mode]);

  useEffect(() => {
    revealTimelineRef.current?.kill();
    if (mode !== 'image') {
      opacityProxiesRef.current = [];
      return;
    }
    const list = sortedRef.current;
    if (list.length === 0) {
      opacityProxiesRef.current = [];
      return;
    }
    opacityProxiesRef.current = list.map(() => ({ o: 0 }));
    const tl = gsap.timeline();
    list.forEach((_, i) => {
      const proxy = opacityProxiesRef.current[i];
      tl.to(proxy, { o: 1, duration: 0.34, ease: 'power2.out' }, i * 0.055);
    });
    revealTimelineRef.current = tl;
    return () => {
      tl.kill();
    };
  }, [imageRevealKey, mode]);

  useEffect(() => {
    if (mode !== 'image' || sorted.length === 0) {
      if (imageRafRef.current != null) {
        cancelAnimationFrame(imageRafRef.current);
        imageRafRef.current = null;
      }
      return;
    }
    const loop = () => {
      pulseRef.current = 1 + 0.12 * Math.sin(performance.now() / 185);
      const img = imgRef.current;
      if (img) draw(sorted, img, { pulse: pulseRef.current });
      imageRafRef.current = requestAnimationFrame(loop);
    };
    imageRafRef.current = requestAnimationFrame(loop);
    return () => {
      if (imageRafRef.current != null) cancelAnimationFrame(imageRafRef.current);
      imageRafRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- потрібен повторний цикл при зміні sorted/activeIdx
  }, [mode, sorted, activeIdx]);

  /**
   * Аналізує відеофайл через посекундне семплування кадрів.
   * Для кожного кадру запускає COCO-SSD детекцію та зберігає результати.
   *
   * @param {File} file - Відеофайл для аналізу
   */
  const analyzeVideoFile = async (file: File) => {
    const m = await ensureModel();
    if (!m) return;
    setIsAnalyzingVideo(true);
    setVideoProgress(0);
    setVideoFrameResults([]);
    setDetections([]);

    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.src = url;
    video.muted = true;
    video.preload = 'auto';

    await new Promise<void>((res) => {
      video.onloadedmetadata = () => res();
      video.onerror = () => res();
    });

    const duration = video.duration || 0;
    const step = Math.max(1, duration / 30);
    const times: number[] = [];
    for (let t = 0; t < duration; t += step) times.push(t);

    const frameCanvas = document.createElement('canvas');
    const frameCtx = frameCanvas.getContext('2d');
    const results: Array<{ timeMs: number; count: number; classes: string[] }> = [];

    for (let i = 0; i < times.length; i++) {
      const t = times[i];
      video.currentTime = t;
      await new Promise<void>((res) => {
        const handler = () => { video.removeEventListener('seeked', handler); res(); };
        video.addEventListener('seeked', handler);
      });

      if (!frameCtx) break;
      frameCanvas.width = video.videoWidth || 640;
      frameCanvas.height = video.videoHeight || 480;
      frameCtx.drawImage(video, 0, 0);

      try {
        const dets = await m.detect(frameCanvas);
        results.push({
          timeMs: Math.round(t * 1000),
          count: dets.length,
          classes: [...new Set(dets.map(d => d.class))]
        });
        if (i === Math.floor(times.length / 2)) {
          setDetections(dets);
          setImageUrl(frameCanvas.toDataURL('image/jpeg', 0.7));
        }
      } catch {
        results.push({ timeMs: Math.round(t * 1000), count: 0, classes: [] });
      }

      setVideoProgress(Math.round(((i + 1) / times.length) * 100));
    }

    URL.revokeObjectURL(url);
    setVideoFrameResults(results);
    setIsAnalyzingVideo(false);

    const allDets = results.flatMap(r => r.classes);
    const totals: Record<string, number> = {};
    allDets.forEach(c => { totals[c] = (totals[c] || 0) + 1; });
    setSessionClassTotals(prev => {
      const next = { ...prev };
      Object.entries(totals).forEach(([k, v]) => { next[k] = (next[k] || 0) + v; });
      return next;
    });
  };

  const handleVideoFile = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.type.startsWith('video/')) return;
    void analyzeVideoFile(file);
  };

  const handleFiles = (files: FileList | null) => {
    const list = files ? Array.from(files) : [];
    if (list.length === 0) return;
    batchUrls.forEach((u) => URL.revokeObjectURL(u));
    const urls = list.map((f) => URL.createObjectURL(f));
    setBatchUrls(urls);
    setBatchIndex(0);
    setImageUrl(urls[0]);
    setDetections([]);
    setActiveIdx(null);
    setDetectionResultSnapshot(null);
    setBatchDetectionsMap({});
    setStatus(
      list.length > 1
        ? `Пакет: ${list.length} зображень — запустіть детекцію або «Детектувати пакет»`
        : 'Image added — press “Run detection”'
    );
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

  const draw = (
    dets: Det[],
    el: HTMLImageElement | HTMLVideoElement,
    opts?: { pulse?: number }
  ) => {
    const pulse = opts?.pulse ?? 1;
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

    const proxies = opacityProxiesRef.current;

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
      const op = proxies[idx]?.o ?? 1;

      ctx.save();
      ctx.globalAlpha = op;
      const lineBoost = isActive ? pulse : 1;
      ctx.lineWidth = (isActive ? 3.2 : 2) * lineBoost;
      ctx.strokeStyle = col;

      // Кутові дужки замість суцільного прямокутника
      const cornerLen = Math.min(sw, sh) * 0.26;
      ctx.beginPath();
      // Верхній лівий кут
      ctx.moveTo(sx, sy + cornerLen); ctx.lineTo(sx, sy); ctx.lineTo(sx + cornerLen, sy);
      // Верхній правий кут
      ctx.moveTo(sx + sw - cornerLen, sy); ctx.lineTo(sx + sw, sy); ctx.lineTo(sx + sw, sy + cornerLen);
      // Нижній правий кут
      ctx.moveTo(sx + sw, sy + sh - cornerLen); ctx.lineTo(sx + sw, sy + sh); ctx.lineTo(sx + sw - cornerLen, sy + sh);
      // Нижній лівий кут
      ctx.moveTo(sx + cornerLen, sy + sh); ctx.lineTo(sx, sy + sh); ctx.lineTo(sx, sy + sh - cornerLen);
      ctx.stroke();

      // Для активного об'єкта — легка заливка та пунктирний контур
      if (isActive) {
        ctx.globalAlpha = op * 0.10;
        ctx.fillStyle = col;
        ctx.fillRect(sx, sy, sw, sh);
        ctx.globalAlpha = op * 0.35;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(sx, sy, sw, sh);
        ctx.setLineDash([]);
      }

      ctx.restore();

      const tag = `${label} · ${Math.round(score * 100)}%`;
      ctx.font = '12px system-ui, -apple-system, Segoe UI, sans-serif';
      const padX = 6;
      const tw = ctx.measureText(tag).width;
      const th = 16;
      ctx.save();
      ctx.globalAlpha = op;
      ctx.fillStyle = 'rgba(2, 6, 23, 0.85)';
      ctx.fillRect(sx, Math.max(0, sy - th), tw + padX * 2, th);
      ctx.fillStyle = col;
      ctx.fillText(tag, sx + padX, Math.max(12, sy - 4));
      ctx.restore();
    });
  };

  const runImageDetection = async () => {
    if (!imageUrl || isRunning) return;
    setIsRunning(true);
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
      setSessionClassTotals((prev) => {
        const next = { ...prev };
        for (const d of sortedDets) {
          const c = d.class ?? 'object';
          next[c] = (next[c] || 0) + 1;
        }
        return next;
      });
      setImageRevealKey((k) => k + 1);
      postDetectionAnalytics(countsByClass(sortedDets), sortedDets.length, 'det-image');
      draw(sortedDets, img, { pulse: 1 });
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
        if (t - lastTickRef.current < 200) return;
        lastTickRef.current = t;
        if (!videoRef.current) return;
        if (videoRef.current.readyState < 2) return;
        try {
          const dets = (await m.detect(videoRef.current)) as Det[];
          const sortedDets = [...dets].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
          setDetections(sortedDets);
          setActiveIdx(sortedDets.length ? 0 : null);
          const pulseLive = 1 + 0.1 * Math.sin(t / 170);
          draw(sortedDets, videoRef.current, { pulse: pulseLive });
          if (t - lastWebcamAnalyticsRef.current > 6000 && sortedDets.length > 0) {
            lastWebcamAnalyticsRef.current = t;
            postDetectionAnalytics(countsByClass(sortedDets), sortedDets.length, 'det-webcam');
          }
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
    if (mode === 'webcam') {
      draw(sorted, el, { pulse: pulseRef.current });
    }
  };

  /** Завантажує результати детекції об'єктів у форматі JSON. */
  const handleExportJson = () => {
    const data = {
      module: 'object-detection',
      exportedAt: new Date().toISOString(),
      mode,
      totalDetections: detections.length,
      detections: detections.map(d => ({
        class: d.class,
        score: d.score,
        bbox: { x: d.bbox[0], y: d.bbox[1], width: d.bbox[2], height: d.bbox[3] }
      })),
      sessionClassTotals
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `detection-result-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportDetectionPng = () => {
    const img = imgRef.current;
    if (!img || mode !== 'image' || !img.complete || sorted.length === 0) return;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (w < 2 || h < 2) return;
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const ctx = out.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, w, h);
    const proxies = opacityProxiesRef.current;
    const fontPx = Math.max(14, Math.round(w / 48));
    sorted.forEach((d, idx) => {
      const [bx, by, bw, bh] = d.bbox;
      const label = d.class ?? 'object';
      const score = d.score ?? 0;
      const col = colorForLabel(label);
      const isActive = activeIdx === idx;
      const op = proxies[idx]?.o ?? 1;
      ctx.save();
      ctx.globalAlpha = op;
      ctx.lineWidth = isActive ? 4 : 2.2;
      ctx.strokeStyle = col;
      ctx.strokeRect(bx, by, bw, bh);
      ctx.restore();
      const tag = `${label} · ${Math.round(score * 100)}%`;
      ctx.font = `${fontPx}px system-ui, -apple-system, Segoe UI, sans-serif`;
      const padX = 8;
      const tw = ctx.measureText(tag).width;
      const th = Math.round(fontPx * 1.35);
      ctx.save();
      ctx.globalAlpha = op;
      ctx.fillStyle = 'rgba(2, 6, 23, 0.9)';
      ctx.fillRect(bx, Math.max(0, by - th), tw + padX * 2, th);
      ctx.fillStyle = col;
      ctx.fillText(tag, bx + padX, Math.max(fontPx, by - 4));
      ctx.restore();
    });
    out.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      const u = URL.createObjectURL(blob);
      a.href = u;
      a.download = `mih-detection-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(u);
    }, 'image/png');
  };

  const runBatchDetection = async () => {
    if (batchUrls.length === 0 || mode !== 'image') return;
    const m = await ensureModel();
    if (!m) return;
    setIsRunning(true);
    const mergedBatch: Record<string, number> = {};
    try {
      for (let i = 0; i < batchUrls.length; i += 1) {
        setBatchIndex(i);
        const url = batchUrls[i];
        setImageUrl(url);
        const sortedDets = await new Promise<Det[]>((resolve) => {
          const im = new Image();
          im.onload = async () => {
            try {
              const d = (await m.detect(im)) as Det[];
              const s = [...d].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
              resolve(s);
            } catch {
              resolve([]);
            }
          };
          im.onerror = () => resolve([]);
          im.src = url;
        });
        setDetections(sortedDets);
        setActiveIdx(sortedDets.length ? 0 : null);
        setImageRevealKey((k) => k + 1);
        // Зберігаємо результати для кожного зображення окремо
        setBatchDetectionsMap((prev) => ({ ...prev, [i]: sortedDets }));
        for (const d of sortedDets) {
          const c = d.class ?? 'object';
          mergedBatch[c] = (mergedBatch[c] || 0) + 1;
        }
        postDetectionAnalytics(countsByClass(sortedDets), sortedDets.length, 'det-batch-image');
        await new Promise((r) => setTimeout(r, 320));
      }
      setSessionClassTotals((prev) => {
        const next = { ...prev };
        for (const [k, v] of Object.entries(mergedBatch)) {
          next[k] = (next[k] || 0) + v;
        }
        return next;
      });
      setStatus(`Пакет оброблено: ${batchUrls.length} зображень`);
    } finally {
      setIsRunning(false);
    }
  };

  const goToBatchIndex = useCallback((idx: number) => {
    if (batchUrls.length === 0) return;
    const i = ((idx % batchUrls.length) + batchUrls.length) % batchUrls.length;
    setBatchIndex(i);
    setImageUrl(batchUrls[i]);
    // Відновлюємо детекції для цього індексу, якщо вони були збережені
    setBatchDetectionsMap((prev) => {
      const saved = prev[i] ?? [];
      setDetections(saved);
      setActiveIdx(saved.length ? 0 : null);
      return prev;
    });
    revealTimelineRef.current?.kill();
    revealTimelineRef.current = null;
    opacityProxiesRef.current = [];
    const c = overlayRef.current;
    if (c) c.getContext('2d')?.clearRect(0, 0, c.width, c.height);
  }, [batchUrls]);


  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return;
      if (mode !== 'image' || batchUrls.length < 2) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        goToBatchIndex(batchIndex + 1);
      }
      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        goToBatchIndex(batchIndex - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, batchUrls.length, batchIndex, goToBatchIndex]);

  const mediaEl = mode === 'image' ? imgRef.current : videoRef.current;
  useEffect(() => {
    if (!mediaEl) return;
    if (detections.length === 0) {
      const c = overlayRef.current;
      if (c) c.getContext('2d')?.clearRect(0, 0, c.width, c.height);
      return;
    }
    if (mode === 'image') return;
    draw(sorted, mediaEl, { pulse: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIdx, detections.length, sorted.length, mode]);

  return (
    <div className={"panel-grid " + (showResults ? "det-has-results" : "det-no-results")}>

        <div className="panel det-panel--rel">
        <div className="panel-header">
          <div>
            <div className="panel-title">
              <span>Object Detection</span>
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
            <button
              type="button"
              className={`secondary-button ${mode === 'video' ? 'det-tab--active' : ''}`}
              onClick={() => setMode('video')}
              disabled={mode === 'video' || isRunning || isAnalyzingVideo}
            >
              Video
            </button>
            {user && detectionResultSnapshot && mode === 'image' && sorted.length > 0 ? (
              <FavoriteResultStar
                path="/detection"
                title={`Детекція (${sorted.length})`}
                previewImage={detectionResultSnapshot.previewImage}
                resumePayload={detectionResultSnapshot.resumePayload}
              />
            ) : null}
          </div>
        </div>

        <div className="det-controls">
          {mode === 'image' ? (
            <>
              <button type="button" className="secondary-button" onClick={() => fileInputRef.current?.click()} title="Додати зображення (можна кілька)">
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
              {batchUrls.length > 1 ? (
                <button
                  type="button"
                  className="primary-button det-btn--batch"
                  onClick={runBatchDetection}
                  disabled={isRunning || isLoadingModel}
                >
                  Детектувати пакет
                </button>
              ) : null}
            </>
          ) : mode === 'webcam' ? (
            <>
              <button type="button" className="primary-button" onClick={startWebcam} disabled={!!streamRef.current || isLoadingModel}>
                ▶ Start
              </button>
              <button type="button" className="secondary-button" onClick={stopWebcam} disabled={!streamRef.current}>
                ⏹ Stop
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="primary-button"
                onClick={() => videoFileInputRef.current?.click()}
                disabled={isAnalyzingVideo || isLoadingModel}
              >
                Upload video
              </button>
              {isAnalyzingVideo && (
                <span className="det-status">Аналіз… {videoProgress}%</span>
              )}
            </>
          )}
          <button
            type="button"
            className="secondary-button"
            onClick={clearAll}
            disabled={
              mode === 'image'
                ? !imageUrl && detections.length === 0 && batchUrls.length === 0 && Object.keys(sessionClassTotals).length === 0
                : detections.length === 0 && videoFrameResults.length === 0
            }
          >
            Clear
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => handleFiles(e.target.files)}
          />
          <input
            ref={videoFileInputRef}
            type="file"
            accept="video/*"
            style={{ display: 'none' }}
            onChange={(e) => handleVideoFile(e.target.files)}
          />
        </div>

        <div className="det-toolbar">
          {mode === 'image' && batchUrls.length > 1 ? (
            <div className="det-batch-nav">
              <span className="det-batch-label">
                Пакет: {batchIndex + 1} / {batchUrls.length}
              </span>
              <button type="button" className="secondary-button" onClick={() => goToBatchIndex(batchIndex - 1)} title="Попереднє (M)">
                ←
              </button>
              <button type="button" className="secondary-button" onClick={() => goToBatchIndex(batchIndex + 1)} title="Наступне (N)">
                →
              </button>
              <span className="det-hint">клавіші N / M</span>
            </div>
          ) : null}
          {mode === 'image' && sorted.length > 0 ? (
            <div className="det-toolbar-tools">
              <button
                type="button"
                className="secondary-button"
                onClick={exportDetectionPng}
                disabled={!imageUrl}
                title="Знімок кадру з рамками"
              >
                Експорт PNG
              </button>
              {detections.length > 0 ? (
                <button type="button" className="secondary-button" onClick={handleExportJson}>
                  ↓ Export JSON
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {isLoadingModel && (
          <div className="det-model-loading">
            <div className="det-model-loading-bar" />
            <span>Loading COCO-SSD model…</span>
          </div>
        )}

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
          ) : mode === 'webcam' ? (
            <div className={"det-stage " + (showResults ? "" : "det-stage--full")}>
              <video ref={videoRef} className="det-media" playsInline muted />
              <canvas ref={overlayRef} className="det-overlay" />
            </div>
          ) : (
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
                {isAnalyzingVideo && (
                  <div className="det-stage-loading">
                    <span style={{ color: '#e5e7eb', fontSize: '0.9rem' }}>{videoProgress}%</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="det-empty" onClick={(e) => { e.stopPropagation(); videoFileInputRef.current?.click(); }}>
                <div className="det-empty-title">Click to upload a video file</div>
                <div className="det-empty-sub">MP4, WebM, MOV and other formats</div>
              </div>
            )
          )}
        </div>

        {mode === 'video' && videoFrameResults.length > 0 && (
          <div className="det-video-timeline">
            <div className="det-video-timeline-title">Frame analysis timeline ({videoFrameResults.length} frames)</div>
            <div className="det-video-bars">
              {videoFrameResults.map((fr, i) => (
                <div key={i} className="det-video-bar-col">
                  <div
                    className="det-video-bar"
                    style={{ height: `${Math.round((fr.count / Math.max(...videoFrameResults.map(f => f.count), 1)) * 48)}px` }}
                    title={`${(fr.timeMs / 1000).toFixed(1)}s: ${fr.count} objects — ${fr.classes.join(', ')}`}
                  />
                  <span className="det-video-bar-label">{(fr.timeMs / 1000).toFixed(0)}s</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="panel det-results-panel">
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

        {classDistribution.length > 0 ? (
          <div className="det-stats-block">
            <div className="det-stats-title">Розподіл за класами (кадр)</div>
            <div className="det-stats-bars">
              {classDistribution.map(({ label, count, pct }) => (
                <div key={`frame-${label}`} className="det-stat-row">
                  <span className="det-stat-label">{label}</span>
                  <span className="det-stat-count">{count}</span>
                  <div className="det-bar det-bar--stat">
                    <div
                      className="det-bar-fill"
                      style={{ width: `${pct}%`, background: colorForLabel(label) }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {sessionDistribution.length > 0 ? (
          <div className="det-stats-block det-stats-block--session">
            <div className="det-stats-title">Накопичено за сесію</div>
            <div className="det-stats-bars">
              {sessionDistribution.map(({ label, count, pct }) => (
                <div key={`sess-${label}`} className="det-stat-row">
                  <span className="det-stat-label">{label}</span>
                  <span className="det-stat-count">{count}</span>
                  <div className="det-bar det-bar--stat">
                    <div
                      className="det-bar-fill"
                      style={{ width: `${pct}%`, background: colorForLabel(label) }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {sorted.length === 0 ? (
          <div className="det-list-empty">
            {isRunning && mode === 'image'
              ? 'Очікування детекції…'
              : sessionDistribution.length > 0
                ? 'Немає детекцій на поточному кадрі. Оберіть інше зображення або запустіть детекцію.'
                : 'Результати з’являться після детекції'}
          </div>
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

