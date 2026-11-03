import type { Kind } from '@/lib/library'

// «Скачать» материал из библиотеки на компьютер: файл картинки или видео как есть, заметка и статья — текстом в .md.
// Холст, ролик YouTube и ссылка без файла не скачиваются: у них нет своего файла (у ролика и ссылки — источник, у холста — «Скачать» на самих нодах).
type Downloadable = { id: string; title: string; kind?: Kind; image?: string; media?: Array<{ image: string; video?: string }> }

const fileOf = (reference: Downloadable): { url: string; ext: string } | null => {
  if (reference.kind === 'note' || reference.kind === 'article') return { url: `/library/${reference.id}/text.txt`, ext: 'md' }
  if (reference.kind) return null
  const url = reference.media?.[0]?.video ?? reference.image
  if (!url?.startsWith('/library/')) return null
  const path = url.split('?')[0]
  return { url: path, ext: path.split('.').pop() || 'bin' }
}

export const canDownload = (reference: Downloadable) => fileOf(reference) !== null

export async function downloadReference(reference: Downloadable) {
  const file = fileOf(reference)
  if (!file) return
  const name = `${reference.title.replace(/[\\/:*?"<>|]+/g, '-').trim().slice(0, 80) || 'refkit'}.${file.ext}`
  const response = await fetch(file.url)
  if (!response.ok) return
  const link = document.createElement('a')
  link.href = URL.createObjectURL(await response.blob())
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(link.href), 1000)
}
