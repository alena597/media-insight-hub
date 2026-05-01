import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import * as mobilenet from '@tensorflow-models/mobilenet';
import '@tensorflow/tfjs';
import { gsap } from 'gsap';
import { useAuth } from '../hooks/useAuth';
import { useCountUp } from '../hooks/useCountUp';
import { blobUrlToDataUrl, dataUrlFromImageElement, thumbnailFromDataUrl, thumbnailFromImageUrl } from '../lib/imageData';
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
 * Обмежує значення до діапазону 0..100.
 *
 * @param x - Вхідне число.
 * @returns Обмежене значення.
 */
function clampPct(x: number) {
  return Math.max(0, Math.min(100, x));
}

/**
 * Генерує стабільний колір для назви класу.
 *
 * @param label - Назва класу.
 * @returns CSS-колір HSL.
 */
function colorForLabel(label: string) {
  let hash = 0;
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 85% 60%)`;
}

/**
 * Форматує score моделі у відсотки.
 *
 * @param score - Ймовірність 0..1.
 * @returns Рядок відсотка або «—».
 */
function fmtPct(score: number | undefined) {
  if (typeof score !== 'number') return '—';
  return `${Math.round(score * 100)}%`;
}

/**
 * Рахує кількість детекцій по класах.
 *
 * @param dets - Масив детекцій.
 * @returns Мапа «клас -> кількість».
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
 * Збільшує лічильник виконаних аналізів для дашборду.
 *
 * @param delta - На скільки збільшити лічильник.
 */
function bumpAnalysesCount(delta = 1) {
  if (delta <= 0) return;
  try {
    const key = 'mih_analyses_count';
    const cur = Number(localStorage.getItem(key) || '0');
    localStorage.setItem(key, String(cur + delta));
  } catch {
    /* ignore */
  }
}

/**
 * Сторінка аналізу об'єктів (image/webcam/video) на базі COCO-SSD.
 *
 * @returns JSX-сторінка модуля детекції.
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
  const [, setBatchDetectionsMap] = useState<Record<number, Det[]>>({});
  const [sessionClassTotals, setSessionClassTotals] = useState<Record<string, number>>({});

  const [videoProgress, setVideoProgress] = useState(0);
  const [videoFrameResults, setVideoFrameResults] = useState<Array<{ timeMs: number; count: number; classes: string[] }>>([]);
  const [isAnalyzingVideo, setIsAnalyzingVideo] = useState(false);
  const [isWebcamActive, setIsWebcamActive] = useState(false);

  const [sceneTags, setSceneTags] = useState<string[]>([]);
  const mnetRef = useRef<mobilenet.MobileNet | null>(null);

  const [limitWarning, setLimitWarning] = useState(false);
  const [scanKey, setScanKey] = useState(0);
  const DET_FILE_LIMIT = 20;

  const showResults =
    isRunning ||
    isWebcamActive ||
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
  const imageThumbnailRef = useRef<string>('');

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
    if (o.module !== 'detection') return;
    resumeApplied.current = true;
    navigate('/detection', { replace: true, state: {} });
    setMode('image');
    if (o.mode === 'batch' && Array.isArray(o.items)) {
      const items = o.items
        .filter((it): it is { imageDataUrl: string; detections?: unknown[] } =>
          typeof it === 'object' &&
          it !== null &&
          typeof (it as { imageDataUrl?: unknown }).imageDataUrl === 'string'
        )
        .map((it) => ({
          imageDataUrl: it.imageDataUrl,
          detections: detectionsFromResume(
            (Array.isArray(it.detections) ? it.detections : []) as Array<{
              bbox: [number, number, number, number];
              class: string;
              score: number;
            }>
          ) as Det[]
        }));
      if (items.length === 0) return;
      setBatchUrls(items.map((it) => it.imageDataUrl));
      setBatchIndex(0);
      setImageUrl(items[0].imageDataUrl);
      const first = items[0].detections;
      setDetections(first);
      setActiveIdx(first.length ? 0 : null);
      setBatchDetectionsMap(() => {
        const map: Record<number, Det[]> = {};
        items.forEach((it, idx) => {
          map[idx] = it.detections;
        });
        return map;
      });
      const totals: Record<string, number> = {};
      items.forEach((it) => {
        it.detections.forEach((d) => {
          const c = d.class ?? 'object';
          totals[c] = (totals[c] || 0) + 1;
        });
      });
      setSessionClassTotals(totals);
      void (async () => {
        try {
          const thumb = await thumbnailFromImageUrl(items[0].imageDataUrl, 320) ?? '';
          const payload: MihResumeDetection = {
            v: 1,
            module: 'detection',
            mode: 'batch',
            items: items.map((it) => ({
              imageDataUrl: it.imageDataUrl,
              detections: it.detections.map((d) => ({
                bbox: d.bbox as [number, number, number, number],
                class: d.class ?? 'object',
                score: d.score ?? 0
              }))
            })),
            batchMeta: { batchCount: items.length, sessionTotals: totals }
          };
          setDetectionResultSnapshot({
            previewImage: thumb,
            resumePayload: JSON.stringify(payload)
          });
        } catch {
          /* ignore */
        }
      })();
      return;
    }
    if (o.mode === 'video') {
      const frameDataUrl = typeof o.imageDataUrl === 'string' ? o.imageDataUrl : '';
      const rawDets = Array.isArray(o.detections) ? o.detections : [];
      const restored = detectionsFromResume(rawDets as Array<{ bbox: [number, number, number, number]; class: string; score: number }>) as Det[];
      setMode('video');
      if (frameDataUrl) setImageUrl(frameDataUrl);
      setDetections(restored);
      setActiveIdx(restored.length ? 0 : null);
      const totals = o.sessionTotals && typeof o.sessionTotals === 'object'
        ? (o.sessionTotals as Record<string, number>)
        : {};
      setSessionClassTotals(totals);
      const frameCount = typeof o.frameCount === 'number' ? o.frameCount : 0;
      setVideoFrameResults(frameCount > 0 ? [{ timeMs: 0, count: restored.length, classes: Object.keys(countsByClass(restored)) }] : []);
      void (async () => {
        try {
          const thumb = frameDataUrl ? (await thumbnailFromImageUrl(frameDataUrl, 320)) ?? '' : '';
          setDetectionResultSnapshot({
            previewImage: thumb,
            resumePayload: JSON.stringify({
              v: 1,
              module: 'detection',
              mode: 'video',
              imageDataUrl: frameDataUrl || undefined,
              detections: restored.map((d) => ({
                bbox: d.bbox as [number, number, number, number],
                class: d.class ?? 'object',
                score: d.score ?? 0
              })),
              sessionTotals: totals,
              frameCount
            })
          });
        } catch {
          /* ignore */
        }
      })();
      return;
    }
    if (o.mode !== 'image' || typeof o.imageDataUrl !== 'string') return;
    setImageUrl(o.imageDataUrl);
    const rawDets = Array.isArray(o.detections) ? o.detections : [];
    const restored = detectionsFromResume(rawDets as { bbox: [number, number, number, number]; class: string; score: number }[]) as Det[];
    setDetections(restored);
    setActiveIdx(restored.length ? 0 : null);
    void (async () => {
      try {
        const full = o.imageDataUrl as string;
        const thumb = await thumbnailFromImageUrl(full, 320) ?? '';
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
    setSceneTags([]);
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
    setIsWebcamActive(false);
    const s = streamRef.current;
    if (s) s.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    const c = overlayRef.current;
    if (c) c.getContext('2d')?.clearRect(0, 0, c.width, c.height);
    setDetections([]);
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
      tl.to(proxy, { o: 1, duration: 0.42, ease: 'power2.out' }, i * 0.10);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, sorted, activeIdx]);

  const analyzeVideoFile = async (file: File) => {
    const m = await ensureModel();
    if (!m) return;
    bumpAnalysesCount(1);
    setIsAnalyzingVideo(true);
    setVideoProgress(0);
    setVideoFrameResults([]);
    setDetections([]);
    let videoThumb = '';
    let representativeFrameDataUrl = '';
    let representativeDets: Det[] = [];

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
    const totals: Record<string, number> = {};

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
        const dets = await m.detect(frameCanvas, 25, 0.2);
        const detCounts = countsByClass(dets as Det[]);
        for (const [cls, count] of Object.entries(detCounts)) {
          totals[cls] = (totals[cls] || 0) + count;
        }
        results.push({
          timeMs: Math.round(t * 1000),
          count: dets.length,
          classes: Object.keys(detCounts)
        });
        if (i === Math.floor(times.length / 2)) {
          setDetections(dets);
          const frameDataUrl = frameCanvas.toDataURL('image/jpeg', 0.7);
          setImageUrl(frameDataUrl);
          representativeFrameDataUrl = frameDataUrl;
          representativeDets = dets as Det[];
          try { videoThumb = await thumbnailFromDataUrl(frameDataUrl, 320); } catch { /* ignore */ }
          void (async () => {
            try {
              if (!mnetRef.current) mnetRef.current = await mobilenet.load({ version: 2, alpha: 1.0 });
              const preds = await mnetRef.current.classify(frameCanvas, 5);
              const tags = preds
                .map((p) => p.className.replace(/\bn\d+\s*/g, '').replace(/_/g, ' ').trim())
                .filter(Boolean)
                .slice(0, 3);
              setSceneTags(tags);
            } catch { /* non-critical */ }
          })();
        }
      } catch {
        results.push({ timeMs: Math.round(t * 1000), count: 0, classes: [] });
      }

      setVideoProgress(Math.round(((i + 1) / times.length) * 100));
    }

    URL.revokeObjectURL(url);
    setVideoFrameResults(results);
    setIsAnalyzingVideo(false);

    setSessionClassTotals(prev => {
      const next = { ...prev };
      Object.entries(totals).forEach(([k, v]) => { next[k] = (next[k] || 0) + v; });
      return next;
    });

    if (user && results.length > 0) {
      try {
        const totalObjects = results.reduce((s, r) => s + r.count, 0);
        if (!videoThumb && representativeFrameDataUrl) {
          try {
            videoThumb = await thumbnailFromDataUrl(representativeFrameDataUrl, 320);
          } catch {
            videoThumb = '';
          }
        }
        const payload = JSON.stringify({
          v: 1,
          module: 'detection',
          mode: 'video',
          imageDataUrl: representativeFrameDataUrl || undefined,
          detections: representativeDets.map((d) => ({
            bbox: d.bbox as [number, number, number, number],
            class: d.class ?? 'object',
            score: d.score ?? 0
          })),
          sessionTotals: totals,
          frameCount: results.length
        });
        setDetectionResultSnapshot({ previewImage: videoThumb, resumePayload: payload });
        await addHistoryEntry({
          kind: 'analysis',
          label: `Video Detection · ${results.length} frames, ${totalObjects} objects`,
          path: '/detection',
          previewImage: videoThumb || null,
          resumePayload: payload
        });
      } catch { /* ignore */ }
    }
  };

  const handleVideoFile = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.type.startsWith('video/')) return;
    void analyzeVideoFile(file);
  };

  const handleFiles = (files: FileList | null) => {
    const all = files ? Array.from(files) : [];
    if (all.length === 0) return;
    if (all.length > DET_FILE_LIMIT) setLimitWarning(true);
    const list = all.slice(0, DET_FILE_LIMIT);
    batchUrls.forEach((u) => URL.revokeObjectURL(u));
    const urls = list.map((f) => URL.createObjectURL(f));
    setBatchUrls(urls);
    setBatchIndex(0);
    setImageUrl(urls[0]);
    setDetections([]);
    setActiveIdx(null);
    setDetectionResultSnapshot(null);
    setBatchDetectionsMap({});
    setSessionClassTotals({});
    imageThumbnailRef.current = '';
    void thumbnailFromImageUrl(urls[0], 320).then((t) => { imageThumbnailRef.current = t ?? ''; });
    setStatus(
      list.length > 1
        ? `Batch: ${list.length} images — run detection or click "Detect batch"`
        : 'Image added — press Run detection'
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
      const drawProg = Math.min(1, op * 1.35);

      ctx.save();
      ctx.globalAlpha = op;
      const lineBoost = isActive ? pulse : 1;
      ctx.lineWidth = (isActive ? 3.2 : 2) * lineBoost;
      ctx.strokeStyle = col;

      const cornerLen = Math.min(sw, sh) * 0.28 * drawProg;
      ctx.beginPath();
      ctx.moveTo(sx, sy + cornerLen); ctx.lineTo(sx, sy); ctx.lineTo(sx + cornerLen, sy);
      ctx.moveTo(sx + sw - cornerLen, sy); ctx.lineTo(sx + sw, sy); ctx.lineTo(sx + sw, sy + cornerLen);
      ctx.moveTo(sx + sw, sy + sh - cornerLen); ctx.lineTo(sx + sw, sy + sh); ctx.lineTo(sx + sw - cornerLen, sy + sh);
      ctx.moveTo(sx + cornerLen, sy + sh); ctx.lineTo(sx, sy + sh); ctx.lineTo(sx, sy + sh - cornerLen);
      ctx.stroke();

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

  const logAnalysisHistory = async (dets: Det[]) => {
    if (!user) return;
    try {
      const img = imgRef.current;
      let thumb = imageThumbnailRef.current;
      let fullDataUrl = '';
      if (img && img.complete && img.naturalWidth > 0) {
        try {
          fullDataUrl = await dataUrlFromImageElement(img, 960, 0.82);
          if (!thumb) thumb = await thumbnailFromDataUrl(fullDataUrl, 320);
          imageThumbnailRef.current = thumb;
        } catch { /* ignore */ }
      }
      if (!fullDataUrl && imageUrl) {
        try {
          fullDataUrl = imageUrl.startsWith('data:') ? imageUrl : await blobUrlToDataUrl(imageUrl);
        } catch {
          fullDataUrl = '';
        }
      }
      if (!thumb && fullDataUrl) {
        try {
          thumb = await thumbnailFromDataUrl(fullDataUrl, 320);
          imageThumbnailRef.current = thumb;
        } catch {
          /* ignore */
        }
      }
      if (!thumb && imageUrl) {
        try {
          thumb = (await thumbnailFromImageUrl(imageUrl, 320)) ?? '';
          imageThumbnailRef.current = thumb;
        } catch {
          /* ignore */
        }
      }
      const detPayload = dets.map((d) => ({
        bbox: d.bbox as [number, number, number, number],
        class: d.class ?? 'object',
        score: d.score ?? 0
      }));
      const resume: MihResumeDetection = {
        v: 1, module: 'detection', mode: 'image',
        imageDataUrl: fullDataUrl,
        detections: detPayload
      };
      let resumeStr = JSON.stringify(resume);
      if (resumeStr.length > 1_450_000) {
        resume.imageDataUrl = '';
        resumeStr = JSON.stringify(resume);
      }
      setDetectionResultSnapshot({ previewImage: thumb, resumePayload: resumeStr });
      saveLastWorkbenchResume('/detection', resumeStr);
      await addHistoryEntry({
        kind: 'analysis',
        label: `Detection · ${dets.length} object${dets.length !== 1 ? 's' : ''}`,
        path: '/detection',
        previewImage: thumb || null,
        resumePayload: resumeStr
      });
    } catch { /* ignore */ }
  };

  const runImageDetection = async () => {
    if (!imageUrl || isRunning) return;
    setScanKey((k) => k + 1);
    setIsRunning(true);
    bumpAnalysesCount(1);
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
      const dets = (await m.detect(img, 25, 0.25)) as Det[];
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

      void (async () => {
        try {
          if (!mnetRef.current) mnetRef.current = await mobilenet.load({ version: 2, alpha: 1.0 });
          const preds = await mnetRef.current.classify(img, 5);
          const tags = preds
            .map((p) => p.className.replace(/\bn\d+\s*/g, '').replace(/_/g, ' ').trim())
            .filter(Boolean)
            .slice(0, 3);
          setSceneTags(tags);
        } catch { /* non-critical */ }
      })();
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
      setIsWebcamActive(true);
      setStatus('Live detection…');

      const tick = async (t: number) => {
        rafRef.current = requestAnimationFrame(tick);
        if (t - lastTickRef.current < 200) return;
        lastTickRef.current = t;
        if (!videoRef.current) return;
        if (videoRef.current.readyState < 2) return;
        try {
          const dets = (await m.detect(videoRef.current, 25, 0.35)) as Det[];
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
    bumpAnalysesCount(batchUrls.length);
    setIsRunning(true);
    const mergedBatch: Record<string, number> = {};
    const batchItems: Array<{ imageDataUrl: string; detections: Det[] }> = [];
    try {
      for (let i = 0; i < batchUrls.length; i += 1) {
        setBatchIndex(i);
        const url = batchUrls[i];
        setImageUrl(url);
        const sortedDets = await new Promise<Det[]>((resolve) => {
          const im = new Image();
          im.onload = async () => {
            try {
              const d = (await m.detect(im, 25, 0.25)) as Det[];
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
        setBatchDetectionsMap((prev) => ({ ...prev, [i]: sortedDets }));
        let itemImageDataUrl = '';
        try {
          itemImageDataUrl = url.startsWith('data:') ? url : await blobUrlToDataUrl(url);
        } catch {
          itemImageDataUrl = '';
        }
        if (!itemImageDataUrl) {
          itemImageDataUrl = imageUrl ?? '';
        }
        batchItems.push({
          imageDataUrl: itemImageDataUrl,
          detections: sortedDets
        });
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
      setStatus(`Batch processed: ${batchUrls.length} images`);
      if (user && batchUrls.length > 0) {
        const totalObjects = Object.values(mergedBatch).reduce((s, v) => s + v, 0);
        const firstItem = batchItems[0];
        const firstImageDataUrl = firstItem?.imageDataUrl ?? '';
        let thumb = '';
        if (firstImageDataUrl) {
          try {
            thumb = await thumbnailFromDataUrl(firstImageDataUrl, 320);
          } catch {
            thumb = '';
          }
        }
        const batchResume: MihResumeDetection = {
          v: 1,
          module: 'detection',
          mode: 'batch',
          items: batchItems.map((it) => ({
            imageDataUrl: it.imageDataUrl,
            detections: it.detections.map((d) => ({
              bbox: d.bbox as [number, number, number, number],
              class: d.class ?? 'object',
              score: d.score ?? 0
            }))
          })),
          batchMeta: {
            batchCount: batchItems.length,
            sessionTotals: mergedBatch
          }
        };
        const batchPayload = JSON.stringify(batchResume);
        setDetectionResultSnapshot({ previewImage: thumb, resumePayload: batchPayload });
        try {
          await addHistoryEntry({
            kind: 'analysis',
            label: `Batch Detection · ${batchUrls.length} images, ${totalObjects} objects`,
            path: '/detection',
            previewImage: thumb || null,
            resumePayload: batchPayload
          });
        } catch {
          /* ignore */
        }
      }
    } finally {
      setIsRunning(false);
    }
  };

  const goToBatchIndex = useCallback((idx: number) => {
    if (batchUrls.length === 0) return;
    const i = ((idx % batchUrls.length) + batchUrls.length) % batchUrls.length;
    setBatchIndex(i);
    const nextUrl = batchUrls[i];
    setImageUrl(nextUrl);
    imageThumbnailRef.current = '';
    void thumbnailFromImageUrl(nextUrl, 320).then((t) => {
      imageThumbnailRef.current = t ?? '';
    });
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

  const animatedCount = useCountUp(sorted.length);
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
    <div className="ocr-layout">
      <div className="ocr-header">
        <div className="ocr-header-left">
          <div className="ocr-header-title">Object Detection</div>
        </div>
        <div className="ocr-header-right">
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
          </div>
          {mode === 'image' ? (
            <>
              <button type="button" className="secondary-button" onClick={() => fileInputRef.current?.click()} title="Add images (multiple allowed)">
                ＋ Add
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={runImageDetection}
                disabled={!imageUrl || isRunning || isLoadingModel}
              >
                {isRunning ? 'Detecting…' : 'Detect'}
              </button>
              {batchUrls.length > 1 ? (
                <button
                  type="button"
                  className="primary-button det-btn--batch"
                  onClick={runBatchDetection}
                  disabled={isRunning || isLoadingModel}
                >
                  Detect batch
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
                <span className="det-status">Analysing… {videoProgress}%</span>
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
                : detections.length === 0 && videoFrameResults.length === 0 && Object.keys(sessionClassTotals).length === 0
            }
          >
            Clear
          </button>
          {user && detectionResultSnapshot ? (
            <FavoriteResultStar
              path="/detection"
              title={mode === 'video'
                ? `Video Detection · ${videoFrameResults.length} frames`
                : `Detection (${sorted.length})`}
              previewImage={detectionResultSnapshot.previewImage}
              resumePayload={detectionResultSnapshot.resumePayload}
            />
          ) : null}
        </div>
      </div>

      {isLoadingModel && (
        <div className="det-model-loading">
          <div className="det-model-loading-bar" />
          <span>Loading COCO-SSD model…</span>
        </div>
      )}

      {mode === 'image' && limitWarning ? (
        <div className="det-limit-warning" role="alert">
          Only the first {DET_FILE_LIMIT} images were loaded. To process more, clear and add a new batch.
          <button type="button" className="det-limit-warning__close" onClick={() => setLimitWarning(false)} aria-label="Dismiss">✕</button>
        </div>
      ) : null}

      {(mode === 'image' && batchUrls.length > 1) || (mode === 'image' && sorted.length > 0) ? (
        <div className="det-toolbar">
          {mode === 'image' && batchUrls.length > 1 ? (
            <div className="det-batch-nav">
              <span className="det-batch-label">
                Batch: {batchIndex + 1} / {batchUrls.length}
              </span>
              <button type="button" className="secondary-button" onClick={() => goToBatchIndex(batchIndex - 1)} title="Previous (M)">
                ←
              </button>
              <button type="button" className="secondary-button" onClick={() => goToBatchIndex(batchIndex + 1)} title="Next (N)">
                →
              </button>
              <span className="det-hint">keys N / M</span>
            </div>
          ) : null}
          {mode === 'image' && sorted.length > 0 ? (
            <div className="det-toolbar-tools">
              <button
                type="button"
                className="secondary-button"
                onClick={exportDetectionPng}
                disabled={!imageUrl}
                title="Export frame with bounding boxes"
              >
                Export PNG
              </button>
              {detections.length > 0 ? (
                <button type="button" className="secondary-button" onClick={handleExportJson}>
                  ↓ Export JSON
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className={`ocr-main ${showResults ? '' : 'ocr-main--no-results'}`}>
        <div className="ocr-left">
          <div
            className={`ocr-image-card${imageUrl || mode === 'webcam' ? ' ocr-image-card--has-media' : ''}`}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onClick={() => mode === 'image' && fileInputRef.current?.click()}
            style={{ cursor: mode === 'image' ? 'pointer' : 'default' }}
          >
            {mode === 'image' ? (
              imageUrl ? (
                <div className="det-stage">
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
                  {scanKey > 0 && <div key={scanKey} className="det-scan-sweep" />}
                  {isRunning && (
                    <div className="det-scan-grid">
                      {Array.from({ length: 24 }, (_, i) => <div key={i} className="det-scan-cell" />)}
                    </div>
                  )}
                </div>
              ) : (
                <div className="det-empty">
                  <div className="det-empty-title module-upload-empty-text">Click or drop an image</div>
                </div>
              )
            ) : mode === 'webcam' ? (
              <div className="det-stage">
                <video ref={videoRef} className="det-media det-media--webcam" playsInline muted />
                <canvas ref={overlayRef} className="det-overlay" />
              </div>
            ) : (
              imageUrl ? (
                <div className="det-stage">
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
                  <div className="det-empty-title module-upload-empty-text">Click to upload a video file</div>
                  <div className="det-empty-sub module-upload-empty-text">MP4, WebM, MOV and other formats</div>
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

        {showResults && (
          <div className="ocr-right det-results-panel">
            <div className="ocr-right-header">
              <span className="ocr-right-meta">
                Detected objects
                <span key={sorted.length} className="det-count-badge" style={{ marginLeft: '0.5rem' }}>{animatedCount} items</span>
              </span>
            </div>

            {sceneTags.length > 0 && (mode === 'image' || mode === 'video') ? (
              <div className="det-stats-block">
                <div className="det-stats-title">Scene analysis</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.35rem' }}>
                  {sceneTags.map((tag) => (
                    <span key={tag} className="det-scene-tag">{tag}</span>
                  ))}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>
                  MobileNet scene context — covers plants, buildings, interiors not in COCO-SSD
                </div>
              </div>
            ) : null}

            {classDistribution.length > 0 ? (
              <div className="det-stats-block">
                <div className="det-stats-title">Class distribution (frame)</div>
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
                <div className="det-stats-title">Session totals</div>
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
                  ? 'Waiting for detection…'
                  : sessionDistribution.length > 0
                    ? 'No detections on this frame. Select another image or run detection.'
                    : 'Results will appear after detection'}
              </div>
            ) : (
              <div className="det-list" key={imageRevealKey}>
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
        )}
      </div>

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
  );
}
