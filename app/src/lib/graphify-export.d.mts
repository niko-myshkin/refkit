import type { GraphItem } from './graph-core.mjs'
export function toGraphify(items: Record<string, GraphItem>, metas: Array<{ id: string; title: string; kind?: string; format?: string; collections?: string[] }>): { directed: boolean; multigraph: boolean; graph: Record<string, unknown>; nodes: Array<Record<string, unknown>>; links: Array<Record<string, unknown>> }
export function toGraphNotes(items: Record<string, GraphItem>, metas: Array<{ id: string; title: string }>, options?: { builtAt?: number; model?: string; report?: string; libraryName?: string }): string
