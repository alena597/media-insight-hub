/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Повний URL API, якщо фронт і бекенд на різних хостах (інакше порожньо + Vite proxy `/api`). */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
