export type CNode = { id: string; type?: string; position?: { x: number; y: number }; width?: number; height?: number; data?: Record<string, any>; [key: string]: unknown }
export type CEdge = { id?: string; source?: string; target?: string; [key: string]: unknown }
export type Op =
  | { op: 'add_node'; id?: string; type: string; position?: { x: number; y: number }; data?: Record<string, any> }
  | { op: 'update_node'; id: string; data: Record<string, any> }
  | { op: 'delete_node'; id: string }
  | { op: 'connect'; source: string; target: string }
  | { op: 'disconnect'; source: string; target: string }
export type Proposal = { id: string; by: string; at: number; note?: string; ops: Op[] }
export type Trash = Record<string, { type?: string; at: number; keep: Record<string, any> }>
export type CanvasData = { nodes: CNode[]; edges: CEdge[]; rev?: number; proposals?: Proposal[]; trash?: Trash }
export const AGENT_TYPES: string[]
export function splitBy(text: string, start: RegExp): string[]
export function splitItems(text: string): string[]
export function canvasNode(data: CanvasData, id: string): CNode | undefined
export function canvasInputs(data: CanvasData, nodeId: string): CNode[]
export function actionOf(data: CanvasData, result: CNode): CNode | undefined
export function choiceItems(data: CanvasData, choice: CNode): string[]
export function upstreamActions(data: CanvasData, node: CNode): string[]
export function mergeIncoming(disk: CNode[], incoming: CNode[]): CNode[]
export function mergeWithTrash(disk: CNode[], incoming: CNode[], trash?: Trash): { nodes: CNode[]; trash: Trash }
export function applyOps(data: CanvasData, ops: Op[]): { data: CanvasData; error?: string }
export { accepts, portOf } from './canvas-nodes.mjs'
export function migrateResults(data: CanvasData): CanvasData
export function migrateLists(data: CanvasData): CanvasData

export const ACTIVE_FIELDS: string[]
export function activeData(node: CNode): NonNullable<CNode['data']>
export function withActive(node: CNode): CNode
