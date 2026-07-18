
import { useEffect, useRef, useState } from 'react';
import { Collapse } from '@/ui';
import { useStore } from '../../stores';
import { selectAgentActivities, type AgentActivityEntry } from '../../stores/agent-activity-slice';
import { AgentAvatar, resolveAgentDisplayInfo } from '../../utils/agent-display';
import { SubagentSessionPreview } from '../chat/SubagentSessionPreview';
import { formatElapsed } from '../../utils/format-duration';
import { ParallelStepIcon, PipelineStepIcon, LogStepIcon } from '../shared/WorkflowStepIcons';
import type { Agent } from '../../types';
import styles from './WorkflowCard.module.css';

const STATUS_ICON: Record<AgentActivityEntry['status'], string> = {
  running: '◐',
  done: '✓',
  failed: '✗',
  aborted: '⊘',
};

function rank(status: AgentActivityEntry['status']): number {
  return status === 'running' ? 0 : 1;
}

function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}


function durationLabel(w: AgentActivityEntry, now: number, t: (k: string, v?: Record<string, string | number>) => string): string {
  if (w.status === 'running' && w.startedAt) {
    return t('rightWorkspace.workflow.running', { text: formatElapsed(now - w.startedAt) });
  }
  if (w.finishedAt && w.startedAt) {
    return t('activity.duration', { text: formatElapsed(w.finishedAt - w.startedAt) });
  }
  return '';
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg className={styles.chevron} data-open={open} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function StepShape({ stepKind, size = 16 }: { stepKind: string | null | undefined; size?: number }) {
  switch (stepKind) {
    case 'parallel': return <ParallelStepIcon size={size} />;
    case 'pipeline': return <PipelineStepIcon size={size} />;
    case 'log': return <LogStepIcon size={size} />;
    default: return <PipelineStepIcon size={size} />;
  }
}

function groupByPhase(nodes: AgentActivityEntry[]): { phaseLabel: string | null; nodes: AgentActivityEntry[] }[] {
  const map = new Map<string | null, AgentActivityEntry[]>();
  for (const n of nodes) {
    const key = n.phaseLabel || null;
    const list = map.get(key) || [];
    list.push(n);
    map.set(key, list);
  }
  const groups: { phaseLabel: string | null; nodes: AgentActivityEntry[] }[] = [];
  if (map.has(null)) groups.push({ phaseLabel: null, nodes: map.get(null)! });
  for (const [key, list] of map) {
    if (key !== null) groups.push({ phaseLabel: key, nodes: list });
  }
  return groups;
}


function WorkflowNodeRow({ node, agents, open, onToggle }: {
  node: AgentActivityEntry;
  agents: Agent[];
  open: boolean;
  onToggle: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const isStep = node.kind === 'workflow_step';

  const info = isStep ? null : resolveAgentDisplayInfo({
    id: node.agentId,
    agents,
    fallbackAgentName: node.label || node.agentName || node.agentId || 'agent',
  });
  const displayName = isStep
    ? (node.label || node.stepKind || 'step')
    : (node.label || info!.displayName);
  const tokenText = typeof node.tokens === 'number' ? `${formatTokens(node.tokens)} tok` : (isStep ? '─' : '');

  useEffect(() => {
    if (open && node.childSessionPath) {
      useStore.getState().setSubagentPreviewSessionPath(node.id, node.childSessionPath);
    }
  }, [open, node.childSessionPath, node.id]);

  return (
    <div className={styles.nodeItem}>
      <button
        type="button"
        className={styles.nodeRow}
        data-status={node.status}
        onClick={isStep ? undefined : onToggle}
        aria-expanded={isStep ? undefined : open}
      >
        <span className={`${styles.statusIcon} ${styles[`status-${node.status}`] ?? ''}`} aria-hidden="true">{STATUS_ICON[node.status]}</span>
        {isStep ? (
          <span className={styles.stepIcon}><StepShape stepKind={node.stepKind} /></span>
        ) : (
          <span className={styles.nodeAvatar}><AgentAvatar info={info!} className={styles.nodeAvatarImg} alt={displayName} /></span>
        )}
        <span className={styles.nodeName} title={displayName}>{displayName}</span>
        {tokenText && <span className={styles.nodeTokens}>{tokenText}</span>}
      </button>
      {!isStep && (
        <Collapse open={open}>
          <div className={styles.details}>
            <div ref={scrollRef} className={styles.scroll}>
              <SubagentSessionPreview
                taskId={node.id}
                sessionPath={node.childSessionPath}
                agentId={node.agentId}
                streamStatus={node.status}
                summary={node.summary}
                scrollContainerRef={scrollRef}
              />
            </div>
          </div>
        </Collapse>
      )}
    </div>
  );
}


function PhaseSection({ phaseLabel, nodes, agents, expandedNodes, onToggleNode }: {
  phaseLabel: string | null;
  nodes: AgentActivityEntry[];
  agents: Agent[];
  now: number;
  expandedNodes: Record<string, boolean>;
  onToggleNode: (id: string) => void;
}) {
  const hasRunning = nodes.some((n) => n.status === 'running');
  const [open, setOpen] = useState(hasRunning);
  const doneCount = nodes.filter((n) => n.status === 'done').length;
  const total = nodes.length;
  const sorted = [...nodes].sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0));
  const preview = sorted.slice(0, 5);

  useEffect(() => {
    if (hasRunning) setOpen(true);
  }, [hasRunning]);

  return (
    <div className={styles.phaseSection}>
      {phaseLabel && (
        <button type="button" className={styles.phaseHeader} onClick={() => setOpen((o) => !o)}>
          <Chevron open={open} />
          <span className={styles.phaseName} title={phaseLabel}>{phaseLabel}</span>
          <span className={styles.headerDots}>
            {preview.map((node) => {
              if (node.kind === 'workflow_step') {
                return (
                  <span key={node.id} className={styles.miniDot} data-step-kind={node.stepKind}>
                    <StepShape stepKind={node.stepKind} size={12} />
                  </span>
                );
              }
              const info = resolveAgentDisplayInfo({
                id: node.agentId,
                agents,
                fallbackAgentName: node.label || node.agentName || node.agentId || 'agent',
              });
              return (
                <span key={node.id} className={styles.miniAvatar}>
                  <AgentAvatar info={info} alt={info.displayName} />
                </span>
              );
            })}
            {sorted.length > 5 && <span className={styles.miniEllipsis}>…</span>}
          </span>
          <span className={styles.phaseCount}>{doneCount}/{total}</span>
        </button>
      )}
      <Collapse open={open || !phaseLabel}>
        <div className={styles.phaseNodes}>
          {nodes.map((n) => (
            <WorkflowNodeRow
              key={n.id}
              node={n}
              agents={agents}
              open={expandedNodes[n.id] === true}
              onToggle={() => onToggleNode(n.id)}
            />
          ))}
        </div>
      </Collapse>
    </div>
  );
}


function WorkflowRow({ wf, nodes, agents, now, open, onToggle, expandedNodes, onToggleNode }: {
  wf: AgentActivityEntry;
  nodes: AgentActivityEntry[];
  agents: Agent[];
  now: number;
  open: boolean;
  onToggle: () => void;
  expandedNodes: Record<string, boolean>;
  onToggleNode: (id: string) => void;
}) {
  const t: (k: string, v?: Record<string, string | number>) => string = window.t ?? ((k: string) => k);
  const dur = durationLabel(wf, now, t);
  const agentNodes = nodes.filter((n) => n.kind === 'workflow_agent');
  const totalTokens = nodes.reduce((sum, n) => sum + (typeof n.tokens === 'number' ? n.tokens : 0), 0);
  const phases = groupByPhase(nodes);

  return (
    <div className={styles.item}>
      <button type="button" className={styles.row} data-status={wf.status} onClick={onToggle} aria-expanded={open}>
        <span className={`${styles.statusIcon} ${styles[`status-${wf.status}`] ?? ''}`} aria-hidden="true">{STATUS_ICON[wf.status]}</span>
        <span className={styles.name} title={wf.summary || ''}>{wf.summary || wf.id}</span>
        {agentNodes.length > 0 && <span className={styles.agentCount}>{t('rightWorkspace.workflow.agents', { n: agentNodes.length })}</span>}
        {totalTokens > 0 && <span className={styles.tokenSum}>{formatTokens(totalTokens)}</span>}
        {dur && <span className={styles.duration}>{dur}</span>}
      </button>
      <Collapse open={open && nodes.length > 0}>
        <div className={styles.nodeList}>
          {phases.map((group) => (
            <PhaseSection
              key={group.phaseLabel || '__default__'}
              phaseLabel={group.phaseLabel}
              nodes={group.nodes}
              agents={agents}
              now={now}
              expandedNodes={expandedNodes}
              onToggleNode={onToggleNode}
            />
          ))}
        </div>
      </Collapse>
    </div>
  );
}

export function WorkflowCard() {
  const [collapsed, setCollapsed] = useState(false);
  const [expandedWf, setExpandedWf] = useState<Record<string, boolean>>({});
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const sessionPath = useStore((s) => s.currentSessionPath);
  const all = useStore(selectAgentActivities(sessionPath));
  const agents = useStore((s) => s.agents);
  const [now, setNow] = useState(() => Date.now());

  const workflows = all.filter((a) => a.kind === 'workflow');
  const hasRunning = all.some((a) => (a.kind === 'workflow' || a.kind === 'workflow_agent' || a.kind === 'workflow_step') && a.status === 'running');

  
  useEffect(() => {
    if (!hasRunning) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [hasRunning]);

  if (!workflows.length) return null;

  const t = window.t ?? ((k: string) => k);
  const sorted = [...workflows].sort((a, b) => {
    const r = rank(a.status) - rank(b.status);
    if (r !== 0) return r;
    return (b.startedAt ?? 0) - (a.startedAt ?? 0);
  });

  
  const nodesOf = (wfId: string) =>
    all.filter((a) => (a.kind === 'workflow_agent' || a.kind === 'workflow_step') && a.parentTaskId === wfId)
      .sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0));

  return (
    <section className={`universal-card ${styles.card}`} aria-label="Workflow" data-collapsed={collapsed || undefined}>
      <button className={styles.header} type="button" onClick={() => setCollapsed((c) => !c)} aria-expanded={!collapsed}>
        <span className={styles.title}>{t('rightWorkspace.workflow.title')}</span>
        <span className={styles.count}>{sorted.length}</span>
        <Chevron open={!collapsed} />
      </button>
      <Collapse open={!collapsed}>
        <div className={styles.list}>
          {sorted.map((wf) => (
            <WorkflowRow
              key={wf.id}
              wf={wf}
              nodes={nodesOf(wf.id)}
              agents={agents}
              now={now}
              open={expandedWf[wf.id] === true}
              onToggle={() => setExpandedWf((p) => ({ ...p, [wf.id]: !p[wf.id] }))}
              expandedNodes={expandedNodes}
              onToggleNode={(id) => setExpandedNodes((p) => ({ ...p, [id]: !p[id] }))}
            />
          ))}
        </div>
      </Collapse>
    </section>
  );
}
