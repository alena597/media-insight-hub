import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Tesseract from 'tesseract.js';
import { gsap } from 'gsap';
import { useAuth } from '../hooks/useAuth';
import { FavoriteResultStar } from '../components/FavoriteResultStar';
import { dataUrlFromImageElement, thumbnailFromDataUrl, thumbnailFromImageUrl } from '../lib/imageData';
import { consumeResumeForPath } from '../lib/mihResumeBridge';
import { saveLastWorkbenchResume } from '../lib/lastWorkbenchSession';
import type { MihResumeOcr } from '../lib/mihResume';
import { addHistoryEntry } from '../lib/userDataApi';

type OcrBlock = {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  confidence: number;
};

type OcrLang = 'eng' | 'ukr' | 'eng+ukr';

/**
 * Сторінка OCR лабораторії для розпізнавання тексту з зображень.
 *
 * @description
 * Модуль реалізує повний цикл OCR обробки:
 * 1. Завантаження зображення через drag & drop або файловий діалог
 * 2. Анімація лазерного сканування через GSAP
 * 3. Розпізнавання тексту через Tesseract.js
 * 4. Відображення bounding boxes поверх зображення
 * 5. Виведення розпізнаного тексту з логом операцій
 *
 * Архітектурне рішення: bounding boxes масштабуються через
 * коефіцієнти scaleX/scaleY між натуральним розміром зображення
 * та відображуваним розміром контейнера.
 *
 * Лічильник аналізів зберігається у localStorage під ключем
 * `mih_analyses_count` для відображення на дашборді.
 *
 * @returns {JSX.Element} Сторінка OCR лабораторії
 */
export function OcrLabPage() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const resumeOnce = useRef(false);

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<OcrBlock[]>([]);
  const [text, setText] = useState('');
  const [, setStatus] = useState('Waiting for image');
  const [isRunning, setIsRunning] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [lang, setLang] = useState<OcrLang>('eng+ukr');
  const [wordsCount, setWordsCount] = useState(0);
  const [avgConfidence, setAvgConfidence] = useState<number | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [ocrResultSnapshot, setOcrResultSnapshot] = useState<{
    previewImage: string;
    resumePayload: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageContainerRef = useRef<HTMLDivElement | null>(null);
  const laserRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (resumeOnce.current) return;
    const st = location.state as { mihResume?: MihResumeOcr } | undefined;
    let r = st?.mihResume;
    if (!r || r.module !== 'ocr') {
      const bridged = consumeResumeForPath('/ocr');
      if (bridged && typeof bridged === 'object' && (bridged as MihResumeOcr).module === 'ocr') {
        r = bridged as MihResumeOcr;
      }
    }
    if (!r || r.module !== 'ocr') return;
    resumeOnce.current = true;
    navigate('/ocr', { replace: true, state: {} });
    setLang((r.lang === 'eng' || r.lang === 'ukr' || r.lang === 'eng+ukr' ? r.lang : 'eng+ukr') as OcrLang);
    setImageUrl(r.imageDataUrl);
    setBlocks(r.blocks);
    setText(r.text);
    setImageSize(r.imageSize);
    setShowResults(true);
    setWordsCount(
      r.text
        .split(/\s+/)
        .map((w) => w.trim())
        .filter(Boolean).length
    );
    if (r.blocks.length > 0) {
      const avg = r.blocks.reduce((sum, b) => sum + (b.confidence || 0), 0) / r.blocks.length;
      setAvgConfidence(avg);
    }
    void (async () => {
      try {
        const thumb = await thumbnailFromDataUrl(r.imageDataUrl, 320);
        const payload: MihResumeOcr = {
          v: 1,
          module: 'ocr',
          lang: r.lang,
          imageDataUrl: r.imageDataUrl,
          text: r.text,
          blocks: r.blocks,
          imageSize: r.imageSize
        };
        setOcrResultSnapshot({ previewImage: thumb, resumePayload: JSON.stringify(payload) });
      } catch {
        /* ignore */
      }
    })();
  }, [location.state, navigate]);

  const pushLog = (line: string) => {
    setLogLines((prev) => [...prev, line]);
  };

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    setOcrResultSnapshot(null);
    setShowResults(false);
    setBlocks([]);
    setText('');
    setStatus('Image loaded, ready for OCR');
    setWordsCount(0);
    setAvgConfidence(null);
    setLogLines([]);
    setImageSize(null);
    pushLog('[00:00.000] Image loaded, waiting for OCR...');
    // Зберігаємо лише мінімальний стан сесії 
    if (user) {
      void (async () => {
        try {
          const thumb = await thumbnailFromImageUrl(url, 320);
          if (thumb) {
            const langCode: string = lang === 'eng+ukr' ? 'eng+ukr' : lang;
            const minimal: MihResumeOcr = {
              v: 1,
              module: 'ocr',
              lang: langCode,
              imageDataUrl: thumb,
              text: '',
              blocks: [],
              imageSize: { width: 1, height: 1 }
            };
            saveLastWorkbenchResume('/ocr', JSON.stringify(minimal));
          }
        } catch {
          /* ignore */
        }
      })();
    }
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    handleFiles(e.dataTransfer.files);
  };

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const clearAll = () => {
    setImageUrl(null);
    setBlocks([]);
    setText('');
    setShowResults(false);
    setStatus('Waiting for image');
    setWordsCount(0);
    setAvgConfidence(null);
    setLogLines([]);
    setOcrResultSnapshot(null);
  };

  /**
   * Обчислює фактичний прямокутник контенту зображення всередині box-у з object-fit: contain.
   */
  const getImageRenderRect = (): { contentW: number; contentH: number; offsetX: number; offsetY: number } | null => {
    const img = imgRef.current;
    const size = imageSize;
    if (!img || !size || !img.clientWidth || !img.clientHeight) return null;
    const boxW = img.clientWidth;
    const boxH = img.clientHeight;
    const natAspect = size.width / size.height;
    const boxAspect = boxW / boxH;
    let contentW: number, contentH: number, offsetX: number, offsetY: number;
    if (natAspect > boxAspect) {
      contentW = boxW;
      contentH = boxW / natAspect;
      offsetX = 0;
      offsetY = (boxH - contentH) / 2;
    } else {
      contentH = boxH;
      contentW = boxH * natAspect;
      offsetX = (boxW - contentW) / 2;
      offsetY = 0;
    }
    return { contentW, contentH, offsetX, offsetY };
  };

  const runLaserAnimation = () => {
    if (!imageContainerRef.current || !laserRef.current) return;
    const laser = laserRef.current;
    const rect = getImageRenderRect();
    const img = imgRef.current;
    const startY = rect ? rect.offsetY : 0;
    const endY = rect ? rect.offsetY + rect.contentH : (img?.clientHeight ?? imageContainerRef.current.clientHeight);
    gsap.set(laser, { opacity: 1, top: startY, y: 0 });
    gsap.fromTo(
      laser,
      { top: startY },
      {
        top: endY,
        duration: 1.6,
        ease: 'power2.inOut',
        repeat: 1
      }
    );
  };

  
  /**
 * Запускає процес OCR розпізнавання тексту на завантаженому зображенні.
 *
 * @description
 * Функція ініціалізує Tesseract.js движок, запускає анімацію лазерного
 * сканування та виконує розпізнавання тексту. Після завершення оновлює
 * стан компонента з результатами: розпізнаний текст, bounding boxes,
 * кількість слів та середній confidence score.
 *
 * @returns {Promise<void>} Проміс який вирішується після завершення OCR
 *
 * @example
 * // Викликається при натисканні кнопки "Run OCR"
 * <button onClick={handleRunOcr}>Run OCR</button>
 */
  const handleRunOcr = useCallback(async () => {
    if (!imageUrl || isRunning) return;
    const el = imgRef.current;
    if (el?.naturalWidth && el?.naturalHeight) {
      setImageSize({ width: el.naturalWidth, height: el.naturalHeight });
    }
    setShowResults(true);
    setIsRunning(true);
    setBlocks([]);
    setText('');
    setWordsCount(0);
    setAvgConfidence(null);
    setLogLines([]);

    const langCode: string = lang === 'eng+ukr' ? 'eng+ukr' : lang;
    setStatus(`Loading model (${langCode})...`);
    pushLog('[00:00.000] Initializing Tesseract engine...');

    runLaserAnimation();

    // Препроцесинг: підвищуємо контрастність та масштабуємо дрібні зображення
    // Це значно покращує розпізнавання символів (особливо I/T, O/0 тощо)
    const buildProcessedUrl = (): string => {
      const img = imgRef.current;
      if (!img || !img.naturalWidth || !img.naturalHeight) return imageUrl;
      const nw = img.naturalWidth;
      const nh = img.naturalHeight;
      // Масштабуємо до мінімум 1500px по більшій стороні для кращого DPI
      const scale = Math.max(1, Math.min(4, 1500 / Math.max(nw, nh)));
      const cw = Math.round(nw * scale);
      const ch = Math.round(nh * scale);
      const canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext('2d');
      if (!ctx) return imageUrl;
      // Малюємо збільшене зображення з підвищеним контрастом
      ctx.filter = 'grayscale(100%) contrast(1.5) brightness(1.05)';
      ctx.drawImage(img, 0, 0, cw, ch);
      return canvas.toDataURL('image/png');
    };
    const processedUrl = buildProcessedUrl();

    const start = performance.now();
    try {
      const { data } = await Tesseract.recognize(processedUrl, langCode, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            const progress = Math.round(m.progress * 100);
            setStatus(`Recognizing text: ${progress}%`);
          }
        }
      });

      const elapsed = (performance.now() - start) / 1000;
      const blocksData: OcrBlock[] =
        data.blocks?.map((b) => ({
          text: b.text,
          bbox: { x0: b.bbox.x0, y0: b.bbox.y0, x1: b.bbox.x1, y1: b.bbox.y1 },
          confidence: b.confidence ?? 0
        })) ?? [];

        const dataWithSize = data as typeof data & { imageSize?: { width: number; height: number } };
if (dataWithSize.imageSize?.width && dataWithSize.imageSize?.height) {
  setImageSize({ width: dataWithSize.imageSize.width, height: dataWithSize.imageSize.height });
}

      setBlocks(blocksData);
      setText(data.text);

      const words = data.text
        .split(/\s+/)
        .map((w) => w.trim())
        .filter(Boolean);
      setWordsCount(words.length);

      if (blocksData.length > 0) {
        const avg =
          blocksData.reduce((sum, b) => sum + (b.confidence || 0), 0) / blocksData.length;
        setAvgConfidence(avg);
      }

      setStatus(`Done in ${elapsed.toFixed(1)} s, blocks: ${blocksData.length}`);
      pushLog(
        `[${elapsed.toFixed(3)}] OCR finished, ${blocksData.length} blocks, ${words.length} words.`
      );

      requestAnimationFrame(() => {
        gsap.from('.ocr-bbox', {
          opacity: 0,
          scale: 0.9,
          duration: 0.4,
          stagger: 0.02
        });
      });

      const sizeForPayload =
        dataWithSize.imageSize?.width && dataWithSize.imageSize?.height
          ? { width: dataWithSize.imageSize.width, height: dataWithSize.imageSize.height }
          : el && el.naturalWidth
            ? { width: el.naturalWidth, height: el.naturalHeight }
            : { width: 1, height: 1 };

      void (async () => {
        if (!user || !imgRef.current) return;
        try {
          const full = await dataUrlFromImageElement(imgRef.current);
          const thumb = await thumbnailFromDataUrl(full, 320);
          const payload: MihResumeOcr = {
            v: 1,
            module: 'ocr',
            lang: langCode,
            imageDataUrl: full,
            text: data.text,
            blocks: blocksData,
            imageSize: sizeForPayload
          };
          const s = JSON.stringify(payload);
          if (s.length < 1_450_000) {
            setOcrResultSnapshot({ previewImage: thumb, resumePayload: s });
            saveLastWorkbenchResume('/ocr', s);
            await addHistoryEntry({
              kind: 'analysis',
              label: `OCR · ${words.length} слів`,
              path: '/ocr',
              previewImage: thumb,
              resumePayload: s
            });
          }
        } catch {
          /* ignore */
        }
      })();
    } catch (e) {
      console.error(e);
      setStatus('OCR error');
      pushLog('[ERROR] OCR failed, check console.');
    } finally {
      setIsRunning(false);
    }
  }, [imageUrl, isRunning, lang, user]);

  /** Завантажує результати OCR у форматі JSON. */
  const handleExportJson = () => {
    const data = {
      module: 'ocr',
      exportedAt: new Date().toISOString(),
      language: lang,
      text,
      wordsCount,
      avgConfidence,
      blocks: blocks.map(b => ({
        text: b.text,
        confidence: b.confidence,
        bbox: b.bbox
      }))
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ocr-result-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setIsCopied(true);
      window.setTimeout(() => setIsCopied(false), 1200);
    } catch (e) {
      console.error(e);
    }
  }; 

  return (
    <div className="ocr-layout">
      <div className="ocr-header">
        <div className="ocr-header-left">
          <div>
            <div className="ocr-header-title">OCR</div>
          </div>
        </div>
        <div className="ocr-header-right">
          <div className="lang-switch">
            <button
              type="button"
              className={`lang-chip ${lang === 'eng' ? 'lang-chip--active' : ''}`}
              onClick={() => setLang('eng')}
            >
              English
            </button>
            <button
              type="button"
              className={`lang-chip ${lang === 'ukr' ? 'lang-chip--active' : ''}`}
              onClick={() => setLang('ukr')}
            >
              Ukrainian
            </button>
            <button
              type="button"
              className={`lang-chip ${lang === 'eng+ukr' ? 'lang-chip--active' : ''}`}
              onClick={() => setLang('eng+ukr')}
            >
              Auto (EN+UK)
            </button>
          </div>
          <button
            type="button"
            className="primary-button"
            onClick={handleRunOcr}
            disabled={!imageUrl || isRunning}
          >
            {isRunning ? 'Recognizing…' : '⚡ Run OCR'}
          </button>
          {showResults && text ? (
            <button type="button" className="secondary-button" onClick={handleExportJson}>
              ↓ Export JSON
            </button>
          ) : null}
          <button
            type="button"
            className="secondary-button"
            onClick={clearAll}
            disabled={!imageUrl && !text}
          >
            Clear
          </button>
        </div>
      </div>

      <div className={`ocr-main ${showResults ? '' : 'ocr-main--no-results'}`}>
        <div className="ocr-left">
          <div
            className="ocr-image-card"
            onDrop={onDrop}
            onDragOver={onDragOver}
            onClick={() => fileInputRef.current?.click()}
          >
            {user && ocrResultSnapshot && text ? (
              <div className="mih-fav-star-host" onClick={(e) => e.stopPropagation()}>
                <FavoriteResultStar
                  path="/ocr"
                  title={`OCR · ${text.slice(0, 48)}${text.length > 48 ? '…' : ''}`}
                  previewImage={ocrResultSnapshot.previewImage}
                  resumePayload={ocrResultSnapshot.resumePayload}
                />
              </div>
            ) : null}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => handleFiles(e.target.files)}
            />
            {imageUrl ? (
              <div ref={imageContainerRef} className="ocr-image-inner">
                <img
                  ref={imgRef}
                  src={imageUrl}
                  alt="OCR source"
                  className="ocr-image"
                  onLoad={() => {
                    const el = imgRef.current;
                    if (!el) return;
                    const nw = el.naturalWidth || el.width;
                    const nh = el.naturalHeight || el.height;
                    if (nw && nh) setImageSize({ width: nw, height: nh });
                  }}
                />
                <div ref={laserRef} className="ocr-laser" />
                {blocks.map((b, idx) => {
                  const rect = getImageRenderRect();
                  if (!rect) return null;
                  const { contentW, contentH, offsetX, offsetY } = rect;
                  const scaleX = contentW / (imageSize?.width ?? 1);
                  const scaleY = contentH / (imageSize?.height ?? 1);
                  const left = b.bbox.x0 * scaleX + offsetX;
                  const top = b.bbox.y0 * scaleY + offsetY;
                  const width = (b.bbox.x1 - b.bbox.x0) * scaleX;
                  const height = (b.bbox.y1 - b.bbox.y0) * scaleY;
                  return (
                    <div
                      key={idx}
                      className="ocr-bbox"
                      style={{ left, top, width, height }}
                      title={`${b.text.trim()} (${b.confidence.toFixed(1)}%)`}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="ocr-image-placeholder">
                <div className="ocr-image-placeholder-text">
                  Click or drop an image
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="ocr-right">
          <div className="ocr-right-header">
            <span className="ocr-right-meta">
              Words: {wordsCount} · Avg. confidence:{' '}
              {avgConfidence !== null ? `${avgConfidence.toFixed(1)}%` : '—'}
            </span>
            <button
              type="button"
              className={`secondary-button ${isCopied ? "ocr-copy--done" : ""}`}
              onClick={handleCopy}
              disabled={!text}
            >
              {isCopied ? "Copied" : "Copy"}
            </button>
          </div>
          {showResults && isRunning ? <div className="ocr-right-loading">Recognizing…</div> : null}

          {text ? (
            <>
              <div className="ocr-text-box">
                {text.split('\n').map((line, idx) => (
                  <div key={idx} className="ocr-text-line">
                    {line}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="ocr-right-empty">
              <div className="ocr-right-empty-icon">🔍</div>
              <div className="ocr-right-empty-text">Upload an image and run OCR</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

