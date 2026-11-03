import type { ChainNode } from './hypothesis-template.mjs'
export const PROMPTS: Record<string, string>
type Folder = { key: string; name: string; kind?: 'folder' | 'board' }
export function brandbookChain(options: { brief?: string; refs: Folder }): { nodes: ChainNode[]; edges: Array<[string, string]>; stages: Array<{ id: string; label: string; hue: number; members: string[] }> }
