// Нода-ревьюер на холсте: из её ответа берутся строки «Fix: <название ноды> — <что поправить>».
// Название должно совпасть с нодой выше по цепочке (без учёта регистра, кавычек и скобок); одна правка на ноду, не больше восьми.
export function reviewFixes(result, titles) {
  const fixes = []
  for (const line of String(result).split('\n')) {
    const match = line.replace(/\*\*/g, '').match(/^\s*[-•]?\s*Fix:\s*(.+?)\s+[—–-]+\s+(.+)$/i)
    if (!match) continue
    const wanted = match[1].trim().replace(/^["«“(\[]+|["»”)\]]+$/g, '').trim().toLowerCase()
    const title = titles.find((item) => item.toLowerCase() === wanted)
    if (title && !fixes.some((fix) => fix.title === title)) fixes.push({ title, text: match[2].trim().slice(0, 400) })
  }
  return fixes.slice(0, 8)
}
