import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import JSZip from 'jszip';
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
  | 'building'
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
  building: 'Buildings',
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
  'building',
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

    const flowerNature = ['flowerpot', 'flower pot', 'plant pot', 'bouquet', 'flower arrangement', 'corsage', 'wreath', 'vase'];
    if (hasWord(tok, flowerNature) || (tok.includes('flower') && tok.includes('pot'))) return 'nature';


    const isSolarDish = (tok.includes('solar') || tok.includes('satellite') || tok.includes('dish') && tok.includes('solar')) && tok.includes('dish');
    const tableware = [
      'plate', 'bowl', 'cup', 'mug', 'saucer', 'teapot', 'coffeepot', 'goblet',
      'pitcher', 'ladle', 'spoon', 'fork', 'knife', 'dish', 'platter', 'skillet',
      'wok', 'kettle', 'consomme', 'mortar', 'tray', 'casserole', 'colander',
      'strainer', 'spatula', 'whisk', 'grater', 'corkscrew', 'can opener',
      'measuring cup', 'mixing bowl', 'punch bowl', 'soup bowl', 'serving dish',
      'chopsticks', 'saltshaker', 'pepper', 'vinegar'
    ];
    const potMatch = tok.includes('pot') && !tok.includes('flower');
    if (!isSolarDish && (potMatch || tok.includes('pan') || tok.includes('wok') ||
        tok.includes('bottle') || tok.includes('wine') || tok.includes('beer') ||
        tok.includes('glass') || hasWord(tok, tableware))) return 'tableware';

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
      'child', 'adult', 'soldier', 'athlete', 'diver', 'player', 'cowboy',
      'baby', 'toddler', 'policeman', 'doctor', 'nurse', 'chef', 'worker',
      'judge', 'scuba', 'surfer', 'gymnast', 'boxer', 'baseball', 'basketball',
      'football', 'soccer', 'tennis', 'golfer', 'jockey', 'archer', 'fencer',
      'skier', 'snowboarder', 'rafting', 'parachutist', 'beekeeper', 'gardener'
    ];
    if (hasWord(tok, people)) return 'people';

    // ── Техніка / електроніка ──
    const tech = [
      'laptop', 'computer', 'screen', 'monitor', 'keyboard', 'phone', 'camera',
      'television', 'printer', 'modem', 'disk', 'projector', 'cellular',
      'handset', 'radio', 'microscope', 'oscilloscope', 'clock', 'atm',
      'remote control', 'vcr', 'ipod', 'calculator', 'cassette', 'typewriter',
      'joystick', 'mouse', 'speaker', 'headphone', 'earphone', 'microphone',
      'amplifier', 'guitar', 'piano', 'violin', 'drum', 'accordion', 'banjo',
      'saxophone', 'flute', 'trumpet', 'harmonica', 'synthesizer', 'turntable',
      'hard disk', 'hard drive', 'cd player', 'boombox', 'tape player',
      'electric fan', 'sewing machine', 'hair dryer', 'iron', 'vacuum'
    ];
    if (tok.includes('tv') || tok.includes('watch') || tok.includes('lens') ||
        tok.includes('tablet') || tok.includes('drone') || tok.includes('robot') ||
        tok.includes('switch') || tok.includes('controller') ||
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

    // ── Будівлі / архітектура ──
    const building = [
      'church', 'cathedral', 'mosque', 'temple', 'synagogue', 'chapel',
      'castle', 'palace', 'tower', 'bridge', 'lighthouse', 'beacon',
      'barn', 'warehouse', 'library', 'school', 'hospital', 'prison',
      'monastery', 'pagoda', 'minaret', 'obelisk', 'triumphal arch',
      'stupa', 'dome', 'fort', 'villa', 'skyscraper', 'water tower',
      'planetarium', 'boathouse', 'greenhouse', 'silo', 'yurt',
      'megalith', 'suspension bridge', 'arch bridge', 'viaduct',
      'cinema', 'theater', 'train station', 'bus station', 'airport', 'mall', 'shop',
      'store', 'restaurant', 'hotel', 'office', 'building', 'architecture'
    ];
    if (tok.includes('church') || tok.includes('castle') || tok.includes('bridge') ||
        tok.includes('tower') || tok.includes('palace') || tok.includes('mosque') ||
        tok.includes('temple') || tok.includes('barn') || tok.includes('silo') ||
        tok.includes('prison') || tok.includes('monastery') || tok.includes('dome') ||
        hasWord(tok, building)) return 'building';

    // ── Тварини ──
    const animals = [
      'cat', 'dog', 'puppy', 'kitten', 'animal', 'bird', 'horse', 'cow', 'sheep',
      'zebra', 'giraffe', 'elephant', 'lion', 'tiger', 'panda', 'wolf', 'fox',
      'rabbit', 'hamster', 'squirrel', 'monkey', 'gorilla', 'chimp', 'poodle',
      'retriever', 'terrier', 'tabby', 'siamese', 'persian', 'egyptian',
      'jellyfish', 'goldfish', 'snail', 'turtle', 'lizard', 'snake', 'crocodile',
      'lynx', 'cheetah', 'deer', 'pig', 'bison', 'flamingo', 'penguin', 'swan',
      'duck', 'parrot', 'eagle', 'owl', 'bear', 'ox',
      'frog', 'toad', 'salamander', 'newt', 'axolotl', 'chameleon', 'iguana',
      'gecko', 'komodo', 'alligator', 'caiman', 'leatherback', 'loggerhead',
      'crab', 'lobster', 'shrimp', 'starfish', 'sea urchin', 'clam', 'oyster',
      'bee', 'wasp', 'butterfly', 'moth', 'dragonfly', 'beetle', 'ant', 'spider',
      'scorpion', 'centipede', 'caterpillar', 'grasshopper', 'cricket', 'fly',
      'mosquito', 'ladybug', 'mantis', 'cockroach', 'termite',
      'shark', 'whale', 'dolphin', 'seal', 'walrus', 'otter', 'manatee', 'narwhal',
      'pelican', 'heron', 'toucan', 'hornbill', 'peacock', 'rooster', 'hen',
      'goose', 'pigeon', 'sparrow', 'robin', 'finch', 'hummingbird', 'woodpecker',
      'albatross', 'cormorant', 'puffin', 'ostrich', 'emu', 'kiwi', 'cassowary',
      'meerkat', 'mongoose', 'badger', 'otter', 'weasel', 'ferret', 'skunk',
      'armadillo', 'anteater', 'sloth', 'koala', 'kangaroo', 'wallaby', 'platypus',
      'bison', 'moose', 'elk', 'reindeer', 'caribou', 'yak', 'llama', 'alpaca',
      'camel', 'dromedary', 'donkey', 'mule', 'goat', 'ram', 'bull', 'calf',
      'piglet', 'foal', 'fawn', 'cub', 'pup', 'hatchling', 'chick', 'filly',
      'husky', 'labrador', 'bulldog', 'beagle', 'dalmatian', 'collie', 'spaniel',
      'dachshund', 'boxer', 'rottweiler', 'doberman', 'chihuahua', 'maltese',
      'shih', 'afghan', 'greyhound', 'whippet', 'mastiff', 'setter', 'pointer',
      'maine', 'ragdoll', 'abyssinian', 'burmese', 'birman', 'sphynx', 'bengal'
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

    // ── Транспорт  ──
    const transport = [
      'bicycle', 'motorcycle', 'airplane', 'train', 'ambulance', 'fire engine',
      'taxi', 'minivan', 'limousine', 'tractor', 'forklift', 'lifeboat',
      'canoe', 'yacht', 'airship', 'helicopter', 'locomotive', 'streetcar',
      'convertible', 'scooter', 'submarine', 'trolleybus', 'sports car',
      'pickup truck', 'freight car', 'school bus', 'minibus', 'station wagon',
      'beach wagon', 'estate car', 'wagon', 'rickshaw', 'segway', 'skateboard',
      'snowmobile', 'go-kart', 'racing car', 'tanker', 'container ship', 'ferry',
      'catamaran', 'sailboat', 'rowboat', 'gondola', 'kayak', 'jet ski',
      'seaplane', 'biplane', 'glider', 'hang glider', 'paraglider', 'zeppelin',
      'space shuttle', 'rocket', 'spacecraft',
      'crane', 'bulldozer', 'excavator', 'steamroller', 'combine harvester'
    ];
    if (tok.includes('car') || tok.includes('bus') || tok.includes('truck') ||
        tok.includes('wagon') || tok.includes('boat') || tok.includes('ship') ||
        tok.includes('jet') || tok.includes('suv') || tok.includes('balloon') ||
        tok.includes('trolley') || tok.includes('van') || tok.includes('cab') ||
        tok.includes('cycle') || tok.includes('rail') || tok.includes('plane') ||
        tok.includes('craft') || hasWord(tok, transport)) return 'transport';

    // ── Природа ──
    const nature = [
      'tree', 'flower', 'mountain', 'beach', 'river', 'forest', 'lake', 'ocean',
      'cliff', 'valley', 'volcano', 'coral', 'leaf', 'branch', 'grass', 'bush',
      'palm', 'sunflower', 'rose', 'daisy', 'tulip', 'orchid', 'dandelion',
      'fern', 'willow', 'maple', 'oak', 'pine', 'snow', 'ice', 'waterfall',
      'sea', 'sky', 'cloud', 'sand', 'rock', 'stone', 'mushroom',
      'field', 'meadow', 'jungle', 'swamp', 'marsh', 'tundra', 'desert', 'dune',
      'glacier', 'iceberg', 'aurora', 'rainbow', 'lightning', 'fog', 'mist',
      'sunrise', 'sunset', 'horizon', 'coast', 'shore', 'island', 'peninsula',
      'canyon', 'gorge', 'plateau', 'savanna', 'steppe', 'prairie', 'bog',
      'pond', 'creek', 'brook', 'stream', 'spring', 'geyser', 'hot spring',
      'birch', 'spruce', 'cedar', 'redwood', 'bamboo', 'cactus', 'succulent',
      'moss', 'lichen', 'algae', 'seaweed', 'kelp', 'coral reef',
      'lavender', 'poppy', 'lilac', 'magnolia', 'cherry blossom', 'lotus',
      'daffodil', 'iris', 'hyacinth', 'carnation', 'lily', 'marigold',
      'wheat', 'corn', 'rice', 'vineyard', 'orchard',
      'plant', 'herb', 'shrub', 'weed', 'vine', 'petal', 'blossom', 'bloom'
    ];
    if (hasWord(tok, nature)) return 'nature';

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
 * Повертає очищений топ-лейбл для елемента галереї.
 *
 * @param item - Елемент галереї з prediction.
 * @returns Назва класу або null.
 */
function getTopLabel(item: GalleryItem): string | null {
  if (!item.predictions || item.predictions.length === 0) return null;
  const raw = item.predictions[0].className ?? '';
  return raw.replace(/\bn\d+\s*/g, '').replace(/_/g, ' ').trim() || null;
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
  const [limitWarning, setLimitWarning] = useState(false);
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

  const FILE_LIMIT = 20;

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (files.length > FILE_LIMIT) setLimitWarning(true);
    const slice = Array.from(files).slice(0, FILE_LIMIT);
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
      const sections = containerRef.current.querySelectorAll('.sg-section-title');
      gsap.from(sections, { opacity: 0, x: -12, duration: 0.32, stagger: 0.07, ease: 'power2.out' });
      const cards = containerRef.current.querySelectorAll('.sg-card');
      gsap.from(cards, {
        opacity: 0,
        y: 18,
        scale: 0.9,
        duration: 0.42,
        stagger: 0.025,
        ease: 'back.out(1.5)',
        delay: 0.05
      });
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
              label: `Gallery · ${updated.length} images`,
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

  /** Завантажує зображення розсортованими по папках (категоріях) у ZIP-архіві. */
  const handleDownloadZip = async () => {
    const zip = new JSZip();
    const classified = items.filter((it) => it.category && it.url);
    const counters: Record<string, number> = {};
    for (const item of classified) {
      try {
        const response = await fetch(item.url);
        const blob = await response.blob();
        const ext = item.fileName.includes('.') ? item.fileName.split('.').pop() ?? 'jpg' : 'jpg';
        const cat = item.category!;
        counters[cat] = (counters[cat] ?? 0) + 1;
        const n = String(counters[cat]).padStart(2, '0');
        zip.folder(cat)?.file(`${n}.${ext}`, blob);
      } catch {
        /* skip unavailable blob */
      }
    }
    const content = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(content);
    a.download = `gallery-sorted-${Date.now()}.zip`;
    a.click();
    URL.revokeObjectURL(a.href);
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
              title={`Gallery · ${items.length} images`}
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
              <span className="module-upload-empty-text">Click or drop an image</span>
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
                  <>
                    <button type="button" className="secondary-button" onClick={handleExportJson}>
                      ↓ Export JSON
                    </button>
                    <button type="button" className="secondary-button" onClick={() => { void handleDownloadZip(); }}>
                      ↓ Download ZIP
                    </button>
                  </>
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
              {limitWarning ? (
                <div className="sg-limit-warning" role="alert">
                  Only the first {FILE_LIMIT} photos are processed. To analyse more, clear the gallery and add a new batch.
                  <button type="button" className="sg-limit-warning__close" onClick={() => setLimitWarning(false)} aria-label="Dismiss">✕</button>
                </div>
              ) : null}
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
                            const topLabel = getTopLabel(item);
                            return (
                              <button
                                key={item.id}
                                type="button"
                                className={`sg-card ${isActive ? 'sg-card--active' : ''}`}
                                onClick={() => setActiveItemId(item.id)}
                              >
                                <img src={item.url} alt={item.fileName} className="sg-card-img" />
                                {pct !== null && (
                                  <span className="sg-card-badge" title={topLabel ?? undefined}>
                                    {topLabel ? `${topLabel} ${pct}%` : `${pct}%`}
                                  </span>
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
                        const topLabel = getTopLabel(item);
                        return (
                          <button
                            key={item.id}
                            type="button"
                            className={`sg-card ${isActive ? 'sg-card--active' : ''}`}
                            onClick={() => setActiveItemId(item.id)}
                          >
                            <img src={item.url} alt={item.fileName} className="sg-card-img" />
                            {pct !== null && (
                              <span className="sg-card-badge" title={topLabel ?? undefined}>
                                {topLabel ? `${topLabel} ${pct}%` : `${pct}%`}
                              </span>
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
                      <span className="sg-pred-label">{p.className.replace(/\bn\d+\s*/g, '').replace(/_/g, ' ').trim()}</span>
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
