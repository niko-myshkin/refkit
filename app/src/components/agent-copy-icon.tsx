import { createLucideIcon } from 'lucide-react'

// Буфер со вспышкой: передать агенту, в отличие от двух листов «Дублировать».
export const AgentCopyIcon = createLucideIcon('AgentCopy', [
  ['path', { d: 'M16 4h2a2 2 0 0 1 2 2v4M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2', key: 'body' }],
  ['rect', { x: '8', y: '2', width: '8', height: '4', rx: '1', key: 'clip' }],
  ['path', { d: 'm18 9 1.3 3.7L23 14l-3.7 1.3L18 19l-1.3-3.7L13 14l3.7-1.3Z', key: 'spark' }],
])
