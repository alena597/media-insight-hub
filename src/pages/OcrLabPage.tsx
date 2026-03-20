import { useCallback, useRef, useState } from 'react';
import Tesseract from 'tesseract.js';
import { gsap } from 'gsap';

type OcrBlock = {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  confidence: number;
};

type OcrLang = 'eng' | 'ukr' | 'eng+ukr';

export function OcrLabPage() {
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

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageContainerRef = useRef<HTMLDivElement | null>(null);
  const laserRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const pushLog = (line: string) => {
    setLogLines((prev) => [...prev, line]);
  };

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    setShowResults(false);
    setBlocks([]);
    setText('');
    setStatus('Image loaded, ready for OCR');
    setWordsCount(0);
    setAvgConfidence(null);
    setLogLines([]);
    setImageSize(null);
    pushLog('[00:00.000] Image loaded, waiting for OCR...');
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
  };

  const runLaserAnimation = () => {
    if (!imageContainerRef.current || !laserRef.current) return;
    const container = imageContainerRef.current;
    const laser = laserRef.current;
    gsap.set(laser, { opacity: 1 });
    gsap.fromTo(
      laser,
      { y: -10 },
      {
        y: container.clientHeight + 10,
        duration: 1.6,
        ease: 'power2.inOut',
        repeat: 1
      }
    );
  };

  const handleRunOcr = useCallback(async () => {
    if (!imageUrl || isRunning) return;
    // Counts processing runs for the Dashboard
    try {
      const key = "mih_analyses_count";
      const cur = Number(localStorage.getItem(key) || "0");
      localStorage.setItem(key, String(cur + 1));
    } catch {
      // ignore (e.g., localStorage disabled)
    }
    // Ensure bbox scaling has correct natural dimensions even if image load raced OCR.
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

    const start = performance.now();
    try {
      const { data } = await Tesseract.recognize(imageUrl, langCode, {
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

      if (data.imageSize && data.imageSize.width && data.imageSize.height) {
        setImageSize({ width: data.imageSize.width, height: data.imageSize.height });
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
    } catch (e) {
      console.error(e);
      setStatus('OCR error');
      pushLog('[ERROR] OCR failed, check console.');
    } finally {
      setIsRunning(false);
    }
  }, [imageUrl, isRunning, lang]);

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
            <div className="ocr-header-subtitle">Text extraction · Tesseract.js</div>
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
                  const container = imageContainerRef.current;
                  const size = imageSize;
                  if (!container || !size) return null;
                  const scaleX = container.clientWidth / size.width;
                  const scaleY = container.clientHeight / size.height;
                  const left = b.bbox.x0 * scaleX;
                  const top = b.bbox.y0 * scaleY;
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
                <div className="ocr-image-placeholder-icon">⬆</div>
                <div className="ocr-image-placeholder-text">
                  Upload an image
                  <br />
                  PNG, JPG, WEBP
                </div>
              </div>
            )}
          </div>
          <button type="button" className="ocr-clear-btn" onClick={clearAll}>
            🔄 Clear
          </button>
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

          {showResults ? (
            <div className="ai-log" aria-live="polite">
              {logLines.slice(-12).map((l, idx) => (
                <div key={idx} className="ai-log-line">
                  {l}
                </div>
              ))}
              {logLines.length === 0 ? (
                <div className="ai-log-line">Operation log will appear after you run OCR.</div>
              ) : null}
            </div>
          ) : null}

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

