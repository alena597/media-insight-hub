import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import * as mobilenet from '@tensorflow-models/mobilenet';
import '@tensorflow/tfjs';
import { gsap } from 'gsap';
import { useAuth } from '../hooks/useAuth';
import { blobUrlToDataUrl, thumbnailFromDataUrl, thumbnailFromImageUrl } from '../lib/imageData';
import { consumeResumeForPath } from '../lib/mihResumeBridge';
import { saveLastWorkbenchResume } from '../lib/lastWorkbenchSession';
import type { MihResumeGallery } from '../lib/mihResume';
import { addHistoryEntry } from '../lib/userDataApi';
import { FavoriteResultStar } from '../components/FavoriteResultStar';
import '../theme/sg.css';

type CategoryKey =
  | 'people'
  | 'animals'
  | 'tech'
  | 'clothing'
  | 'interior'
  | 'furniture'
  | 'nature'
  | 'transport'
  | 'food'
  | 'tableware'
  | 'other';

type GalleryItem = {
  id: string;
  fileName: string;
  url: string;
  category: CategoryKey;
  predictions: Array<{ className: string; probability: number }>;
};

const CATEGORY_LABELS: Record<CategoryKey, string> = {
  people: 'People',
  animals: 'Animals',
  tech: 'Tech',
  clothing: 'Clothing',
  interior: 'Interior',
  furniture: 'Furniture',
  nature: 'Nature',
  transport: 'Transport',
  food: 'Food',
  tableware: 'Tableware',
  other: 'Other'
};

const CATEGORY_ORDER: CategoryKey[] = [
  'people',
  'animals',
  'tech',
  'clothing',
  'interior',
  'furniture',
  'nature',
  'transport',
  'food',
  'tableware',
  'other'
];

/**
 * Розбиває рядок на окремі слова для точного порівняння (без помилкових підрядкових збігів).
 *
 * @param s - Вхідний рядок.
 * @returns Масив слів.
 */
function words(s: string): string[] {
  return s.split(/[\s,]+/).filter(Boolean);
}

/**
 * Перевіряє, чи містить масив токенів хоча б одне з ключових слів.
 *
 * @param tokens - Масив токенів рядка.
 * @param keywords - Ключові слова для пошуку.
 * @returns true, якщо знайдено збіг.
 */
function hasWord(tokens: string[], keywords: string[]): boolean {
  return keywords.some((k) => {
    if (k.includes(' ')) return s_includes(tokens.join(' '), k);
    return tokens.includes(k);
  });
}

/**
 * Перевіряє входження підрядка у рядок.
 *
 * @param str - Рядок для пошуку.
 * @param sub - Підрядок.
 * @returns true, якщо підрядок знайдено.
 */
function s_includes(str: string, sub: string): boolean {
  return str.includes(sub);
}

/**
 * Маппує назву класу ImageNet на категорію проєкту.
 *
 * @description
 * Функція нормалізує назву класу (видаляє ID, замінює підкреслення)
 * та порівнює з ключовими словами кожної категорії.
 * Категорії перевіряються у визначеному пріоритеті: people → tech →
 * clothing → interior → animals → furniture → nature → transport →
 * tableware → food → other.
 *
 * @param topClass - Назва класу з моделі MobileNet (наприклад 'n02123045 tabby cat').
 * @param fallbackClasses - Додаткові класи для запасної перевірки.
 * @returns Ключ категорії проєкту.
 */
function mapLabelToCategory(topClass: string, fallbackClasses?: string): CategoryKey {
  const normalize = (s: string) =>
    s.replace(/\bn\d+\s*/g, '').replace(/_/g, ' ').toLowerCase().trim();

  const checkTokens = (raw: string): CategoryKey => {
    const l = normalize(raw);
    const tok = words(l);

    // ── Посуд / кухонне приладдя (перевіряємо РАНІШЕ за одяг і транспорт) ──
    const tableware = [
      'plate', 'bowl', 'cup', 'mug', 'saucer', 'teapot', 'coffeepot', 'goblet',
      'pitcher', 'ladle', 'spoon', 'fork', 'knife', 'dish', 'platter', 'skillet',
      'wok', 'kettle', 'consomme', 'mortar', 'tray', 'casserole', 'colander',
      'strainer', 'spatula', 'whisk', 'grater', 'corkscrew', 'can opener',
      'measuring cup', 'mixing bowl', 'punch bowl', 'soup bowl', 'serving dish',
      'chopsticks', 'saltshaker', 'pepper', 'vinegar'
    ];
    // "pot" і "pan" мають коротку форму — перевіряємо окремим словом
    if (tok.includes('pot') || tok.includes('pan') || tok.includes('wok') ||
        tok.includes('bottle') || tok.includes('wine') || tok.includes('beer') ||
        tok.includes('glass') || hasWord(tok, tableware)) return 'tableware';

    // ── Їжа / напої ──
    const food = [
      'pizza', 'burger', 'sandwich', 'apple', 'banana', 'cake', 'orange', 'lemon',
      'grape', 'strawberry', 'pear', 'peach', 'pineapple', 'watermelon', 'broccoli',
      'cabbage', 'carrot', 'potato', 'tomato', 'cucumber', 'lettuce', 'mushroom',
      'coffee', 'espresso', 'milk', 'juice', 'donut', 'bagel', 'croissant',
      'pretzel', 'soup', 'stew', 'salad', 'omelette', 'chocolate', 'candy',
      'guacamole', 'burrito', 'cheeseburger', 'hotdog', 'spaghetti', 'waffle',
      'mango', 'pomegranate', 'corn', 'artichoke', 'cauliflower', 'asparagus',
      'fruit', 'bread', 'cheese', 'egg', 'taco', 'sushi', 'noodle', 'rice',
      'meat', 'beef', 'pork', 'chicken', 'fish', 'shrimp', 'lobster', 'crab',
      'ice cream', 'french fries', 'mashed potato', 'bell pepper', 'tea'
    ];
    if (hasWord(tok, food)) return 'food';

    // ── Люди ──
    const people = [
      'person', 'man', 'woman', 'boy', 'girl', 'people', 'face', 'bride',
      'child', 'adult', 'soldier', 'athlete', 'diver', 'player', 'cowboy'
    ];
    if (hasWord(tok, people)) return 'people';

    // ── Техніка / електроніка ──
    const tech = [
      'laptop', 'computer', 'screen', 'monitor', 'keyboard', 'phone', 'camera',
      'television', 'printer', 'modem', 'disk', 'projector', 'cellular',
      'handset', 'radio', 'microscope', 'oscilloscope', 'clock', 'atm',
      'remote control', 'television', 'vcr', 'ipod'
    ];
    if (tok.includes('tv') || tok.includes('watch') || tok.includes('lens') ||
        hasWord(tok, tech)) return 'tech';

    // ── Одяг ──
    const clothing = [
      'jean', 'denim', 'jersey', 'sweater', 'sweatshirt', 'hoodie', 'jacket',
      'kimono', 'cardigan', 'sandal', 'sneaker', 'gown', 'pajama', 'bikini',
      'miniskirt', 'stole', 'sarong', 'poncho', 'cloak', 'apron'
    ];
    // короткі слова перевіряємо точно (окремим токеном)
    if (tok.includes('coat') || tok.includes('suit') || tok.includes('tie') ||
        tok.includes('skirt') || tok.includes('dress') || tok.includes('sock') ||
        tok.includes('shoe') || tok.includes('boot') || tok.includes('hat') ||
        tok.includes('cap') || tok.includes('helmet') || tok.includes('t-shirt') ||
        tok.includes('bow') || hasWord(tok, clothing)) return 'clothing';

    // ── Інтер'єр ──
    const interior = [
      'living room', 'bedroom', 'bathroom', 'dining room', 'home theater',
      'interior', 'cabinetry', 'cupboard', 'closet', 'fireplace', 'wardrobe'
    ];
    if (tok.includes('room') || tok.includes('wall') || tok.includes('ceiling') ||
        tok.includes('floor') || tok.includes('apartment') || tok.includes('house') ||
        tok.includes('studio') || hasWord(tok, interior)) return 'interior';

    // ── Тварини ──
    const animals = [
      'cat', 'dog', 'puppy', 'kitten', 'animal', 'bird', 'horse', 'cow', 'sheep',
      'zebra', 'giraffe', 'elephant', 'lion', 'tiger', 'panda', 'wolf', 'fox',
      'rabbit', 'hamster', 'squirrel', 'monkey', 'gorilla', 'chimp', 'poodle',
      'retriever', 'terrier', 'tabby', 'siamese', 'persian', 'egyptian',
      'jellyfish', 'goldfish', 'snail', 'turtle', 'lizard', 'snake', 'crocodile',
      'lynx', 'cheetah', 'deer', 'pig', 'bison', 'flamingo', 'penguin', 'swan',
      'duck', 'parrot', 'eagle', 'owl', 'bear', 'ox'
    ];
    if (hasWord(tok, animals)) return 'animals';

    // ── Меблі ──
    const furniture = [
      'chair', 'sofa', 'couch', 'desk', 'shelf', 'studio couch', 'folding chair',
      'barber chair', 'armchair', 'throne', 'bookshelf', 'filing cabinet',
      'table lamp', 'floor lamp', 'bureau', 'pillow', 'mattress', 'ottoman',
      'footstool', 'refrigerator', 'stove', 'microwave', 'oven', 'bookcase',
      'lamp', 'chiffonier', 'washbasin', 'toilet', 'bathtub', 'shower', 'counter'
    ];
    if (tok.includes('table') || tok.includes('bed') || tok.includes('cabinet') ||
        tok.includes('wardrobe') || tok.includes('chest') || tok.includes('kitchen') ||
        hasWord(tok, furniture)) return 'furniture';

    // ── Природа ──
    const nature = [
      'tree', 'flower', 'mountain', 'beach', 'river', 'forest', 'lake', 'ocean',
      'cliff', 'valley', 'volcano', 'coral', 'leaf', 'branch', 'grass', 'bush',
      'palm', 'sunflower', 'rose', 'daisy', 'tulip', 'orchid', 'dandelion',
      'fern', 'willow', 'maple', 'oak', 'pine', 'snow', 'ice', 'waterfall',
      'sea', 'sky', 'cloud', 'sand', 'rock', 'stone', 'mushroom', 'strawberry'
    ];
    if (hasWord(tok, nature)) return 'nature';

    // ── Транспорт (після їжі/посуду, щоб уникнути wagon/gondola плутанини) ──
    const transport = [
      'bicycle', 'motorcycle', 'airplane', 'train', 'ambulance', 'fire engine',
      'taxi', 'minivan', 'limousine', 'tractor', 'forklift', 'lifeboat',
      'canoe', 'yacht', 'airship', 'helicopter', 'locomotive', 'streetcar',
      'convertible', 'scooter', 'submarine', 'trolleybus', 'sports car',
      'pickup truck', 'freight car', 'school bus', 'minibus'
    ];
    // короткі слова транспорту — точні токени
    if (tok.includes('car') || tok.includes('bus') || tok.includes('truck') ||
        tok.includes('boat') || tok.includes('ship') || tok.includes('jet') ||
        tok.includes('suv') || tok.includes('balloon') || tok.includes('trolley') ||
        hasWord(tok, transport)) return 'transport';

    return 'other';
  };

  // Спочатку перевіряємо тільки топ-клас (найточніший результат моделі)
  const primary = checkTokens(topClass);
  if (primary !== 'other') return primary;
  // Якщо не визначено — використовуємо резервні класи
  return fallbackClasses ? checkTokens(fallbackClasses) : 'other';
}

/**
 * Повертає відсоток впевненості для першого прогнозу елемента галереї.
 *
 * @param {GalleryItem} item - Елемент галереї з результатами класифікації
 * @returns {number | null} Відсоток впевненості (0-100) або null якщо прогнозів немає
 *
 * @example
 * getConfidencePct({ predictions: [{ probability: 0.87 }] }) // повертає 87
 * getConfidencePct({ predictions: [] })                       // повертає null
 */
function getConfidencePct(item: GalleryItem): number | null {
  if (!item.predictions || item.predictions.length === 0) return null;
  return Math.round(item.predictions[0].probability * 100);
}

/**
 * Головний компонент сторінки "Розумна галерея".
 * 
 * @description
 * Дозволяє користувачам завантажувати до 20 зображень, класифікувати їх 
 * за допомогою моделі MobileNet v2 та переглядати результати, 
 * відфільтровані за категоріями.
 * 
 * @returns {JSX.Element} Елемент сторінки галереї
 */
export function SmartGalleryPage() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const resumeOnce = useRef(false);

  const [model, setModel] = useState<mobilenet.MobileNet | null>(null);
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [status, setStatus] = useState('Model not loaded yet');
  const [isLoadingModel, setIsLoadingModel] = useState(false);
  const [isClassifying, setIsClassifying] = useState(false);
  const [analysisStarted, setAnalysisStarted] = useState(false);
  const [sgResultSnapshot, setSgResultSnapshot] = useState<{ previewImage: string; resumePayload: string } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (resumeOnce.current) return;
    const st = location.state as { mihResume?: MihResumeGallery } | undefined;
    let r = st?.mihResume;
    if (!r || r.module !== 'gallery') {
      const bridged = consumeResumeForPath('/gallery');
      if (bridged && typeof bridged === 'object' && (bridged as MihResumeGallery).module === 'gallery') {
        r = bridged as MihResumeGallery;
      }
    }
    if (!r || r.module !== 'gallery') return;
    resumeOnce.current = true;
    navigate('/gallery', { replace: true, state: {} });
    const restored: GalleryItem[] = r.items.map((it) => ({
      id: it.id,
      fileName: it.fileName,
      url: it.imageDataUrl,
      category: it.category as CategoryKey,
      predictions: it.predictions
    }));
    setItems(restored);
  }, [location.state, navigate]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (model || isLoadingModel) return;
      setIsLoadingModel(true);
      setStatus('Loading MobileNet v2 model...');
      try {
        const loaded = await mobilenet.load({ version: 2, alpha: 1.0 });
        if (!cancelled) {
          setModel(loaded);
          setStatus('Model ready');
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) setStatus('Load error');
      } finally {
        if (!cancelled) setIsLoadingModel(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [model, isLoadingModel]);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const slice = Array.from(files).slice(0, 20);
    const newItems: GalleryItem[] = slice.map((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
      fileName: file.name,
      url: URL.createObjectURL(file),
      category: 'other',
      predictions: []
    }));
    setItems((prev) => [...prev, ...newItems]);
    setAnalysisStarted(false);
    if (!activeItemId && newItems[0]) setActiveItemId(newItems[0].id);
    setStatus(`Added: ${newItems.length}`);
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  };

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const openFilePicker = () => fileInputRef.current?.click();

  const clearAll = () => {
    setItems([]);
    setActiveItemId(null);
    setAnalysisStarted(false);
    setStatus('Gallery is empty');
    setSgResultSnapshot(null);
  };

  const removeItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setItems((prev) => {
      const next = prev.filter((i) => i.id !== id);
      if (activeItemId === id) setActiveItemId(next[0]?.id ?? null);
      return next;
    });
  };

  const ensureModel = async (): Promise<mobilenet.MobileNet> => {
    if (model) return model;
    setStatus('Loading MobileNet v2 model...');
    const loaded = await mobilenet.load({ version: 2, alpha: 1.0 });
    setModel(loaded);
    setStatus('Model ready');
    return loaded;
  };

  const classifyAll = async () => {
    if (items.length === 0 || isClassifying) return;
    setAnalysisStarted(true);
    setIsClassifying(true);
    const m = await ensureModel();
    setStatus('Classifying...');
    const start = performance.now();
    const updated: GalleryItem[] = [];
    let classificationError = false;
    for (const item of items) {
      try {
        const img = new Image();
        if (!item.url.startsWith('blob:')) img.crossOrigin = 'anonymous';
        img.src = item.url;
        await new Promise((resolve, reject) => {
          img.onload = () => resolve(null);
          img.onerror = reject;
        });
        const predictions = await m.classify(img, 5);
        const getLabel = (p: { className?: string; name?: string }) =>
          (p && (p.className ?? (p as { name?: string }).name)) || '';
        const topClass = getLabel(predictions[0] ?? {});
        const fallback = predictions.slice(1, 3).map(getLabel).join(' ');
        const category = mapLabelToCategory(topClass, fallback);
        updated.push({ ...item, predictions, category });
      } catch (e) {
        console.error(e);
        if (!classificationError) {
          classificationError = true;
          setStatus('Classification error for some images');
        }
        updated.push({ ...item, predictions: [], category: 'other' });
      }
    }
    const elapsed = (performance.now() - start) / 1000;
    setItems(updated);
    setStatus(`Done in ${elapsed.toFixed(1)} s`);
    requestAnimationFrame(() => {
      if (!containerRef.current) return;
      const cards = containerRef.current.querySelectorAll('.sg-card');
      gsap.from(cards, { opacity: 0, y: 20, duration: 0.4, stagger: 0.02, ease: 'power2.out' });
    });
    setIsClassifying(false);

    if (user && updated.length > 0) {
      void (async () => {
        try {
          const thumb = await thumbnailFromImageUrl(updated[0].url, 320);
          const itemsSmall: MihResumeGallery['items'] = [];
          for (const it of updated) {
            try {
              const raw = await blobUrlToDataUrl(it.url);
              const compressed = await thumbnailFromDataUrl(raw, 320);
              itemsSmall.push({
                id: it.id,
                fileName: it.fileName,
                imageDataUrl: compressed,
                category: it.category,
                predictions: it.predictions
              });
            } catch {
              /* skip */
            }
          }
          const payload: MihResumeGallery = { v: 1, module: 'gallery', items: itemsSmall };
          const s = JSON.stringify(payload);
          setSgResultSnapshot({ previewImage: thumb ?? '', resumePayload: s });
          if (s.length < 1_450_000) {
            saveLastWorkbenchResume('/gallery', s);
            await addHistoryEntry({
              kind: 'analysis',
              label: `Галерея · ${updated.length} зображ.`,
              path: '/gallery',
              previewImage: thumb ?? undefined,
              resumePayload: s
            });
          }
        } catch {
          /* ignore */
        }
      })();
    }
  };

  /** Завантажує результати класифікації галереї у форматі JSON. */
  const handleExportJson = () => {
    const data = {
      module: 'smart-gallery',
      exportedAt: new Date().toISOString(),
      totalImages: items.length,
      images: items.map(img => ({
        name: img.fileName,
        category: img.category,
        topPredictions: img.predictions.slice(0, 5).map(p => ({
          className: p.className,
          probability: p.probability
        }))
      }))
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gallery-result-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const selected = items.find((i) => i.id === activeItemId) ?? null;

  const byCategory = new Map<CategoryKey, GalleryItem[]>();
  CATEGORY_ORDER.forEach((key) => byCategory.set(key, []));
  items.forEach((it) => {
    const list = byCategory.get(it.category);
    if (list) list.push(it);
  });

  const categoriesWithItems = CATEGORY_ORDER.filter((key) => (byCategory.get(key)?.length ?? 0) > 0);
  const hasAnyClassified = items.some((it) => it.predictions && it.predictions.length > 0);
  const showUnclassifiedOnly = items.length > 0 && !hasAnyClassified;

  return (
    <div className="sg-layout">
      <header className="sg-header">
        <div className="sg-header-left">
          <div className="sg-header-title">Smart Gallery</div>
        </div>
        <div className="sg-header-right">
          {user && hasAnyClassified && sgResultSnapshot && (
            <FavoriteResultStar
              path="/gallery"
              title={`Галерея · ${items.length} зображ.`}
              previewImage={sgResultSnapshot.previewImage}
              resumePayload={sgResultSnapshot.resumePayload}
            />
          )}
        </div>
      </header>

      <div className={`sg-body ${analysisStarted ? 'sg-body--has-results' : 'sg-body--no-results'}`}>
        <div
          className="sg-main"
          onDrop={onDrop}
          onDragOver={onDragOver}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => handleFiles(e.target.files)}
          />

          {items.length === 0 ? (
            <div className="sg-add-zone" role="button" tabIndex={0} onClick={openFilePicker} onKeyDown={(e) => e.key === 'Enter' && openFilePicker()}>
              <span>Click or drop an image</span>
            </div>
          ) : (
            <>
              <div className="sg-run-bar">
                <button
                  type="button"
                  className="sg-btn-run"
                  onClick={classifyAll}
                  disabled={items.length === 0 || isClassifying}
                >
                  {isClassifying ? 'Classifying…' : 'Run analysis'}
                </button>
                <button type="button" className="sg-btn-add" onClick={openFilePicker} disabled={isClassifying}>
                  ＋
                </button>
                {hasAnyClassified ? (
                  <button type="button" className="secondary-button" onClick={handleExportJson}>
                    ↓ Export JSON
                  </button>
                ) : null}
                <button
                  type="button"
                  className="secondary-button"
                  onClick={clearAll}
                  disabled={items.length === 0}
                >
                  Clear
                </button>
                <span className="sg-status" aria-live="polite">{status}</span>
              </div>
              <div ref={containerRef} className="sg-scroll">
                {isClassifying ? <div className="sg-loading-overlay">Classifying…</div> : null}
                {showUnclassifiedOnly ? (
                  <section className="sg-section">
                    <h3 className="sg-section-title">
                      <span className="sg-section-name">Added images</span>
                      <span className="sg-section-count">
                        {items.length === 1 ? '1 image' : `${items.length} images`}
                      </span>
                    </h3>
                    <div className="sg-grid">
                      {items.map((item) => {
                        const isActive = activeItemId === item.id;
                        const pct = getConfidencePct(item);
                        return (
                          <button
                            key={item.id}
                            type="button"
                            className={`sg-card ${isActive ? 'sg-card--active' : ''}`}
                            onClick={() => setActiveItemId(item.id)}
                          >
                            <div className="sg-card-img-wrap">
                              <img src={item.url} alt="" className="sg-card-img" />
                              {pct != null && <span className="sg-card-badge">{pct}%</span>}
                            </div>
                            <button
                              type="button"
                              className="sg-card-remove"
                              onClick={(e) => removeItem(item.id, e)}
                              aria-label="Remove"
                            >
                              ×
                            </button>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ) : categoriesWithItems.length > 0 ? (
                  categoriesWithItems.map((catKey) => {
                    const list = byCategory.get(catKey) ?? [];
                    const label = CATEGORY_LABELS[catKey];
                    const count = list.length;
                    const countText = count === 1 ? '1 image' : `${count} images`;
                    return (
                      <section key={catKey} className="sg-section">
                        <h3 className="sg-section-title">
                          <span className="sg-section-name">{label}</span>
                          <span className="sg-section-count">{countText}</span>
                        </h3>
                        <div className="sg-grid">
                          {list.map((item) => {
                            const isActive = activeItemId === item.id;
                            const pct = getConfidencePct(item);
                            return (
                              <button
                                key={item.id}
                                type="button"
                                className={`sg-card ${isActive ? 'sg-card--active' : ''}`}
                                onClick={() => setActiveItemId(item.id)}
                              >
                                <img src={item.url} alt={item.fileName} className="sg-card-img" />
                                {pct !== null && (
                                  <span className="sg-card-badge">{pct}%</span>
                                )}
                                <span
                                  className="sg-card-delete"
                                  onClick={(e) => removeItem(item.id, e)}
                                  aria-label="Remove"
                                >
                                  ×
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    );
                  })
                ) : (
                  <section className="sg-section">
                    <h3 className="sg-section-title">
                      <span className="sg-section-name">Other</span>
                      <span className="sg-section-count">{items.length} images</span>
                    </h3>
                    <div className="sg-grid">
                      {items.map((item) => {
                        const isActive = activeItemId === item.id;
                        const pct = getConfidencePct(item);
                        return (
                          <button
                            key={item.id}
                            type="button"
                            className={`sg-card ${isActive ? 'sg-card--active' : ''}`}
                            onClick={() => setActiveItemId(item.id)}
                          >
                            <img src={item.url} alt={item.fileName} className="sg-card-img" />
                            {pct !== null && <span className="sg-card-badge">{pct}%</span>}
                            <span
                              className="sg-card-delete"
                              onClick={(e) => removeItem(item.id, e)}
                              aria-label="Remove"
                            >
                              ×
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                )}
              </div>
            </>
          )}
        </div>

        <aside className="sg-sidebar">
          <h2 className="sg-sidebar-title">Classification details</h2>
          {selected ? (
            <>
              <div className="sg-sidebar-preview">
                <img src={selected.url} alt={selected.fileName} />
              </div>
              <div className="sg-sidebar-filename">{selected.fileName}</div>
              <div className="sg-sidebar-badge">
                {CATEGORY_LABELS[selected.category]}
                {getConfidencePct(selected) !== null &&
                  ` ${getConfidencePct(selected)}%`}
              </div>
              <h3 className="sg-sidebar-heading">TOP PREDICTIONS</h3>
              <ul className="sg-predictions">
                {(selected.predictions ?? []).slice(0, 5).map((p, idx) => {
                  const pct = Math.round(p.probability * 100);
                  return (
                    <li key={idx} className="sg-pred-row">
                      <span className="sg-pred-label">{p.className}</span>
                      <div className="sg-pred-bar-wrap">
                        <div className="sg-pred-bar-fill" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="sg-pred-value">{pct}%</span>
                    </li>
                  );
                })}
              </ul>
              {(!selected.predictions || selected.predictions.length === 0) && (
                <p className="sg-pred-empty"></p>
              )}
            </>
          ) : (
            <div className="sg-sidebar-empty">
              <span className="sg-sidebar-empty-icon">🖼</span>
              <span>Select an image on the left</span>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
