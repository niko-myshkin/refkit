export type Concept = { key: string; name: string; ids: string[]; count: number }
export type Graph = { concepts: Concept[]; hubs: Concept[]; byKey: Map<string, Concept>; byId: Map<string, Concept[]> }
export type GraphItem = { at?: number; concepts: string[]; relations?: Array<{ from: string; to: string; label: string }>; usage?: { input: number; output: number } }
export function conceptKey(name: string): string
export function derive(items: Record<string, GraphItem> | undefined, present?: Set<string>): Graph
export function neighbours(graph: Graph, key: string): Array<{ concept: Concept; shared: number }>
export function find(graph: Graph, query: string): { matched: Array<{ concept: Concept; hits: number }>; direct: Array<{ id: string; points: number; via: string[] }>; near: Array<{ id: string; via: string[]; from: string }> }
export function summary(graph: Graph, titleOf?: (id: string) => string, limit?: number): { materials: number; concepts: number; hubs: number; top: Array<{ name: string; count: number; materials: string[] }>; pairs: string[]; lonely: number }
export function conceptLinks(graph: Graph): Array<{ a: string; b: string; shared: number }>
export function communities(graph: Graph, links?: Array<{ a: string; b: string; shared: number }>, resolution?: number): { of: Map<string, number>; list: Array<{ index: number; name: string; size: number; keys: string[] }> }
export function path(graph: Graph, from: string, to: string): Array<{ concept: Concept; via: string }> | null
export function nearby(graph: Graph, id: string, limit?: number): Array<{ id: string; points: number; via: string[] }>
export function visibleHubs(graph: Graph, options?: { all?: boolean; cap?: number }): { hubs: Concept[]; min: number; total: number }
export function louvain(count: number, edges: Array<[number, number, number]>, resolution?: number): number[]
export function cardLinks(graph: Graph, ids: string[], perCard?: number): Array<{ a: string; b: string; score: number; via: string[] }>
export function clusterCards(graph: Graph, ids: string[], links: Array<{ a: string; b: string; score: number }>): { of: Map<string, number>; list: Array<{ index: number; name: string; size: number; ids: string[] }> }
