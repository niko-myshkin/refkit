export type Port = 'material' | 'text' | 'screen' | 'image'
export type NodeDef = { label: string; mcpLabel: string; group: string; port: Port; inputs: string[]; single?: boolean; legacy?: boolean; source?: boolean; runnable?: boolean; viewOnly?: boolean; output?: 'text' | 'html'; fields: { client: string[]; server: string[]; computed: string[] }; thumb: 'box' | 'text' | 'frame' }
type AnyNode = { id?: string; type?: string; data?: Record<string, unknown> } | undefined | null
export const NODE_TYPES: Record<string, NodeDef>
export function typeIds(): string[]
export function nodeDef(type: unknown): NodeDef | undefined
export function isRunnable(type: unknown): boolean
export function runnableTypes(): string[]
export function serverFields(type: unknown): string[]
export function derivedFields(type: unknown): string[]
export function portOf(node: AnyNode): Port
export function accepts(target: AnyNode, source: AnyNode): boolean
export function wouldCycle(source: string, target: string, edges: Array<{ source?: unknown; target?: unknown }>): boolean
export function connectionError(source: AnyNode, target: AnyNode, edges: Array<{ source?: unknown; target?: unknown }>): string | null
export function stripDerived(type: unknown, data: Record<string, unknown> | undefined): Record<string, unknown>
export function thumbOf(type: unknown): 'box' | 'text' | 'frame'
export function mcpLabel(type: unknown): string
