# Linting

## Обраний лінтер

**ESLint v9** з плагінами `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`.

### Причини вибору
- Стандартний інструмент для React/TypeScript проєктів
- Підтримка TypeScript через `typescript-eslint`
- Інтеграція з Vite та React
- Великий набір правил та плагінів

## Базові правила

| Правило | Рівень | Пояснення |
|---|---|---|
| `@typescript-eslint/no-unused-vars` | error | Забороняє невикористані змінні |
| `@typescript-eslint/no-explicit-any` | warn | Попереджає про використання типу `any` |
| `no-console` | warn | Дозволяє лише `console.error` та `console.warn` |
| `prefer-const` | error | Вимагає використання `const` замість `let` де можливо |
| `react-hooks/rules-of-hooks` | error | Перевірка правил використання хуків |
| `react-refresh/only-export-components` | warn | Перевірка експортів для React Refresh |

## Інструкція з запуску
```bash
# Перевірка коду
npm run lint

# Автоматичне виправлення
npm run lint:fix
```

## Результати першого запуску

Початковий стан: **15 проблем (7 errors, 8 warnings)**

| Файл | Проблема | Тип |
|---|---|---|
| `MediaTranscriberPage.tsx` | `status` — невикористана змінна | error |
| `MediaTranscriberPage.tsx` | `segmentsForView` — невикористана змінна | error |
| `MediaTranscriberPage.tsx` | `fmtTime` — невикористана функція | error |
| `ObjectDetectionPage.tsx` | `status` — невикористана змінна | error |
| `ObjectDetectionPage.tsx` | `padY` — невикористана змінна | error |
| `ObjectDetectionPage.tsx` | Зайві `eslint-disable` директиви | error |
| `OcrLabPage.tsx` | `status` — невикористана змінна | error |
| Всі файли | `console.log/error` виклики | warning |

## Виправлені проблеми

Після виправлень: **0 проблем**

1. Видалено невикористані змінні `status`, `segmentsForView`, `padY`
2. Видалено невикористану функцію `fmtTime`
3. Видалено зайві `eslint-disable` директиви
4. Налаштовано правило `no-console` — дозволено `console.error` та `console.warn`


## Git Hooks

Налаштовано pre-commit хук через **husky** який автоматично запускає лінтер перед кожним комітом. Якщо лінтер знаходить помилки — коміт блокується.

## Інтеграція з процесом збірки

Додано скрипти у `package.json`:

| Команда | Опис |
|---|---|
| `npm run lint` | Перевірка коду ESLint |
| `npm run lint:fix` | Автоматичне виправлення |
| `npm run type-check` | Перевірка TypeScript типів |
| `npm run check` | Комплексна перевірка (lint + type-check) |

## Статична типізація

Використовується **TypeScript** з `tsc --noEmit` для перевірки типів без генерації файлів. Виправлені помилки типізації у `OcrLabPage.tsx` та `SmartGalleryPage.tsx`.