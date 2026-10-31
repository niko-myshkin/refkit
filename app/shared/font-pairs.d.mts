export type Face = { family: string; pkg: string; kind: 'variable' | 'static'; fallback: string; file?: string; files?: Array<[number, string]> }
export const FONT_PAIRS: Record<string, { display: Face; text: Face; label: Face; weight: number }>
export const PAIR_NAMES: string[]
export function cssFamily(face: Face): string
export function findPair(text: string): string
export function pairFontCss(name: string, fileUrl: (pkg: string, file: string) => string): string
