import { ContextMenu, type ContextMenuItem } from '../../ui';
import {
  copyValueForLink,
  openExternalLink,
  resolveLinkTarget,
  type LinkOpenContext,
} from '../../utils/link-open';

export interface LinkContextMenuState {
  href: string;
  context: LinkOpenContext;
  position: { x: number; y: number };
}

interface LinkContextMenuProps {
  state: LinkContextMenuState;
  onClose: () => void;
}

function tr(key: string, fallback: string): string {
  const value = window.t?.(key);
  return value && value !== key ? value : fallback;
}

export function LinkContextMenu({ state, onClose }: LinkContextMenuProps) {
  const target = resolveLinkTarget(state.href, state.context);
  const isFile = target.kind === 'file';
  const copyLabel = isFile
    ? tr('link.copyPath', "This feature is available in English only.")
    : tr('link.copyLink', "This feature is available in English only.");
  const openLabel = isFile
    ? tr('desk.openWithDefault', "This feature is available in English only.")
    : tr('link.openInSystemBrowser', "This feature is available in English only.");

  const items: ContextMenuItem[] = [
    {
      label: openLabel,
      disabled: target.kind === 'anchor',
      action: () => { openExternalLink(state.href, state.context); },
    },
    {
      label: copyLabel,
      action: () => {
        navigator.clipboard.writeText(copyValueForLink(state.href, state.context)).catch(() => {});
      },
    },
  ];

  return (
    <ContextMenu
      items={items}
      position={state.position}
      onClose={onClose}
    />
  );
}
