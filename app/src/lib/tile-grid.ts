// Сетка плиток — одни числа для контента (раскладка по координатам, LibraryWireframe) и для страниц-сеток (Spaces, Actions).
// Поменял здесь — поменялись обе. Размер плитки по колесу (база × масштаб, lib/tile-scale.tsx) задаёт число колонок;
// плитки растягиваются на всю ширину, зазор постоянный — без дыр между колонками на крупном зуме.
export const tileMin = 240 // ширина плитки контента и Actions при масштабе 1, px
export const canvasTileMin = 200 // у «Холстов» мельче: на обычной ширине пять обложек в ряд (владелец 2026-10-30)
export const spaceTileMin = 230 // у плиток space (страница Spaces) мельче: это папки, а не материалы
export const tileGap = 8 // зазор между плитками, px; видимый зазор между превью = tileGap + 2 × tileInset (было 16 + 16 = 32, стало 24)
export const tileRatio = '1 / 1' // квадратное превью страниц-сеток (Spaces, Actions); в «Мозаике» у каждой плитки своя пропорция
export const tileInset = 8 // отступ превью от края плитки: это и поле подложки при наведении
export const tileCaption = 52 // высота подписи под превью
// Пружина перестроения: плитки плавно перестраиваются при зуме, смене вида и фильтре; колесо шлёт новые цели каждый кадр — пружина подхватывает на лету
export const tileSpring = { type: 'spring', stiffness: 520, damping: 42 } as const
export const scaleRange = { min: 0.4, max: 1.8 } // пределы масштаба колеса

// Сколько колонок помещается в ширину width (минимум одна)
export const columnsFor = (width: number, size: number) => Math.max(1, Math.floor((width + tileGap) / (size + tileGap)))

// Для страниц на обычном CSS-grid (Spaces, Actions): колонок столько, сколько влезает по size, и они растягиваются — как у раскладки контента.
// minColumns — не меньше стольких колонок на узком экране: плитка уже size, но не одна на весь телефон (Spaces на 375 — 2, аудит 2026-10-13)
export const tileGridStyle = (size: number, minColumns = 1) => ({
  display: 'grid',
  gridTemplateColumns: `repeat(auto-fill, minmax(min(${size}px, (100% - ${(minColumns - 1) * tileGap}px) / ${minColumns}), 1fr))`,
  gap: tileGap,
}) as const
