

import type { Transition } from 'motion/react';




const paper: Transition = { type: 'spring', stiffness: 500, damping: 38, mass: 0.8 };


const paperGentle: Transition = { type: 'spring', stiffness: 350, damping: 34, mass: 1.0 };


const paperSnap: Transition = { type: 'spring', stiffness: 600, damping: 40, mass: 0.6 };

export const spring = { paper, paperGentle, paperSnap } as const;





export const motionDuration = {
  instant: 0.08,
  fast: 0.18,
  normal: 0.28,
  slow: 0.4,
} as const;
