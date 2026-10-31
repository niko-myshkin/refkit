import { useState } from 'react'
import { t } from '@/lib/i18n'

// Приветствие главной (владелец 2026-10-29, как у Fabric): по часам, с именем из профиля. Без иконки погоды (убрана 2026-10-30)
// Фразочки вместо «Добрый день» (владелец 2026-10-30, как у Claude): случайная из набора под время суток, одна на заход
const phrases = {
  morning: ['Доброе утро, {name}. Поехали', 'Новый день — новые идеи'],
  day: ['Давай сделаем что-то хорошее', 'Сделаем красиво, {name}?'],
  evening: ['Добрый вечер, {name}. Ещё одна идея?', 'Вечер — для лучших идей'],
  night: ['Не спится, {name}?', 'Ночью идеи смелее'],
  // в любое время: коротко и бодро, в тоне «Let's make something good» (владелец 2026-10-30)
  any: ['Давай сделаем что-то хорошее, {name}', 'Сделаем что-то новое?', 'Время делать, {name}', 'Начнём с идеи'],
  // по дням недели: getDay() — 0 воскресенье
  monday: ['Новая неделя, {name}. Сделаем хорошее'],
  friday: ['Пятница, {name}. Доведём до красоты?'],
  weekend: ['Выходные, {name}. Без спешки'],
}

export function HomeGreeting() {
  const [text] = useState(() => {
    const now = new Date(), hour = now.getHours(), day = now.getDay()
    const time = hour >= 5 && hour < 12 ? phrases.morning : hour >= 12 && hour < 18 ? phrases.day : hour >= 18 && hour < 23 ? phrases.evening : phrases.night
    const week = day === 1 ? phrases.monday : day === 5 ? phrases.friday : day === 0 || day === 6 ? phrases.weekend : []
    const set = [...time, ...phrases.any, ...week]
    return t(set[Math.floor(Math.random() * set.length)]).replace('{name}', t('Николай'))
  })
  return (
    <h1 className="flex min-w-0 items-center justify-center text-4xl font-semibold tracking-tight">
      <span className="truncate">{text}</span>
    </h1>
  )
}
