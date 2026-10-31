import type { ChainNode } from './hypothesis-template.mjs'
export const PROMPTS: Record<string, string | ((at: number) => string)>
export const FRAGMENT_COUNT: number
type Folder = { key: string; name: string }
export function productLandingChain(options: { notes?: string; docs?: Array<{ title: string; text: string }>; session?: string; shots: Folder; refs?: Folder | null; fragments: Folder }): { nodes: ChainNode[]; edges: Array<[string, string]>; stages: Array<{ id: string; label: string; hue: number; members: string[] }> }
