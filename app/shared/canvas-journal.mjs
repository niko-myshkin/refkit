// Журнал запусков холста. Результат ноды живёт внутри ноды, и пока нода жива, прошлые версии (до 8) лежат в её history.
// Журнал — отдельная копия: запись на каждый удачный запуск, которая переживает удаление ноды, перезапись версий и откат (⌘Z) на доске.
// Чистые функции без чтения файлов; ввод-вывод в library-plugin.ts.

const KINDS = ['agent', 'screen', 'image']

/** Запись журнала по ноде и результату запуска. Текст агента кладётся целиком, картинка — путём к файлу, экран — флагом (его HTML лежит отдельным файлом). */
export function journalEntry(node, at, result) {
  const type = String(node.type)
  return {
    at,
    nodeId: String(node.id),
    type,
    title: String(node.data?.title ?? ''),
    ...(type === 'agent' ? { text: String(result.result ?? '') } : {}),
    ...(type === 'image' && result.imageFile ? { imageFile: String(result.imageFile), text: String(result.result ?? '') } : {}),
    ...(type === 'screen' ? { html: true } : {}),
  }
}

/** Записи по тому, что уже лежит на доске: текущий результат и история каждой ноды-действия (для холстов, где журнала ещё не было). */
export function seedEntries(nodes) {
  const out = []
  for (const node of nodes) {
    if (!KINDS.includes(String(node.type))) continue
    const versions = [...(node.data?.history ?? []), { result: node.data?.result, imageFile: node.data?.imageFile, ranAt: node.data?.ranAt }]
    for (const version of versions) {
      if (!version?.result || !version.ranAt) continue
      out.push({ entry: journalEntry(node, Number(version.ranAt), version), result: String(version.result) })
    }
  }
  return out
}

/** Записи для показа: новые сверху; у каждой помета, жива ли нода, из которой она пришла. */
export function listEntries(entries, nodes) {
  const alive = new Set(nodes.map((node) => String(node.id)))
  return [...entries].sort((a, b) => b.at - a.at).map((entry) => ({ ...entry, deleted: !alive.has(entry.nodeId) }))
}
