export type JournalEntry = { at: number; nodeId: string; type: string; title: string; text?: string; imageFile?: string; html?: boolean }
export function journalEntry(node: { id: unknown; type?: unknown; data?: Record<string, any> }, at: number, result: { result?: string; imageFile?: string }): JournalEntry
export function seedEntries(nodes: Array<{ id: unknown; type?: unknown; data?: Record<string, any> }>): Array<{ entry: JournalEntry; result: string }>
export function listEntries(entries: JournalEntry[], nodes: Array<{ id: unknown }>): Array<JournalEntry & { deleted: boolean }>
