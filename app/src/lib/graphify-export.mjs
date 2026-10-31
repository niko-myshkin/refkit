// Наш граф понятий → формат Graphify (graph.json, networkx node_link): так его читают инструменты и агенты, знающие
// Graphify (query/path/explain, MCP, cluster-only), а мы остаёмся хозяевами извлечения (по кнопке, своя модель).
// Узел — материал или понятие; связь материал→понятие помечена происхождением: EXTRACTED — владелец подтвердил своим
// тегом, INFERRED — понятие вытащила модель. Схема: github.com/Graphify-Labs/graphify, graphify/validate.py
import { communities, conceptKey, derive } from './graph-core.mjs'

// metas: [{ id, title, kind, collections? }] — материалы библиотеки; items — graph.json библиотеки
export function toGraphify(items, metas) {
  const byId = new Map(metas.map((meta) => [meta.id, meta]))
  const graph = derive(items, new Set(byId.keys()))
  const groups = communities(graph)
  const nodes = [], links = []
  const file = (id) => `library/${id}/text.txt`
  for (const [id] of graph.byId) {
    const meta = byId.get(id)
    nodes.push({ id, label: meta.title, file_type: meta.kind === 'image' || meta.format === 'image' ? 'image' : 'document', source_file: file(id), kind: meta.kind ?? meta.format })
  }
  for (const concept of graph.concepts) {
    nodes.push({ id: `concept:${concept.key}`, label: concept.name, file_type: 'document', source_file: file(concept.ids[0]), mentions: concept.count, community: groups.of.get(concept.key) ?? -1 })
    for (const id of concept.ids) {
      const owned = (byId.get(id)?.collections ?? []).some((tag) => conceptKey(tag) === concept.key)
      links.push({ source: id, target: `concept:${concept.key}`, relation: 'mentions', confidence: owned ? 'EXTRACTED' : 'INFERRED', source_file: file(id) })
    }
  }
  // Связи внутри материала (from → to с подписью), если оба понятия в графе; сливаем по ключу понятия
  for (const [id, item] of Object.entries(items)) {
    if (!byId.has(id)) continue
    for (const relation of item.relations ?? []) {
      const a = conceptKey(relation.from), b = conceptKey(relation.to)
      if (!a || !b || a === b || !graph.byKey.has(a) || !graph.byKey.has(b)) continue
      links.push({ source: `concept:${a}`, target: `concept:${b}`, relation: String(relation.label || 'related').slice(0, 40), confidence: 'INFERRED', source_file: file(id) })
    }
  }
  return { directed: false, multigraph: false, graph: { generator: 'refkit', source: 'library/graph.json' }, nodes, links }
}

// Короткая записка для агентов, которые читают папку файлами (Claude Code, Codex в другом проекте): что за граф, как читать,
// как спрашивать. Лежит рядом с graph.json: library/graphify-out/GRAPH.md
export function toGraphNotes(items, metas, { builtAt, model, report, libraryName = 'library' } = {}) {
  const byId = new Map(metas.map((meta) => [meta.id, meta]))
  const graph = derive(items, new Set(byId.keys()))
  const groups = communities(graph)
  const title = (id) => byId.get(id)?.title ?? id
  const lines = [
    '# Граф понятий библиотеки Refkit',
    '',
    `Собран ${builtAt ? new Date(builtAt).toLocaleDateString('ru-RU') : 'недавно'}${model ? ` моделью ${model}` : ''} по кнопке владельца: ${graph.byId.size} материалов, ${graph.concepts.length} понятий, из них общих (в ≥2 материалах) ${graph.hubs.length}.`,
    'Это производные данные: источник правды — материалы и теги владельца. Файл пересобирается, когда владелец нажимает «Обновить» в Refkit.',
    '',
    '## Как читать graph.json',
    '- Формат Graphify (networkx node_link): `nodes` и `links`. Читает любой инструмент, знающий Graphify.',
    `- Узел-материал: \`id\` = имя папки в \`${libraryName}/\`, \`label\` — название, \`source_file\` — \`${libraryName}/<id>/text.txt\`.`,
    '- Узел-понятие: `id` вида `concept:<ключ>`, `label` — название, `mentions` — в скольких материалах, `community` — номер сообщества (-1 — без группы).',
    '- Связь `mentions`: материал → понятие. `confidence`: EXTRACTED — владелец подтвердил своим тегом, INFERRED — понятие вытащила модель из текста.',
    '- Связь между понятиями — подпись отношения (`часть`, `нужен для`…), всегда INFERRED.',
    '',
    '## Как спрашивать',
    '- Через MCP Refkit: инструмент `refkit_graph` (по смыслу, «как связаны А и Б» через from/to, обзор без запроса). Он понимает формы слов.',
    '- Через Graphify CLI: `graphify path "А" "Б" --graph library/graphify-out/graph.json`, `graphify explain "понятие" --graph …`.',
    '',
    `## Главные понятия (${Math.min(graph.hubs.length, 20)} из ${graph.hubs.length})`,
    ...graph.hubs.slice(0, 20).map((concept) => `- ${concept.name} — ${concept.count}: ${concept.ids.slice(0, 3).map(title).join('; ')}`),
    '',
    `## Сообщества (${groups.list.length})`,
    ...groups.list.map((group) => `- ${group.index}. «${group.name}» — ${group.size} понятий: ${group.keys.slice(0, 6).map((key) => graph.byKey.get(key).name).join(', ')}`),
  ]
  if (report) lines.push('', '## Находки владельца о себе', '', report.trim())
  return lines.join('\n') + '\n'
}
