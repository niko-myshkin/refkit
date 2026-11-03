// Все действия просмотра используют ту же версию, что видна внутри ноды.
export function shownCanvasData<T extends { activeAt?: number; history?: Array<{ result?: string; imageFile?: string }> }>(data: T) {
  const old = typeof data.activeAt === 'number' && data.activeAt >= 0 ? data.history?.[data.activeAt] : undefined
  return old ? { ...data, result: old.result, imageFile: old.imageFile } : data
}
