import type { ReactFlowProps } from "@xyflow/react";
import { Background, ReactFlow, useStore } from "@xyflow/react";
import type { ReactNode } from "react";

import "@xyflow/react/dist/style.css";

type CanvasProps = ReactFlowProps & {
  children?: ReactNode;
  // Мельче точки фона (лендинг): size — диаметр на экране, gap — шаг; по умолчанию 1,5 и 20
  dots?: { size: number; gap: number };
};

// Точки фона не растут и не разлетаются с масштабом (как у Weave): размер всегда 1,5 px на экране, шаг на экране держится в пределах 20–40 px —
// отдалили вдвое, шаг в координатах холста удвоился, приблизили — вдвое сократился. Шаги кратны степени двойки, поэтому точки совпадают при смене шага
const DOT_GAP = 20
function Dots({ size = 1.5, step = DOT_GAP }: { size?: number; step?: number }) {
  const zoom = useStore((state) => state.transform[2])
  const gap = step * 2 ** Math.ceil(-Math.log2(zoom))
  return <Background bgColor="var(--canvas-bg)" color="color-mix(in oklab, var(--foreground) 14%, transparent)" gap={gap} size={size / zoom} />
}

const deleteKeyCode = ["Backspace", "Delete"];

export const Canvas = ({ children, dots, ...props }: CanvasProps) => (
  <ReactFlow
    deleteKeyCode={deleteKeyCode}
    fitView
    panOnDrag={false}
    panOnScroll
    selectionOnDrag={true}
    zoomOnDoubleClick={false}
    {...props}
  >
    <Dots size={dots?.size} step={dots?.gap} />
    {children}
  </ReactFlow>
);
