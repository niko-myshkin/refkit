// Источник: Interaction Kit, Armond Schneider — https://interactionkit.org/view/ («Thumbnail to focus»).
// Взято как есть. Правки: next/image заменён на <img> (проект не на Next.js);
// добавлено свойство panels — слой поверх открытого вида для панелей Refkit;
// добавлено свойство card — открытый вид внутри карточки: картинка вырастает в слот media, без перетаскивания;
// добавлено свойство thumbnailTransition — своя скорость перетекания превью (полка).
// Подпись превью для скринридера — по-русски, как весь интерфейс.
import { useEffect, useState, type ReactNode } from "react";
import { t } from '@/lib/i18n'
import { createPortal } from "react-dom";
import { AnimatePresence, LayoutGroup, animate, motion, useMotionValue, useTransform, type Transition } from "framer-motion";

type Props = {
  src: string;
  alt?: string;
  layoutId?: string;
  className?: string;
  expandedClassName?: string;
  backdropClassName?: string;
  animateLayout?: boolean;
  panels?: (close: () => void) => ReactNode;
  card?: (media: ReactNode, close: () => void) => ReactNode;
  mediaContent?: ReactNode;
  // Refkit: своё превью вместо картинки — у заметки картинки нет, плитка показывает текст
  thumbnail?: ReactNode;
  // Refkit: своя скорость перетекания превью — полке нужна мягче, чем открытию карточки
  thumbnailTransition?: Transition;
  // Refkit: открыться само (новая заметка-синтез после полки); onAutoOpened — сбросить флаг у родителя
  autoOpen?: boolean;
  onAutoOpened?: () => void;
  // Refkit: клик по превью — своё действие вместо окна (карточка страницей, идея 61)
  onOpen?: (from: HTMLElement) => void;
};

export default function ImageModal({ src, alt = '', layoutId, className = '', expandedClassName = '', backdropClassName = '', animateLayout = false, panels, card, mediaContent, thumbnail, thumbnailTransition, autoOpen, onAutoOpened, onOpen }: Props) {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (autoOpen) { setOpen(true); onAutoOpened?.(); } }, [autoOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  const id = layoutId || `img-modal-${src.slice(-10)}`;
  const image = open ? { src, alt } : null;
  const onClose = () => setOpen(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (image) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [image]);

  useEffect(() => {
    if (!image) return;
    const prev = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
    return () => {
      document.body.style.overflow = prev;
      document.body.style.paddingRight = prevPaddingRight;
    };
  }, [image]);

  const closeIfDragged = (offset: { x: number; y: number }, velocity: { x: number; y: number }) => {
    const threshold = 140;
    const velocityThreshold = 650;
    const didClose =
      Math.abs(offset.x) > threshold ||
      Math.abs(offset.y) > threshold ||
      Math.abs(velocity.x) > velocityThreshold ||
      Math.abs(velocity.y) > velocityThreshold;
    return didClose;
  };

  const viewTransition = { duration: 0.32, ease: [0.22, 1, 0.36, 1] as const };

  const mvX = useMotionValue(0);
  const mvY = useMotionValue(0);
  const rotateZ = useTransform(mvX, [-300, 300], [-2.5, 2.5]);
  const rotateX = useTransform(mvY, [-300, 300], [2.5, -2.5]);

  // Reset motion values when modal closes
  useEffect(() => {
    if (!open) {
      mvX.set(0);
      mvY.set(0);
    }
  }, [open, mvX, mvY]);

  return (
    <LayoutGroup id={`image-modal-${id}`}>
      <motion.button
        layout={animateLayout}
        layoutId={id}
        type="button"
        onClick={(event) => onOpen ? onOpen(event.currentTarget) : setOpen(true)}
        className={`relative h-48 w-full cursor-pointer overflow-hidden rounded-surface bg-neutral-100 dark:bg-neutral-800 has-[[data-note]]:bg-transparent dark:has-[[data-note]]:bg-transparent sm:h-56 md:h-64 ${className}`}
        aria-label={t('Открыть «{alt}»', { alt })}
        transition={thumbnailTransition ?? viewTransition}
      >
        {thumbnail ?? <img
          src={src}
          alt={alt}
          className="absolute inset-0 h-full w-full object-cover"
        />}
      </motion.button>

      {/* Окно — в body, вне плитки: плитка перетаскивается (draggable), и внутри неё выделение текста стало бы перетаскиванием */}
      {createPortal(<AnimatePresence>
        {image && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className={`fixed inset-0 z-(--z-backdrop) cursor-pointer bg-black/40 backdrop-blur-md ${backdropClassName}`}
              onClick={onClose}
            />

            {card ? (
            <motion.div
              key="card"
              className="pointer-events-none fixed inset-0 z-(--z-card) flex items-center justify-center p-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              {card(
                <motion.div layoutId={id} transition={viewTransition} className="relative h-full w-full overflow-hidden rounded-surface bg-neutral-100 dark:bg-neutral-900">
                  {mediaContent ?? <img src={image.src} alt={image.alt ?? ""} className="absolute inset-0 h-full w-full object-contain" />}
                </motion.div>,
                onClose,
              )}
            </motion.div>
            ) : (
            <motion.div
              key="container"
              className="pointer-events-none fixed inset-0 z-(--z-card) flex items-center justify-center p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
            <motion.div
              drag
              style={{
                x: mvX,
                y: mvY,
                rotateZ,
                rotateX,
              }}
              dragConstraints={{ top: -90, left: -90, right: 90, bottom: 90 }}
              dragElastic={0.22}
              onDragEnd={(_, info) => {
                const shouldClose = closeIfDragged(info.offset, info.velocity);
                if (shouldClose) {
                  animate(mvX, info.offset.x + info.velocity.x * 80, { duration: 0.16, ease: "easeOut" });
                  animate(mvY, info.offset.y + info.velocity.y * 80, { duration: 0.16, ease: "easeOut" });
                  setTimeout(() => {
                    mvX.set(0);
                    mvY.set(0);
                    onClose();
                  }, 160);
                } else {
                  animate(mvX, 0, { duration: 0.22, ease: [0.22, 1, 0.36, 1] });
                  animate(mvY, 0, { duration: 0.22, ease: [0.22, 1, 0.36, 1] });
                }
              }}
              whileDrag={{ scale: 1.01 }}
              className="pointer-events-auto cursor-grab touch-none [perspective:1200px] [will-change:transform] active:cursor-grabbing"
              onClick={(e) => e.stopPropagation()}
            >
              <motion.div
                layoutId={id}
                transition={viewTransition}
                className={`aspect-video w-[min(900px,92vw)] max-h-[90vh] overflow-hidden rounded-surface bg-white shadow-sm dark:bg-neutral-900 ${expandedClassName}`}
              >
              <div className="relative h-full w-full bg-neutral-100 dark:bg-neutral-800">
                <img
                  src={image.src}
                  alt={image.alt ?? ""}
                  className="absolute inset-0 h-full w-full object-cover min-h-full min-w-full bg-transparent select-none cursor-grab active:cursor-grabbing"
                  draggable={false}
                  onDragStart={(e) => e.preventDefault()}
                />
              </div>
              </motion.div>
            </motion.div>
          </motion.div>
          )}
          {panels && (
            <motion.div
              key="panels"
              className="pointer-events-none fixed inset-0 z-(--z-panels)"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              {panels(onClose)}
            </motion.div>
          )}
        </>
      )}
    </AnimatePresence>, document.body)}
    </LayoutGroup>
  );
}
