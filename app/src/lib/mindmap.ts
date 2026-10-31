// Дерево для вида «Карта» (grill-mindmap.md, grill-taxonomy.md): корень → разделы (Типы, Теги, Подборки) → группы →
// карточки. Без модели — из того, что уже есть. Карточка повторяется в ветках (ролик — в своём типе, в двух тегах и в
// подборке), поэтому id узла — путь в дереве, а карточка — в item
export type MapNode<T> =
  | { kind: 'root' | 'section' | 'group'; id: string; label: string; count: number; children: MapNode<T>[] }
  | { kind: 'item'; id: string; label: string; item: T }

type Mappable = { id: string; title: string }
export type MapGroup = { id: string; label: string }
// Раздел: какие у него группы и в какие группы попадает карточка (в тип — в одну, в теги и подборки — в несколько)
export type MapSection<T> = { id: string; label: string; groups: MapGroup[]; groupsOf: (item: T) => string[] }

export function buildMap<T extends Mappable>(items: T[], rootLabel: string, sections: MapSection<T>[]): MapNode<T> {
  const children = sections.flatMap((section): MapNode<T>[] => {
    // Порядок групп — как в меню; пустые не показываем, пустой раздел — тоже
    const groups = section.groups.flatMap(({ id, label }): MapNode<T>[] => {
      const path = `${section.id}/${id}`
      const list = items.filter((item) => section.groupsOf(item).includes(id))
      return list.length ? [{ kind: 'group', id: path, label, count: list.length, children: list.map((item) => ({ kind: 'item', id: `${path}/${item.id}`, label: item.title, item })) }] : []
    })
    const count = new Set(groups.flatMap((group) => group.kind === 'item' ? [] : group.children.map((child) => child.kind === 'item' ? child.item.id : ''))).size
    return groups.length ? [{ kind: 'section', id: section.id, label: section.label, count, children: groups }] : []
  })
  return { kind: 'root', id: 'root', label: rootLabel, count: items.length, children }
}
