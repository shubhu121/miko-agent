export type LocateStep = 'scroll' | 'load-more' | 'wait' | 'wait-element' | 'refresh' | 'give-up';

export interface LocateStepInput {
  targetIndex: number;
  elementPresent: boolean;
  
  itemPresent: boolean;
  oldestId: string | undefined;
  hasMore: boolean;
  loadingMore: boolean;
  
  newestNumericId: number | null;
}

export function resolveLocateStep(input: LocateStepInput): LocateStep {
  if (input.elementPresent) return 'scroll';
  
  
  if (input.itemPresent) return 'wait-element';
  
  
  
  if (input.newestNumericId === null || input.targetIndex > input.newestNumericId) return 'refresh';
  const oldest = Number(input.oldestId ?? NaN);
  if (!Number.isFinite(oldest)) return 'refresh'; 
  if (input.targetIndex < oldest) {
    if (input.loadingMore) return 'wait';
    return input.hasMore ? 'load-more' : 'give-up';
  }
  return 'give-up'; 
}
