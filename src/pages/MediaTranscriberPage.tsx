import { useEffect, useMemo, useRef, useState } from "react";
import "../theme/transcriber.css";

type Mode = "mic" | "text";
type Sentiment = "positive" | "negative" | "neutral";

type Segment = {
  id: string;
  tMs: number;
  text: string;
  sentiment: Sentiment;
  score: number;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

/**
 * Повертає поточний час у мілісекундах з високою точністю.
 *
 * @returns {number} Час у мілісекундах від початку сесії
 */
function nowMs() {
  return performance.now();
}

/**
 * Нормалізує рядок для аналізу тональності.
 *
 * @description
 * Переводить у нижній регістр, видаляє спеціальні символи
 * (крім літер, цифр, пробілів, апострофів і дефісів),
 * замінює множинні пробіли одним та обрізає краї.
 *
 * @param {string} s - Вхідний рядок
 * @returns {string} Нормалізований рядок
 *
 * @example
 * normalizeWords('Привіт, Світ!!!') // повертає 'привіт світ'
 */
function normalizeWords(s: string) {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const POS = [
  // UA
  "добре",
  "чудово",
  "класно",
  "супер",
  "приємно",
  "люблю",
  "дякую",
  "найкраще",
  "гарно",
  "круто",
  "відмінно",
  "прекрасно",
  "щасливий",
  "щаслива",
  "радію",
  "раді",
  "успіх",
  "перемога",
  "підтримую",
  "погоджуюсь",
  "рекомендую",
  "обожнюю",
  // EN
  "good",
  "great",
  "awesome",
  "nice",
  "love",
  "thanks",
  "thank",
  "best",
  "amazing",
  "excellent",
  "perfect",
  "happy",
  "glad",
  "enjoy",
  "wonderful",
  "fantastic",
  "brilliant",
  "success",
  "win",
  "recommend"
];

const NEG = [
  // UA
  "погано",
  "жах",
  "жахливо",
  "ненавиджу",
  "сумно",
  "боляче",
  "проблема",
  "помилка",
  "страшно",
  "гірше",
  "погіршення",
  "незадоволений",
  "незадоволена",
  "злий",
  "зла",
  "розчарований",
  "розчарована",
  "невдача",
  "провал",
  "непрацює",
  "ламано",
  // EN
  "bad",
  "terrible",
  "hate",
  "sad",
  "pain",
  "problem",
  "error",
  "awful",
  "worst",
  "broken",
  "fail",
  "failure",
  "angry",
  "upset",
  "disappointed",
  "scared",
  "doesn't work",
  "doesnt work"
];

/**
 * Розбиває текст на токени (слова) для аналізу тональності.
 *
 * @param {string} text - Вхідний текст
 * @returns {string[]} Масив нормалізованих слів
 *
 * @example
 * tokenize('Це чудовий день') // повертає ['це', 'чудовий', 'день']
 */
function tokenize(text: string): string[] {
  const n = normalizeWords(text);
  if (!n) return [];
  return n.split(' ').filter(Boolean);
}

/**
 * Аналізує тональність тексту на основі словникового методу.
 *
 * @description
 * Алгоритм аналізу тональності:
 * 1. Токенізує текст через normalizeWords + split
 * 2. Перевіряє наявність негативних патернів (регулярні вирази)
 * 3. Аналізує пунктуацію (?, !, ...)
 * 4. Порівнює токени з позитивним/негативним словниками (POS/NEG)
 * 5. Обробляє заперечення (не, ні, not, no, don't)
 * 6. Перевіряє кореневі відповідності для української мови
 *
 * Підтримує українську та англійську мови.
 * Score > 0.05 = позитивна, < -0.05 = негативна, решта = нейтральна.
 *
 * @param {string} text - Текст для аналізу
 * @returns {{ sentiment: Sentiment; score: number }} Результат аналізу
 *
 * @example
 * analyzeSentiment('Це чудово!') // { sentiment: 'positive', score: 1 }
 * analyzeSentiment('Жах і жахливо') // { sentiment: 'negative', score: -1 }
 */
function analyzeSentiment(text: string): { sentiment: Sentiment; score: number } {
  const tokens = tokenize(text);
  if (tokens.length === 0) return { sentiment: "neutral", score: 0 };

  const posSet = new Set(POS);
  const negSet = new Set(NEG);

  const n = normalizeWords(text);

  // UA complaint/service patterns (very common in reviews)
  const negPatterns: RegExp[] = [
    /нема(є)?\b/u,
    /неможливо\b/u,
    /не\s+можливо\b/u,
    /не\s+працює\b/u,
    /не\s+відповіда\w*/u,
    /не\s+відправ\w*/u,
    /не\s+над(і|и)сл\w*/u,
    /не\s+отрим\w*/u,
    /не\s+достав\w*/u,
    /затрим\w*/u,
    /дозвон\w*/u,
    /додзвон\w*/u,
    /поверн(і|и)т\w*\s+грош\w*/u,
    /повернен\w*\s+грош\w*/u,
    /скасу(й|вати)\w*/u,
    /обман\w*/u,
    /шахра\w*/u,
    /ігнор\w*/u,
    /без\s+дій\b/u,
    /ніяких\\s+дій\\b/u,
    /чекаю\\b/u,
    /не\s+сподоб\w*/u,
    /не\s+рекоменд\w*/u,
    /не\s+запропону\w*\s+альтернатив\w*/u,
    /ніяко\w*\s+альтернатив\w*/u,
    /не\s+запропону\w*/u,
    /тільки\s+в\s+їхн\w*/u,
    /нав\w*з\w*/u,
    /дорог\w*/u,
    /ціна\b/u,
    /\b\d+\s*(тис\.?|тисяч)\b/u,
    /\b\d+\s*(грн|₴)\b/u,
    /груб\w*/u,
    /хам\w*/u,
    /халатн\w*/u,
    /непрофес\w*/u,
    /некорект\w*/u,
    /якіст\w*\s+нуль/u,
    /якост\w*\s+нуль/u,
    /це\s+дно\b/u,
    /дно\b/u,
    /здерт\w*\s+грош\w*/u,
    /нікому\s+не\s+рекоменд\w*/u,
    /не\s+рекоменд\w*/u,
    /насильн\w*/u,
    /змушувал\w*/u,
    /не\s+може\s+прийнят\w*/u,
    /перенос\w*\s+запис\w*/u,
    /запис\w*\s+перенос\w*/u
  ];
  let pos = 0;
  let neg = 0;

  // Pattern hits contribute strong signal
  for (const re of negPatterns) {
    if (re.test(n)) neg += 2;
  }

  // punctuation heuristics
  const q = (text.match(/\?/g) ?? []).length;
  const ex = (text.match(/!/g) ?? []).length;
  const dots = (text.match(/…|\.\.\./g) ?? []).length;
  if (q >= 2) neg += 1;
  if (dots >= 1 && q >= 1) neg += 1;
  if (ex >= 3) neg += 2;
  if (ex >= 2) {
    if (pos > neg) pos += 1;
    else if (neg > pos) neg += 1;
  }

  // token-based lexicon + negation handling
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const prev = tokens[i - 1];

    const isNegation =
      prev === "не" ||
      prev === "ні" ||
      prev === "not" ||
      prev === "no" ||
      prev === "don't" ||
      prev === "dont";


    // UA root matching (covers сподобалось/альтернативи/запропонувавши)
    const uaPosRoots = ["сподоб", "подоб", "задовол", "рекоменд", "вдяч", "супер", "чудов", "класн", "гарн", "крут", "відмін", "прекрас"];
    const uaNegRoots = ["незадовол", "розчар", "проблем", "помил", "дорог", "альтернатив", "ціна", "грош", "непрац", "ламан", "обман", "ігнор", "навяз", "нав\u2019яз", "сподоб", "подоб", "запропон", "груб", "хам", "халат", "непрофес", "некорект", "якіст", "якост", "нуль", "дно", "здерт", "насиль", "змуш", "спізн", "перенос", "запис"];
    const hasRoot = (roots: string[]) => roots.some((r) => t.startsWith(r));
    if (hasRoot(uaPosRoots)) {
      if (isNegation) neg += 1;
      else pos += 1;
    }
    if (hasRoot(uaNegRoots)) {
      if (isNegation) pos += 1;
      else neg += 1;
    }

    if (posSet.has(t)) {
      if (isNegation) neg += 1;
      else pos += 1;
      continue;
    }
    if (negSet.has(t)) {
      if (isNegation) pos += 1;
      else neg += 1;
      continue;
    }

    // English contractions / simple variants
    if (t.endsWith("n't") && i + 1 < tokens.length) {
      const next = tokens[i + 1];
      if (posSet.has(next)) neg += 1;
      if (negSet.has(next)) pos += 1;
    }
  }

  // force strong negative if complaint-heavy
  if (neg >= 4 && pos === 0) return { sentiment: "negative", score: -0.7 };
  const total = pos + neg;
  const score = total === 0 ? 0 : (pos - neg) / total;
  const sentiment: Sentiment = score > 0.05 ? "positive" : score < -0.05 ? "negative" : "neutral";
  return { sentiment, score };
}

/**
 * Повертає текстову мітку для типу тональності.
 *
 * @param {Sentiment} s - Тип тональності
 * @returns {string} Текстова мітка англійською
 *
 * @example
 * sentimentLabel('positive') // повертає 'Positive'
 * sentimentLabel('neutral')  // повертає 'Neutral'
 */
function sentimentLabel(s: Sentiment) {
  if (s === "positive") return "Positive";
  if (s === "negative") return "Negative";
  return "Neutral";
}

/**
 * Сторінка транскрибації медіа та аналізу тональності.
 *
 * @description
 * Модуль підтримує два режими роботи:
 * - Запис мікрофону через Web Speech API з реалтайм транскрибацією
 * - Вставка тексту вручну для аналізу тональності
 *
 * Взаємодія між компонентами:
 * - Web Speech API → segments → analyzeSentiment → summary
 * - summary відображається у правій панелі з барами та списком речень
 *
 * @returns {JSX.Element} Сторінка транскрибера
 */
export function MediaTranscriberPage() {
  const [mode, setMode] = useState<Mode>("text");
  const [lang, setLang] = useState<"uk-UA" | "en-US">("uk-UA");
  const [isListening, setIsListening] = useState(false);
  const [, setStatus] = useState("Ready");
  const [interim, setInterim] = useState("");
  const [segments, setSegments] = useState<Segment[]>([]);
  const [text, setText] = useState("");
  const [showSentences, setShowSentences] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const startRef = useRef<number>(0);

  const isSpeechSupported = useMemo(() => {
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
  }, []);

  const summary = useMemo(() => {
    const sentences = text
      .split(/(?<=[.!?])\s+/g)
      .map((s) => s.trim())
      .filter(Boolean);
    let p = 0;
    let n = 0;
    let u = 0;
    sentences.forEach((s) => {
      const r = analyzeSentiment(s);
      if (r.sentiment === "positive") p++;
      else if (r.sentiment === "negative") n++;
      else u++;
    });
    const total = sentences.length || 1;
    return {
      sentences,
      positive: p,
      negative: n,
      neutral: u,
      pPct: Math.round((p / total) * 100),
      nPct: Math.round((n / total) * 100),
      uPct: Math.round((u / total) * 100)
    };
  }, [text]);

  const ensureRecognition = () => {
    if (!isSpeechSupported) return null;
    if (recognitionRef.current) return recognitionRef.current;
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return null;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    recognitionRef.current = rec;
    return rec;
  };

  const clearAll = () => {
    setInterim("");
    setSegments([]);
    setText("");
    setStatus("Cleared");
  };

  const stop = () => {
    const rec = recognitionRef.current;
    if (rec) rec.stop();
    setIsListening(false);
    setStatus("Stopped");
  };

  const start = () => {
    if (!isSpeechSupported) {
      setStatus("Web Speech API is not supported in this browser");
      return;
    }
    const rec = ensureRecognition();
    if (!rec) {
      setStatus("Could not initialize recognition");
      return;
    }
    if (isListening) return;
    setStatus("Listening…");
    setInterim("");
    startRef.current = nowMs();

    rec.lang = lang;
    rec.onresult = (ev: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const e = ev as any;
      let finalText = "";
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const t = res?.[0]?.transcript ?? "";
        if (res.isFinal) finalText += t;
        else interimText += t;
      }
      setInterim(interimText.trim());
      const cleaned = finalText.trim();
      if (!cleaned) return;
      const tMs = nowMs() - startRef.current;
      const r = analyzeSentiment(cleaned);
      const seg: Segment = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        tMs,
        text: cleaned,
        sentiment: r.sentiment,
        score: r.score
      };
      setSegments((prev) => [...prev, seg].slice(-200));
      setText((prev) => (prev ? `${prev} ${cleaned}` : cleaned));
    };
    rec.onerror = () => {
      setStatus("Recognition error (check microphone permissions)");
      setIsListening(false);
    };
    rec.onend = () => {
      setIsListening(false);
      setInterim("");
      setStatus("Ready");
    };

    try {
      rec.start();
      setIsListening(true);
    } catch {
      setStatus("Could not start recognition");
      setIsListening(false);
    }
  };

  useEffect(() => {
    if (!isListening) return;
    stop();
    const t = window.setTimeout(() => start(), 150);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);


  const showSentimentPanel = mode === "mic" ? segments.length > 0 : text.trim().length > 0;

  return (
    <div className={`panel-grid ${showSentimentPanel ? '' : 'panel-grid--single'}`}>
      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">
              <span>Media Transcriber</span>
              <span className="label-pill">Web Speech · NLP</span>
            </div>
          </div>
          <div className="tr-tabs">
            <button
              type="button"
              className={`secondary-button ${mode === "mic" ? "tr-tab--active" : ""}`}
              onClick={() => setMode("mic")}
              disabled={mode === "mic" || isListening}
            >
              🎙 Record
            </button>
            <button
              type="button"
              className={`secondary-button ${mode === "text" ? "tr-tab--active" : ""}`}
              onClick={() => setMode("text")}
              disabled={mode === "text" || isListening}
            >
              T Paste text
            </button>
          </div>
        </div>

        <div className="tr-controls">
          {mode === "mic" ? (
            <>
              <div className="tr-lang">
                <span className="tr-lang-text">Language:</span>
                <select
                  className="tr-select"
                  value={lang}
                  onChange={(e) => setLang(e.target.value as typeof lang)}
                >
                  <option value="uk-UA">Ukrainian</option>
                  <option value="en-US">English</option>
                </select>
              </div>
              <button
                type="button"
                className="tr-mic-btn"
                onClick={isListening ? stop : start}
                disabled={!isSpeechSupported}
              >
                {isListening ? "⏹ Stop" : "🎙 Start"}
              </button>
              <button type="button" className="secondary-button" onClick={clearAll} disabled={isListening}>
                🧹 Clear
              </button>
            </>
          ) : (
            <>
              <button type="button" className="secondary-button" onClick={clearAll}>
                🧹 Clear
              </button>
            </>
          )}
        </div>

        {mode === "mic" ? (
          <div className="tr-main">
            <div className="tr-transcript">
              <div className="tr-transcript-title">Transcript</div>
              <div className="tr-transcript-box">
                <div className="tr-transcript-final">{text || "Press “Start” and speak…"}</div>
                {interim ? <div className="tr-transcript-interim">{interim}</div> : null}
              </div>
            </div>
          </div>
        ) : (
          <div className="tr-text-mode">
            <textarea
              className="tr-textarea"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste or type text here…"
            />
          </div>
        )}
      </div>

      {showSentimentPanel ? (
        <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">
              <span>Sentiment overview</span>
              <span className="badge">{summary.sentences.length} sent.</span>
            </div>
          </div>
        </div>

        <div className="tr-summary">
          <div className="tr-kpi">
            <div className="tr-kpi-label">Positive</div>
            <div className="tr-kpi-value tr-kpi-value--pos">{summary.positive}</div>
          </div>
          <div className="tr-kpi">
            <div className="tr-kpi-label">Negative</div>
            <div className="tr-kpi-value tr-kpi-value--neg">{summary.negative}</div>
          </div>
          <div className="tr-kpi">
            <div className="tr-kpi-label">Neutral</div>
            <div className="tr-kpi-value tr-kpi-value--neu">{summary.neutral}</div>
          </div>
        </div>

        <div className="tr-bars">
          <div className="tr-bar-row">
            <span className="tr-bar-label">Positive</span>
            <div className="tr-bar">
              <div className="tr-bar-fill tr-bar-fill--pos" style={{ width: `${summary.pPct}%` }} />
            </div>
            <span className="tr-bar-pct">{summary.pPct}%</span>
          </div>
          <div className="tr-bar-row">
            <span className="tr-bar-label">Negative</span>
            <div className="tr-bar">
              <div className="tr-bar-fill tr-bar-fill--neg" style={{ width: `${summary.nPct}%` }} />
            </div>
            <span className="tr-bar-pct">{summary.nPct}%</span>
          </div>
          <div className="tr-bar-row">
            <span className="tr-bar-label">Neutral</span>
            <div className="tr-bar">
              <div className="tr-bar-fill tr-bar-fill--neu" style={{ width: `${summary.uPct}%` }} />
            </div>
            <span className="tr-bar-pct">{summary.uPct}%</span>
          </div>
        </div>

        <div className="tr-sentences">
          <div className="tr-sentences-head">
            <div className="tr-transcript-title">Sentences</div>
            <button type="button" className="secondary-button tr-mini-btn" onClick={() => setShowSentences((v) => !v)} disabled={summary.sentences.length === 0}>
              {showSentences ? "Hide" : "Show"}
            </button>
          </div>
          {summary.sentences.length === 0 ? (
            <div className="tr-empty"></div>
          ) : !showSentences ? (
            <div className="tr-empty">List of sentences is hidden — click “Show”.</div>
          ) : (
            <div className="tr-sentence-list">
              {summary.sentences.slice(0, 30).map((s, idx) => {
                const r = analyzeSentiment(s);
                return (
                  <div key={`${idx}-${s.slice(0, 12)}`} className={`tr-sentence tr-sentence--${r.sentiment}`}>
                    <span className={`tr-pill tr-pill--${r.sentiment}`}>{sentimentLabel(r.sentiment)}</span>
                    <span className="tr-sentence-text">{s}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        </div>
      ) : null}
    </div>
  );
}