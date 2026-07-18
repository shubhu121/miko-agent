

import {
  type ReactNode,
  type CSSProperties,
  type ComponentPropsWithoutRef,
  forwardRef,
} from 'react';
import {
  motion,
  AnimatePresence,
  LayoutGroup,
  type Transition,
} from 'motion/react';
import { spring } from './motion';

// ── FadeIn ───────────────────────────────────────────

interface FadeInProps {
  children: ReactNode;
  
  preset?: keyof typeof spring;
  
  delay?: number;
  
  y?: number;
  
  className?: string;
  style?: CSSProperties;
}


export const FadeIn = forwardRef<HTMLDivElement, FadeInProps>(function FadeIn(
  { children, preset = 'paper', delay = 0, y = 4, className, style },
  ref,
) {
  const transition: Transition = delay
    ? { ...spring[preset], delay }
    : spring[preset];

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -3 }}
      transition={transition}
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  );
});

// ── Collapse ─────────────────────────────────────────

interface CollapseProps {
  
  open: boolean;
  children: ReactNode;
  
  preset?: keyof typeof spring;
  className?: string;
  style?: CSSProperties;
}


export function Collapse({ open, children, preset = 'paper', className, style }: CollapseProps) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key="collapse-body"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={spring[preset]}
          style={{ overflow: 'hidden', ...style }}
          className={className}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── SlideIn ──────────────────────────────────────────

type SlideDirection = 'left' | 'right' | 'top' | 'bottom';

interface SlideInProps {
  children: ReactNode;
  
  from?: SlideDirection;
  
  preset?: keyof typeof spring;
  
  distance?: number;
  className?: string;
  style?: CSSProperties;
}


export const SlideIn = forwardRef<HTMLDivElement, SlideInProps>(function SlideIn(
  { children, from = 'right', preset = 'paperGentle', distance = 300, className, style },
  ref,
) {
  const axis = from === 'left' || from === 'right' ? 'x' : 'y';
  const sign = from === 'right' || from === 'bottom' ? 1 : -1;
  const offset = distance * sign;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0.5, [axis]: offset }}
      animate={{ opacity: 1, [axis]: 0 }}
      exit={{ opacity: 0, [axis]: offset }}
      transition={spring[preset]}
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  );
});

// ── AnimatedList ──────────────────────────────────────

interface AnimatedListProps {
  children: ReactNode;
  
  preset?: keyof typeof spring;
  
  layoutId?: string;
  className?: string;
  style?: CSSProperties;
}


export function AnimatedList({ children, layoutId, className, style }: AnimatedListProps) {
  return (
    <LayoutGroup id={layoutId}>
      <div className={className} style={style}>
        {children}
      </div>
    </LayoutGroup>
  );
}

interface AnimatedListItemProps extends ComponentPropsWithoutRef<typeof motion.div> {
  children: ReactNode;
  
  preset?: keyof typeof spring;
}


export const AnimatedListItem = forwardRef<HTMLDivElement, AnimatedListItemProps>(
  function AnimatedListItem({ children, preset = 'paper', ...rest }, ref) {
    return (
      <motion.div
        ref={ref}
        layout
        initial={{ opacity: 0, y: 6, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, x: -20, scale: 0.95 }}
        transition={spring[preset]}
        {...rest}
      >
        {children}
      </motion.div>
    );
  },
);




export { motion, AnimatePresence, LayoutGroup };
export type { Transition };
