import type { ChainNode } from './hypothesis-template.mjs'
export const PROMPTS: Record<string, string | ((at: number) => string)>
type Folder = { key: string; name: string }
export function landingReferenceChain(options: { notes?: string; docs?: Array<{ title: string; text: string }>; session?: string; shots: Folder; refs?: Folder | null }): { nodes: ChainNode[]; edges: Array<[string, string]>; stages: Array<{ id: string; label: string; hue: number; members: string[] }> }
