import { useEffect, useRef, useState } from 'react';
import * as mobilenet from '@tensorflow-models/mobilenet';
import '@tensorflow/tfjs';
import { gsap } from 'gsap';
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

function mapLabelToCategory(classNames: string): CategoryKey {
  const l = classNames
    .replace(/\bn\d+\s*/g, '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .trim();

  const people = [
    'person', 'man', 'woman', 'boy', 'girl', 'people', 'face', 'bride', 'child', 'adult', 'soldier', 'athlete', 'diver'
  ];
  if (people.some((k) => l.includes(k))) return 'people';

  const tech = [
    'laptop', 'computer', 'screen', 'monitor', 'keyboard', 'phone', 'camera', 'television',
    'tv', 'printer', 'mouse', 'modem', 'disk', 'projector', 'notebook', 'cellular',
    'handset', 'radio', 'stethoscope', 'microscope', 'oscilloscope', 'watch', 'clock', 'lens', 'slot', 'atm'
  ];
  if (tech.some((k) => l.includes(k))) return 'tech';

  const clothing = [
    'jean', 'denim', 't-shirt', 'jersey', 'sweater', 'sweatshirt', 'hoodie', 'jacket', 'coat',
    'suit', 'tie', 'bow tie', 'dress', 'skirt', 'kimono', 'cardigan', 'sock', 'shoe', 'sandal',
    'boot', 'sneaker', 'hat', 'cap', 'helmet', 'gown'
  ];
  if (clothing.some((k) => l.includes(k))) return 'clothing';

  const interior = [
    'kitchen', 'living room', 'bedroom', 'bathroom', 'dining room', 'studio', 'interior',
    'wall', 'ceiling', 'floor', 'room', 'apartment', 'house', 'home theater', 'wardrobe',
    'cabinetry', 'cupboard', 'closet', 'fireplace'
  ];
  if (interior.some((k) => l.includes(k))) return 'interior';

  const animals = [
    'cat', 'dog', 'puppy', 'kitten', 'animal', 'bird', 'horse', 'cow', 'sheep', 'zebra',
    'giraffe', 'elephant', 'lion', 'tiger', 'bear', 'panda', 'wolf', 'fox', 'rabbit',
    'hamster', 'squirrel', 'monkey', 'gorilla', 'chimp', 'poodle', 'retriever',
    'terrier', 'tabby', 'siamese', 'persian', 'egyptian', 'jellyfish', 'goldfish',
    'snail', 'turtle', 'lizard', 'snake', 'crocodile', 'dinosaur', 'lynx', 'cheetah', 'deer', 'pig', 'ox', 'bison', 'flamingo', 'penguin', 'swan', 'duck', 'parrot', 'eagle', 'owl'
  ];
  if (animals.some((k) => l.includes(k))) return 'animals';

  const furniture = [
    'chair', 'table', 'sofa', 'couch', 'bed', 'desk', 'wardrobe', 'cabinet', 'shelf',
    'dining table', 'studio couch', 'folding chair', 'barber chair', 'armchair', 'throne',
    'bookshelf', 'file', 'filing cabinet', 'table lamp', 'floor lamp', 'wardrobe',
    'chest', 'bureau', 'bookshelf', 'pillow', 'mattress', 'ottoman', 'footstool',
    'refrigerator', 'stove', 'microwave', 'oven', 'bookcase', 'lamp', 'chiffonier', 'washbasin', 'toilet', 'bathtub', 'shower', 'counter', 'kitchen'
  ];
  if (furniture.some((k) => l.includes(k))) return 'furniture';

  const nature = [
    'tree', 'flower', 'mountain', 'beach', 'river', 'forest', 'lake', 'sea', 'ocean',
    'cliff', 'valley', 'volcano', 'coral', 'leaf', 'branch', 'grass', 'bush', 'palm',
    'sunflower', 'rose', 'daisy', 'tulip', 'orchid', 'dandelion', 'strawberry',
    'mushroom', 'fern', 'willow', 'maple', 'oak', 'pine', 'snow', 'ice', 'waterfall'
  ];
  if (nature.some((k) => l.includes(k))) return 'nature';

  const transport = [
    'car', 'bus', 'truck', 'bicycle', 'motorcycle', 'airplane', 'train', 'boat', 'ship',
    'ambulance', 'fire engine', 'taxi', 'minivan', 'suv', 'sports car', 'limousine',
    'pickup', 'tractor', 'forklift', 'gondola', 'lifeboat', 'canoe', 'yacht', 'jet',
    'airship', 'balloon', 'helicopter', 'locomotive', 'streetcar', 'trolley', 'wagon', 'convertible', 'scooter', 'submarine'
  ];
  if (transport.some((k) => l.includes(k))) return 'transport';

  const tableware = [
    'plate', 'bowl', 'cup', 'mug', 'saucer', 'teapot', 'coffeepot', 'wine', 'beer',
    'bottle', 'goblet', 'glass', 'pitcher', 'ladle', 'spoon', 'fork', 'knife',
    'dish', 'platter', 'pot', 'pan', 'skillet', 'wok', 'kettle', 'consomme'
  ];
  if (tableware.some((k) => l.includes(k))) return 'tableware';

  const food = [
    'pizza', 'burger', 'sandwich', 'fruit', 'apple', 'banana', 'cake', 'orange', 'lemon',
    'grape', 'strawberry', 'pear', 'peach', 'pineapple', 'watermelon', 'broccoli',
    'cabbage', 'carrot', 'potato', 'tomato', 'cucumber', 'lettuce', 'mushroom',
    'coffee', 'tea', 'milk', 'juice', 'donut', 'bagel', 'croissant',
    'pretzel', 'soup', 'stew', 'salad', 'omelette', 'ice cream', 'chocolate', 'candy',
    'espresso', 'mashed potato', 'grille', 'guacamole', 'burrito', 'cheeseburger', 'hotdog',
    'french fries', 'carbonara', 'spaghetti', 'trifle', 'waffle', 'custard', 'mango',
    'pomegranate', 'corn', 'artichoke', 'bell pepper', 'cauliflower', 'asparagus'
  ];
  if (food.some((k) => l.includes(k))) return 'food';

  return 'other';
}

function getConfidencePct(item: GalleryItem): number | null {
  if (!item.predictions || item.predictions.length === 0) return null;
  return Math.round(item.predictions[0].probability * 100);
}

export function SmartGalleryPage() {
  const [model, setModel] = useState<mobilenet.MobileNet | null>(null);
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [status, setStatus] = useState('Model not loaded yet');
  const [isLoadingModel, setIsLoadingModel] = useState(false);
  const [isClassifying, setIsClassifying] = useState(false);
  const [analysisStarted, setAnalysisStarted] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (model || isLoadingModel) return;
      setIsLoadingModel(true);
      setStatus('Loading MobileNet v2 model...');
      try {
        const loaded = await mobilenet.load();
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
    const loaded = await mobilenet.load();
    setModel(loaded);
    setStatus('Model ready');
    return loaded;
  };

  const classifyAll = async () => {
    if (items.length === 0 || isClassifying) return;
    setAnalysisStarted(true);
    try {
      const key = "mih_analyses_count";
      const cur = Number(localStorage.getItem(key) || "0");
      localStorage.setItem(key, String(cur + 1));
    } catch {
      // ignore
    }
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
        const combined = predictions.map(getLabel).join(' ');
        const category = mapLabelToCategory(topClass + ' ' + combined);
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
          <div className="sg-icon sg-icon--purple" aria-hidden>G</div>
          <div>
            <div className="sg-header-title">Smart Gallery</div>
            <div className="sg-header-subtitle">Image classification · MobileNet v2</div>
          </div>
        </div>
        <div className="sg-header-right">
          <button
            type="button"
            className="sg-btn-clear"
            onClick={clearAll}
            disabled={items.length === 0}
          >
            🔄 Clear all
          </button>
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
              <span>Drop up to 20 images here or click to select</span>
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
