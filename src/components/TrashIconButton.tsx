import type { MouseEvent } from 'react';

/**
 * Кнопка видалення з іконкою смітника (історія, обране).
 *
 * @param props - Властивості.
 * @param props.ariaLabel - Підпис для доступності.
 * @param props.onClick - Обробник кліку.
 * @param props.disabled - Блокування.
 * @param props.className - Додатковий клас (наприклад позиціонування).
 * @returns Кнопка з SVG-іконкою.
 */
export function TrashIconButton({
  ariaLabel,
  onClick,
  disabled,
  className = ''
}: {
  ariaLabel: string;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`mih-trash-icon-btn ${className}`.trim()}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path fill="currentColor" d="M6 19a2 2 0 002 2h8a2 2 0 002-2V7H6v12z" />
        <path fill="currentColor" d="M19 4h-3.5l-1-1h-5l-1 1H5v2h14V4zM10 9v9h2V9h-2zm4 0v9h2V9h-2z" />
      </svg>
    </button>
  );
}
