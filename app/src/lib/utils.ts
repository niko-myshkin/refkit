import { createCn } from "cn/config"

// cn — склейка классов с вытеснением: из двух скруглений остаётся последнее.
// Роли скругления, размеры текста и caption (index.css) пакет не знает, поэтому объявлены здесь: иначе такой класс рядом
// с обычным (например в shadcn-компоненте, где значение переопределяют) оставил бы оба, и победитель зависел бы от порядка в CSS.
// caption = размер + цвет, поэтому вытесняет и размер текста, и цвет текста (и сам ими вытесняется).
// Новый токен или утилита в index.css → дописать сюда.
export const cn = createCn({
  extend: {
    classGroups: {
      rounded: [{ rounded: ["control", "surface", "container"] }],
      "font-size": [{ text: ["micro", "body", "note", "note-body", "note-mini"] }],
      caption: ["caption"],
    },
    conflictingClassGroups: {
      caption: ["font-size", "text-color"],
      "font-size": ["caption"],
      "text-color": ["caption"],
    },
  },
})

// Ссылка, по которой источник открывается там, где он живёт: пост закрытого канала Telegram (t.me/c/<канал>/<номер>)
// браузер не покажет — открываем сразу в приложении Telegram. Остальное — как есть
export const sourceHref = (url: string) => {
  const post = url.match(/^https?:\/\/t\.me\/c\/(\d+)\/(\d+)/)
  return post ? `tg://privatepost?channel=${post[1]}&post=${post[2]}` : url
}
