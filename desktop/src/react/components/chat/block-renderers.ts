
import type { FC } from 'react';

type BlockRendererProps = { block: any; agentId?: string | null; sessionPath?: string }; // eslint-disable-line @typescript-eslint/no-explicit-any

export const BLOCK_RENDERERS: Record<string, FC<BlockRendererProps>> = {};

export function registerBlockRenderer(type: string, component: FC<BlockRendererProps>) {
  BLOCK_RENDERERS[type] = component;
}
