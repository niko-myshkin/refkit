export const PROMPTS: Record<string, string>
export type ChainNode = { id: string; type: string; position: { x: number; y: number }; width: number; height: number; data: Record<string, unknown> }
export function hypothesisChain(options: { idea?: string; constraints?: string; moodboard?: { key: string; name: string } | null; frames: { key: string; name: string } }): { nodes: ChainNode[]; edges: Array<[string, string]>; stages: Array<{ id: string; label: string; hue: number; members: string[] }> }
