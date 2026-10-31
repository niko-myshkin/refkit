// Что агент может заводить в библиотеке сам (refkit_create_space, refkit_create_canvas, refkit_move) — чистая логика,
// без файлов: тестируется без сервера. Права проверяет MCP: всё это только при permissions.library === 'allow'.

const same = (a, b) => String(a).trim().toLowerCase().replace(/ё/g, 'е') === String(b).trim().toLowerCase().replace(/ё/g, 'е')

// Папка (space) по имени; «Входящие» тоже находится, чтобы можно было вернуть материал обратно
export const findSpace = (folders, name) => (folders ?? []).find((folder) => same(folder.name, name))

// Новая папка. Уже есть с таким именем — возвращаем её (повторный вызов ничего не плодит). parent — имя родителя
export function addSpace(folders, name, parentName, now = Date.now()) {
  const clean = String(name ?? '').trim()
  if (!clean) return { error: 'Пустое название.' }
  const exists = findSpace(folders, clean)
  if (exists) return { folders, folder: exists, created: false }
  let parent
  if (parentName) {
    parent = findSpace(folders, parentName)
    if (!parent) return { error: `Родительской папки «${parentName}» нет.` }
    if (parent.inbox) return { error: 'Во «Входящие» вложенные папки не заводятся.' }
  }
  const folder = { id: `f-${now}`, name: clean, ...(parent ? { parent: parent.id } : {}) }
  return { folders: [...(folders ?? []), folder], folder, created: true }
}

// Мета нового холста — как у addCanvas в приложении (library-plugin.ts) плюс сводка для плитки
export const canvasMeta = ({ id, title, folderId, now = Date.now() }) => ({
  format: 'image', image: '', tags: [], collections: [], meaning: '', technique: '', stage: 'new',
  kind: 'canvas', title: String(title ?? '').trim() || 'Новый холст', titleEdited: true, source: '', ratio: '4 / 3',
  folder: folderId, id, createdAt: now, canvasBoxes: [], canvasEdges: 0, updatedAt: now,
})

// Свободный id по времени: две записи в одну миллисекунду не должны получить одну папку
export function freeId(exists, now = Date.now()) {
  let id = `ref-${now}`
  for (let n = 2; exists(id); n++) id = `ref-${now}-${n}`
  return id
}
