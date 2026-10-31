// Файл картинки от агента (refkit_save с file): что принимаем. Чистая проверка — тестируется без сервера.
export const maxImageBytes = 20 * 1024 * 1024
export const imageExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.gif']

// null — годится; иначе понятная причина для агента
export function imageFileProblem(path, ext, stat) {
  if (!path || !path.startsWith('/')) return 'Нужен абсолютный путь к файлу (начинается с /).'
  if (!stat) return `Файла нет: ${path}`
  if (!stat.isFile) return `Это не файл: ${path}`
  if (!imageExtensions.includes(String(ext).toLowerCase())) return `Расширение ${ext || '(нет)'} не подходит: принимаю ${imageExtensions.join(', ')}.`
  if (stat.size === 0) return 'Файл пустой.'
  if (stat.size > maxImageBytes) return `Файл ${Math.round(stat.size / 1048576)} МБ, предел ${maxImageBytes / 1048576} МБ.`
  return null
}

// Подборки материалов при пакетном предложении: к чему добавить, не трогая то, что уже есть
export const withBoard = (boards, name) => (boards ?? []).includes(name) ? boards : [...(boards ?? []), name]
