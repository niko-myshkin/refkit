// Формат разбора из двух слоёв — теперь только для калибровки (03_design/calibration/run.mjs); приложение собирает 1:1 без разбора.
// Слой 1 — scene graph: буквальная опись кропа без смысла (перерисовщик).
// Слой 2 — синтез: что из описи составляет приём, рецепт переноса, выводы, чек-лист (без картинки).
// Сборка — слепок источника по двум слоям.

const n = { type: ['number', 'null'] }
const s = { type: ['string', 'null'] }
const strs = { type: 'array', items: { type: 'string' } }

const element = {
  type: 'object', additionalProperties: false,
  required: ['id', 'type', 'z', 'parent', 'bbox', 'cx', 'cy', 'r', 'innerR', 'startAngle', 'endAngle', 'fill', 'stroke', 'strokeWidth', 'cornerRadius', 'text', 'fontSize', 'fontWeight', 'rotation', 'repeat', 'confidence', 'note'],
  properties: {
    id: { type: 'string' },
    type: { type: 'string', enum: ['rect', 'circle', 'ring', 'arc', 'line', 'text', 'icon', 'image', 'radialRepeat'] },
    z: { type: 'number' }, parent: s,
    bbox: { type: 'object', additionalProperties: false, required: ['x', 'y', 'w', 'h'], properties: { x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' } } },
    cx: n, cy: n, r: n, innerR: n, startAngle: n, endAngle: n,
    fill: s, stroke: s, strokeWidth: n, cornerRadius: n,
    text: s, fontSize: n, fontWeight: n, rotation: n,
    repeat: {
      type: ['object', 'null'], additionalProperties: false,
      required: ['count', 'fromAngle', 'toAngle', 'rInner', 'rOuter', 'markWidth', 'color', 'skipped', 'variants'],
      properties: {
        count: { type: 'number' }, fromAngle: { type: 'number' }, toAngle: { type: 'number' }, rInner: { type: 'number' }, rOuter: { type: 'number' }, markWidth: { type: 'number' }, color: { type: 'string' },
        skipped: { type: 'string' },
        variants: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['atAngle', 'rInner', 'rOuter', 'color'], properties: { atAngle: { type: 'number' }, rInner: { type: 'number' }, rOuter: { type: 'number' }, color: { type: 'string' } } } },
      },
    },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] }, note: s,
  },
}

export const sceneSchema = {
  type: 'object', additionalProperties: false, required: ['canvas', 'background', 'elements', 'uncertain'],
  properties: {
    canvas: { type: 'object', additionalProperties: false, required: ['w', 'h'], properties: { w: { type: 'number' }, h: { type: 'number' } } },
    background: { type: 'string' },
    elements: { type: 'array', items: element },
    uncertain: strs,
  },
}

export const DEFAULT_AREA = 'всё, что видно в кадре, включая элементы, частично обрезанные краем или перекрытые другими.'

export function scenePrompt(w: number, h: number, area: string = DEFAULT_AREA) {
  return [
    `Ты — перерисовщик. Картинка приложена, её размер ${w}×${h} px. Ничего не запускай и не читай файлы — только смотри на картинку.`,
    'Задача: снять точную опись того, что нарисовано, чтобы другой агент перерисовал это, не видя картинки. Никакого смысла, назначения и догадок о логике — только геометрия, цвет и текст.',
    `Область: ${area}`,
    'Правила:',
    '— все координаты и размеры в пикселях этой картинки (0,0 — левый верхний угол, ось y вниз); bbox — видимая рамка элемента;',
    '— круглые формы: cx, cy, r; кольца — r внешний и innerR; если форма обрезана краем карточки, дай полный геометрический центр и радиус и укажи в note, чем обрезана;',
    '— углы в градусах: 0° — направо от центра, 90° — вверх, 180° — налево;',
    '— rotation у текста — поворот по часовой стрелке в градусах, как CSS rotate; перевёрнутый текст = 180;',
    '— цвета hex, как на пикселях; текстура — в note;',
    '— повторяющиеся метки по дуге — один элемент radialRepeat: count, диапазон углов, радиусы, толщина; выделенные метки (другой цвет или длина) — в variants; пропуски (где метки нет) — в skipped;',
    '— каждую подпись шкалы — отдельным элементом text со своим углом и поворотом; текст переписывай буквально;',
    '— z — порядок слоёв снизу вверх; parent — id родителя или null;',
    '— confidence честно; всё, что не смог определить, — в uncertain. Не заполняй поля выдумкой: неприменимое — null.',
  ].join('\n')
}

export const synthSchema = {
  type: 'object', additionalProperties: false,
  required: ['technique', 'keepIds', 'excludeIds', 'transferableRecipe', 'inferences', 'acceptanceChecklist'],
  properties: {
    technique: { type: 'string' }, keepIds: strs, excludeIds: strs, transferableRecipe: strs, acceptanceChecklist: strs,
    inferences: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['claim', 'confidence', 'evidence'], properties: { claim: { type: 'string' }, confidence: { type: 'string' }, evidence: { type: 'string' } } } },
  },
}

export function synthPrompt(owner: string, scene: string) {
  return [
    'Ниже — scene graph UI-референса: буквальная опись, снятая перерисовщиком. Картинки нет. Ничего не запускай.',
    `Владелец сохранил реф ради приёма: «${owner}».`,
    'Задача — второй слой разбора поверх описи:',
    '— technique: одна фраза, в чём приём;',
    '— keepIds: id элементов, которые составляют приём и его носитель; excludeIds: id элементов, которые к приёму не относятся (их не собирают);',
    '— transferableRecipe: правила переноса приёма в другой проект — пропорции и закономерности вместо пикселей, цвета ролями, без исходных текстов и брендов;',
    '— inferences: закономерности, которые ты выводишь (шаг делений, связь подписей с углом и т. п.), с уверенностью и опорой на конкретные поля описи;',
    '— acceptanceChecklist: проверяемые пункты, по которым видно, что сборка повторила слепок.',
    'Не выдумывай интерактивность. Scene graph не переписывай — он хранится отдельно как есть.',
    '',
    'scene graph:',
    scene,
  ].join('\n')
}

export type SceneGraph = { canvas: { w: number; h: number }; background: string; elements: Array<{ id: string; type: string; confidence: string }>; uncertain: string[] }
export type Synthesis = { technique: string; keepIds: string[]; excludeIds: string[]; transferableRecipe: string[]; inferences: Array<{ claim: string; confidence: string; evidence: string }>; acceptanceChecklist: string[] }

// Слепая сборка (калибровка): только два файла, без картинки.
export function blindBuildPrompt(w: number, h: number) {
  return [
    'В папке два файла: scene-graph.json (точная опись источника) и recipe.json (смысловой слой). Картинки нет и искать её не нужно — читай только эти два файла.',
    `Собери index.html — слепок источника: холст ровно ${w}×${h} px (html, body без отступов, ничего не масштабировать), элементы на своих координатах из scene graph.`,
    'Собирай только элементы из recipe.keepIds (и их детей); excludeIds не рисуй. Фон холста вне карточки — scene-graph.background.',
    'Геометрию, цвета, тексты, повороты и повторы бери из scene graph буквально. Где опись молчит — минимальное решение и комментарий /* ASSUMPTION: … */.',
    'Один самодостаточный файл: HTML + CSS + inline SVG, без внешних ресурсов и скриптов. Шрифт — системный гротеск.',
  ].join('\n')
}

// recipe.md собирается кодом из синтеза — без модели.
export function recipeMarkdown(title: string, synth: Synthesis, scene: SceneGraph) {
  return [
    `# ${title}`, '', synth.technique, '',
    '## Как перенести', ...synth.transferableRecipe.map((rule, i) => `${i + 1}. ${rule}`), '',
    '## Закономерности', ...synth.inferences.map((item) => `- ${item.claim} (${item.confidence}; ${item.evidence})`), '',
    '## Проверка', ...synth.acceptanceChecklist.map((item) => `- [ ] ${item}`), '',
    '## Слепок', `Scene graph: ${scene.elements.length} элементов, холст ${scene.canvas.w}×${scene.canvas.h}. В приём входят: ${synth.keepIds.join(', ')}.`,
    ...(scene.uncertain.length ? ['', '## Не удалось разглядеть', ...scene.uncertain.map((item) => `- ${item}`)] : []),
  ].join('\n')
}
