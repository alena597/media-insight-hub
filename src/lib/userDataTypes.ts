export type HistoryKind = 'page_view' | 'search' | 'analysis';

export type HistoryEntry = {
  id: string;
  kind: HistoryKind;
  label: string;
  path?: string;
  createdAtMs: number;
  previewImage?: string;
  resumePayload?: string;
};

export type FavoriteKind = 'module' | 'result';

export type FavoriteItem = {
  id: string;
  title: string;
  path: string;
  createdAtMs: number;
  kind?: FavoriteKind;
  previewImage?: string;
  resumePayload?: string;
};
