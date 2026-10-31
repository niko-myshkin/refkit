// Для агентов нужен редактируемый исходник, а не мегабайты собранного React и шрифтов.
export const resultForAgent = (node) => String(node?.data?.screenSource?.code ?? node?.data?.result ?? '')
