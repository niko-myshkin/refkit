// Пружины для framer-motion — те же, что токены --ease-spring-* в index.css (CSS-переходы сайдбара и всплывающих слоёв):
// раскрытие 240 мс с отскоком 0.12, сворачивание 160 мс без отскока. Меняется пружина → правятся оба места
export const springOpen = { type: 'spring', duration: 0.24, bounce: 0.12 } as const
export const springClose = { type: 'spring', duration: 0.16, bounce: 0 } as const
