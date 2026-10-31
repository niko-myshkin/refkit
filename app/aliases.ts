// Одинаковые компоненты и иконки в приложении и в собранных экранах.
export const aliases = [
  { find: '@', replacement: `${import.meta.dirname}/src` },
  { find: /^lucide-react-real$/, replacement: `${import.meta.dirname}/node_modules/lucide-react/dist/esm/lucide-react.mjs` },
  { find: /^lucide-react$/, replacement: `${import.meta.dirname}/src/icons/lucide-shim.tsx` },
]
