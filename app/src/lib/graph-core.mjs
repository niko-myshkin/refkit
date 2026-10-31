// Граф понятий (grill-graph.md): чистые функции над library/graph.json — общий код сервера, MCP и страницы «Граф».
// В файле лежат «сырые» понятия на материал; слияние синонимичных форм («интерфейсная метафора» = «метафора интерфейса»)
// делается здесь, без модели и без правки данных: ключ понятия — отсортированные основы слов.
import { queryStems } from './stem.mjs'

export const conceptKey = (name) => [...new Set(queryStems(name))].sort().join(' ')

// items: { [id]: { concepts: string[], relations: [...] } }; present — id материалов, которые ещё есть в библиотеке
export function derive(items, present) {
  const groups = new Map()
  for (const [id, item] of Object.entries(items ?? {})) {
    if (present && !present.has(id)) continue
    for (const form of item.concepts ?? []) {
      const key = conceptKey(form)
      if (!key) continue
      const group = groups.get(key) ?? { key, forms: new Map(), ids: new Set() }
      group.forms.set(form, (group.forms.get(form) ?? 0) + 1)
      group.ids.add(id)
      groups.set(key, group)
    }
  }
  const concepts = [...groups.values()].map((group) => ({
    key: group.key,
    // Название — самая частая форма, при равенстве короткая
    name: [...group.forms.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0][0],
    ids: [...group.ids],
    count: group.ids.size,
  })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ru'))
  const byKey = new Map(concepts.map((concept) => [concept.key, concept]))
  const byId = new Map()
  for (const concept of concepts) for (const id of concept.ids) byId.set(id, [...(byId.get(id) ?? []), concept])
  // На холст идут понятия из ≥2 материалов — они и сшивают граф; одиночные остаются в панели материала
  const hubs = concepts.filter((concept) => concept.count >= 2)
  return { concepts, hubs, byKey, byId }
}

// Соседи понятия — те, с которыми оно делит материалы; чем больше общих, тем ближе
export function neighbours(graph, key) {
  const concept = graph.byKey.get(key)
  if (!concept) return []
  const score = new Map()
  for (const id of concept.ids) for (const other of graph.byId.get(id) ?? []) if (other.key !== key) score.set(other.key, (score.get(other.key) ?? 0) + 1)
  return [...score.entries()].sort((a, b) => b[1] - a[1]).map(([other, shared]) => ({ concept: graph.byKey.get(other), shared }))
}

// Поиск по смыслу: слова запроса по основам против понятий (совпадение по началу основы — «пружин» находит «пружинная»).
// direct — материалы, у которых понятие совпало; near — материалы соседних понятий найденных (на шаг дальше)
export function find(graph, query) {
  const wanted = queryStems(query).filter((stem) => stem.length >= 3)
  if (!wanted.length) return { matched: [], direct: [], near: [] }
  const matched = []
  for (const concept of graph.concepts) {
    const own = concept.key.split(' ').filter((stem) => stem.length >= 3)
    const hits = wanted.filter((word) => own.some((stem) => stem.startsWith(word) || word.startsWith(stem)))
    if (hits.length) matched.push({ concept, hits: hits.length })
  }
  matched.sort((a, b) => b.hits - a.hits || b.concept.count - a.concept.count)
  // Материал получает очки за каждое совпавшее понятие: чем больше слов запроса понятие покрыло, тем выше
  const score = new Map(), via = new Map()
  for (const { concept, hits } of matched) for (const id of concept.ids) {
    score.set(id, (score.get(id) ?? 0) + hits)
    via.set(id, [...(via.get(id) ?? []), concept.name])
  }
  const direct = [...score.entries()].sort((a, b) => b[1] - a[1]).map(([id, points]) => ({ id, points, via: via.get(id) }))
  const seen = new Set(direct.map((item) => item.id))
  const near = []
  for (const { concept } of matched.slice(0, 3)) for (const { concept: next } of neighbours(graph, concept.key).slice(0, 4)) for (const id of next.ids) {
    if (seen.has(id)) continue
    seen.add(id)
    near.push({ id, via: [next.name], from: concept.name })
  }
  return { matched, direct, near }
}

// Сводка для отчёта «находки о себе»: что копится, какие понятия сшивают, какие пары идут вместе
export function summary(graph, titleOf = (id) => id, limit = 40) {
  const pairs = new Map()
  for (const concepts of graph.byId.values()) {
    const hubs = concepts.filter((concept) => concept.count >= 2)
    for (let i = 0; i < hubs.length; i++) for (let j = i + 1; j < hubs.length; j++) {
      const key = [hubs[i].name, hubs[j].name].sort().join(' + ')
      pairs.set(key, (pairs.get(key) ?? 0) + 1)
    }
  }
  return {
    materials: graph.byId.size,
    concepts: graph.concepts.length,
    hubs: graph.hubs.length,
    top: graph.hubs.slice(0, limit).map((concept) => ({ name: concept.name, count: concept.count, materials: concept.ids.slice(0, 4).map(titleOf) })),
    pairs: [...pairs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([pair, count]) => `${pair} (${count})`),
    lonely: graph.concepts.filter((concept) => concept.count === 1).length,
  }
}

// Связи между общими понятиями: два понятия связаны, если делят материал; вес — сколько материалов общих.
// Граф «только понятия» читается лучше, чем «материалы + понятия»: материалы показываем по требованию (вокруг выбранного)
export function conceptLinks(graph) {
  const weight = new Map()
  for (const concept of graph.hubs) for (const id of concept.ids) for (const other of graph.byId.get(id) ?? []) {
    if (other.count < 2 || other.key <= concept.key) continue
    const key = `${concept.key}\u0000${other.key}`
    weight.set(key, (weight.get(key) ?? 0) + 1)
  }
  return [...weight.entries()].map(([key, shared]) => { const [a, b] = key.split('\u0000'); return { a, b, shared } })
}

// Алгоритм Лувена (максимизация модулярности) на взвешенном графе понятий: ищет группы, внутри которых связей заметно
// больше, чем было бы случайно. Распространение меток, которое было здесь раньше, на плотном графе склеивало всё в одно
// сообщество. Детерминирован: узлы идут по порядку индексов, ничья — в пользу текущего сообщества.
export function louvain(count, edges, resolution = 1) {
  let adj = Array.from({ length: count }, () => new Map())
  let self = new Array(count).fill(0)
  for (const [a, b, w] of edges) { adj[a].set(b, (adj[a].get(b) ?? 0) + w); adj[b].set(a, (adj[b].get(a) ?? 0) + w) }
  let member = Array.from({ length: count }, (_, i) => i) // исходный узел → сообщество на текущем уровне
  for (let level = 0; level < 10; level++) {
    const n = adj.length
    const k = adj.map((links, i) => [...links.values()].reduce((sum, w) => sum + w, 0) + self[i])
    const m2 = k.reduce((sum, w) => sum + w, 0)
    if (!m2) break
    const com = Array.from({ length: n }, (_, i) => i)
    const tot = k.slice()
    let moved = false
    for (let round = 0; round < 25; round++) {
      let changed = false
      for (let i = 0; i < n; i++) {
        const own = com[i]
        const toward = new Map()
        for (const [j, w] of adj[i]) toward.set(com[j], (toward.get(com[j]) ?? 0) + w)
        tot[own] -= k[i]
        let best = own, bestGain = (toward.get(own) ?? 0) - resolution * tot[own] * k[i] / m2
        for (const [c, w] of toward) {
          const gain = w - resolution * tot[c] * k[i] / m2
          if (gain > bestGain + 1e-12 || (Math.abs(gain - bestGain) <= 1e-12 && c < best && best !== own)) { best = c; bestGain = gain }
        }
        tot[best] += k[i]
        if (best !== own) { com[i] = best; changed = true; moved = true }
      }
      if (!changed) break
    }
    if (!moved) break
    // Свернуть сообщества в узлы следующего уровня
    const label = new Map(), order = []
    for (const c of com) if (!label.has(c)) { label.set(c, order.length); order.push(c) }
    const next = Array.from({ length: order.length }, () => new Map())
    const nextSelf = new Array(order.length).fill(0)
    for (let i = 0; i < n; i++) {
      const ci = label.get(com[i])
      nextSelf[ci] += self[i]
      for (const [j, w] of adj[i]) { const cj = label.get(com[j]); if (ci === cj) nextSelf[ci] += w; else next[ci].set(cj, (next[ci].get(cj) ?? 0) + w) }
    }
    member = member.map((c) => label.get(com[c]))
    adj = next; self = nextSelf
    if (order.length === 1) break
  }
  return member
}

// Сообщества без модели. Раскраска не меняется между открытиями (порядок по ключам). Название — самое крупное понятие
// в сообществе (по числу материалов), цвет выдаёт интерфейс по номеру: самое большое сообщество — 0.
export function communities(graph, links = conceptLinks(graph), resolution = 1) {
  const keys = graph.hubs.map((concept) => concept.key).sort()
  const index = new Map(keys.map((key, i) => [key, i]))
  const edges = links.filter((link) => index.has(link.a) && index.has(link.b)).map((link) => [index.get(link.a), index.get(link.b), link.shared])
  const member = louvain(keys.length, edges, resolution)
  const groups = new Map()
  keys.forEach((key, i) => groups.set(member[i], [...(groups.get(member[i]) ?? []), key]))
  // Сообщество из одного понятия — не сообщество: такие точки остаются без группы (номер -1, нейтральный цвет в интерфейсе)
  const ordered = [...groups.values()].filter((members) => members.length > 1).sort((x, y) => y.length - x.length || x[0].localeCompare(y[0]))
  const of = new Map(keys.map((key) => [key, -1])), list = []
  ordered.forEach((members, number) => {
    const top = members.map((key) => graph.byKey.get(key)).sort((x, y) => y.count - x.count || x.name.localeCompare(y.name, 'ru'))[0]
    list.push({ index: number, name: top.name, size: members.length, keys: members })
    for (const key of members) of.set(key, number)
  })
  return { of, list }
}

// Что показывать на холсте. Порог «понятие в ≥N материалах» растёт с размером библиотеки: на 25 материалах хватает двух,
// на 111 два дают клубок из 125 понятий и 712 связей, три — 65 и 120. cap — предел узлов, остальное остаётся в панели.
export function visibleHubs(graph, { all = false, cap = 60 } = {}) {
  const materials = graph.byId.size
  const min = all ? 2 : materials <= 60 ? 2 : materials <= 150 ? 3 : materials <= 300 ? 4 : 5
  const picked = graph.hubs.filter((concept) => concept.count >= min).slice(0, all ? Infinity : cap)
  return { hubs: picked, min, total: graph.hubs.length }
}

// Кратчайший путь между двумя понятиями по общим материалам: «А → (материал) → Б». Для MCP «как связаны А и Б»
export function path(graph, from, to) {
  const start = graph.byKey.get(from), goal = graph.byKey.get(to)
  if (!start || !goal) return null
  if (start.key === goal.key) return []
  const seen = new Map([[start.key, null]])
  const queue = [start.key]
  while (queue.length) {
    const key = queue.shift()
    for (const { concept, shared } of neighbours(graph, key)) {
      if (seen.has(concept.key)) continue
      const id = graph.byKey.get(key).ids.find((item) => concept.ids.includes(item))
      seen.set(concept.key, { from: key, via: id, shared })
      if (concept.key === goal.key) {
        const steps = []
        for (let at = goal.key; seen.get(at); at = seen.get(at).from) steps.unshift({ concept: graph.byKey.get(at), via: seen.get(at).via })
        return steps
      }
      queue.push(concept.key)
    }
  }
  return null
}

// «Рядом с этим материалом»: другие материалы, с которыми он делит понятия. Редкое общее понятие весит больше частого
// (вес 1/ln(1+число материалов с ним)), поэтому «агент ×5» не перебивает «обратная связь ×2»
export function nearby(graph, id, limit = 5) {
  const score = new Map(), why = new Map()
  for (const concept of graph.byId.get(id) ?? []) {
    if (concept.count < 2) continue
    const weight = 1 / Math.log(1 + concept.count)
    for (const other of concept.ids) {
      if (other === id) continue
      score.set(other, (score.get(other) ?? 0) + weight)
      why.set(other, [...(why.get(other) ?? []), concept.name])
    }
  }
  return [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([other, points]) => ({ id: other, points, via: why.get(other) }))
}

// Связи между карточками (граф «как у Fabric»: узлы — материалы). У каждой карточки оставляем несколько ближайших
// соседей по общим понятиям (nearby), связь неориентированная: объединение, вес — лучшее из двух направлений.
// Без ограничения «k ближайших» плотные понятия («ии-агент ×21») склеили бы всё в клубок.
export function cardLinks(graph, ids, perCard = 3) {
  const allowed = new Set(ids)
  const links = new Map()
  for (const id of ids) {
    for (const hit of nearby(graph, id, perCard * 3).filter((item) => allowed.has(item.id)).slice(0, perCard)) {
      const [a, b] = id < hit.id ? [id, hit.id] : [hit.id, id]
      const key = `${a}\u0000${b}`
      const old = links.get(key)
      if (!old || hit.points > old.score) links.set(key, { a, b, score: hit.points, via: hit.via })
    }
  }
  return [...links.values()]
}

// Кластеры карточек: Лувен по связям между карточками. Название кластера — понятие, которое встречается у большего
// числа его карточек. Кластер из одной карточки — без группы (-1).
export function clusterCards(graph, ids, links) {
  const order = [...ids].sort()
  const index = new Map(order.map((id, i) => [id, i]))
  const member = louvain(order.length, links.filter((l) => index.has(l.a) && index.has(l.b)).map((l) => [index.get(l.a), index.get(l.b), l.score]))
  const groups = new Map()
  order.forEach((id, i) => groups.set(member[i], [...(groups.get(member[i]) ?? []), id]))
  const multi = [...groups.values()].filter((members) => members.length > 1).sort((x, y) => y.length - x.length || x[0].localeCompare(y[0]))
  const of = new Map(order.map((id) => [id, -1])), list = [], named = new Set()
  multi.forEach((members, number) => {
    const tally = new Map()
    for (const id of members) for (const concept of graph.byId.get(id) ?? []) if (concept.count >= 2) tally.set(concept.key, (tally.get(concept.key) ?? 0) + 1)
    // Название — самое частое понятие среди карточек кластера, которое ещё не дало имя другому кластеру
    const ranked = [...tally.entries()].sort((a, b) => b[1] - a[1] || graph.byKey.get(b[0]).count - graph.byKey.get(a[0]).count)
    const top = ranked.find(([key]) => !named.has(key)) ?? ranked[0]
    if (top) named.add(top[0])
    list.push({ index: number, name: top ? graph.byKey.get(top[0]).name : `Группа ${number + 1}`, size: members.length, ids: members })
    for (const id of members) of.set(id, number)
  })
  return { of, list }
}
