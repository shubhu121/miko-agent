import { memo, useEffect, useState } from 'react';
import { ChatResourceCard } from './ChatResourceCard';
import { mikoFetch } from '../../hooks/use-miko-fetch';
import { useStore } from '../../stores';
import { sessionIdForPathFromLocatorState } from '../../stores/session-slice';
import { AgentAvatar, resolveAgentDisplayInfo } from '../../utils/agent-display';
import { SelectWidget, type SelectOption } from '@/ui';
import styles from './Chat.module.css';



type ApplyErrorState =
  | { code: 'draft_expired'; text: string }
  | { code: 'draft_in_flight'; text: string }
  | { code: 'first_message_failed'; text: string; sessionId?: string }
  | { code: 'apply_failed'; text: string };

function shortIdTail(id: string | null): string {
  return id ? `…${id.slice(-4)}` : '';
}

export const SessionCollabDraftCard = memo(function SessionCollabDraftCard({ block, sessionPath }: { block: any; sessionPath?: string }) {
  const isCreate = block.kind === 'session_create_draft';
  const detail = block.detail || {};
  const draft = detail.draft || {};

  const agents = useStore(s => s.agents);
  const currentAgentId = useStore(s => s.currentAgentId);
  const fallbackAgentName = useStore(s => s.agentName) || 'Miko';
  const fallbackAgentYuan = useStore(s => s.agentYuan) || 'miko';
  
  
  
  const sourceSessionId = useStore(state => sessionIdForPathFromLocatorState(state, sessionPath));
  const targetSessionId = (block.target?.sessionId as string | undefined) || null;
  const targetSessionTitle = useStore(s => (
    targetSessionId ? (s.sessions.find(se => se.sessionId === targetSessionId)?.title ?? null) : null
  ));

  const [status, setStatus] = useState(block.status);
  const [draftMessage, setDraftMessage] = useState<string>(
    ((isCreate ? draft.firstMessage : draft.message) as string) || '',
  );
  const [draftTitle, setDraftTitle] = useState<string>((draft.title as string) || '');
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(
    (draft.agentId as string) || currentAgentId || agents[0]?.id || null,
  );
  const [errorState, setErrorState] = useState<ApplyErrorState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [createdSessionId, setCreatedSessionId] = useState<string | null>(null);

  useEffect(() => {
    setStatus(block.status);
  }, [block.status]);

  const effectiveAgentId = selectedAgentId || currentAgentId || agents[0]?.id || null;
  const selectedAgentInfo = resolveAgentDisplayInfo({
    id: effectiveAgentId,
    agents,
    fallbackAgentName,
    fallbackAgentYuan,
  });
  
  
  const targetAgentInfo = resolveAgentDisplayInfo({
    id: (block.target?.agentId as string) || null,
    agents,
    fallbackAgentName: (block.target?.agentName as string) || undefined,
    fallbackAgentYuan: (block.target?.agentId as string) || undefined,
  });
  const headerAgentInfo = isCreate ? selectedAgentInfo : targetAgentInfo;
  
  
  const displayTitle = isCreate
    ? (block.title || window.t('sessionCollab.messageField'))
    : (targetSessionTitle
        || (block.target?.sessionTitle as string | undefined)
        || (block.target?.agentName
              ? `${block.target.agentName as string} ${shortIdTail(targetSessionId)}`.trim()
              : null)
        || window.t('sessionCollab.messageField'));

  const pending = status === 'pending';
  const expired = errorState?.code === 'draft_expired';

  const handleApprove = async () => {
    if (submitting) return;
    setSubmitting(true);
    setErrorState(null);
    try {
      const editedDraft = isCreate
        ? { ...draft, agentId: effectiveAgentId, title: draftTitle, firstMessage: draftMessage }
        : { ...draft, message: draftMessage };
      const res = await mikoFetch('/api/session-collab/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestionId: block.suggestionId, draft: editedDraft }),
        throwOnHttpError: false,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setCreatedSessionId((data?.result?.sessionId as string) || null);
        setStatus('approved');
        return;
      }
      const code = data?.code;
      if (code === 'draft_expired') {
        setErrorState({ code: 'draft_expired', text: window.t('sessionCollab.expired') });
        return;
      }
      if (code === 'draft_in_flight') {
        setErrorState({ code: 'draft_in_flight', text: window.t('sessionCollab.inFlight') });
        return;
      }
      if (code === 'first_message_failed') {
        const sid = (data?.sessionId as string) || '';
        setErrorState({
          code: 'first_message_failed',
          sessionId: sid,
          text: window.t('sessionCollab.halfCreated', { id: sid }),
        });
        return;
      }
      setErrorState({
        code: 'apply_failed',
        text: window.t('sessionCollab.sendFailed', { error: (data?.error as string) || res.statusText }),
      });
    } catch (err: any) {
      setErrorState({
        code: 'apply_failed',
        text: window.t('sessionCollab.sendFailed', { error: err?.message || String(err) }),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleIgnore = async () => {
    if (submitting || rejecting) return;
    setRejecting(true);
    setErrorState(null);
    try {
      const body: Record<string, unknown> = { suggestionId: block.suggestionId };
      if (sourceSessionId) body.sourceSessionId = sourceSessionId;
      const res = await mikoFetch('/api/session-collab/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        throwOnHttpError: false,
      });
      
      
      if (res.ok || res.status === 404) {
        setStatus('rejected');
        return;
      }
      if (res.status === 409) {
        setErrorState({ code: 'draft_in_flight', text: window.t('sessionCollab.inFlight') });
        return;
      }
      const data = await res.json().catch(() => ({}));
      setErrorState({
        code: 'apply_failed',
        text: window.t('sessionCollab.rejectFailed', { error: (data?.error as string) || res.statusText }),
      });
    } catch (err: any) {
      setErrorState({
        code: 'apply_failed',
        text: window.t('sessionCollab.rejectFailed', { error: err?.message || String(err) }),
      });
    } finally {
      setRejecting(false);
    }
  };

  if (!pending) {
    const isApproved = status === 'approved';
    const effectiveCreatedId = createdSessionId || (block.resultSessionId as string | undefined) || null;
    const subtitle = isApproved && isCreate && effectiveCreatedId
      ? window.t('sessionCollab.createdSession', { id: effectiveCreatedId })
      : block.description;
    return (
      <ChatResourceCard
        icon={<AgentAvatar info={headerAgentInfo} className={styles.sessionCollabDraftAvatar} alt={headerAgentInfo.displayName} />}
        title={displayTitle}
        subtitle={subtitle}
        statusLabel={isApproved ? window.t('common.approved') : window.t('common.rejected')}
        statusTone={isApproved ? 'success' : 'muted'}
        className={styles.sessionCollabDraftCard}
      />
    );
  }

  
  
  
  const pendingCardProps = isCreate
    ? { headerless: true as const }
    : {
      icon: <AgentAvatar info={headerAgentInfo} className={styles.sessionCollabDraftAvatar} alt={headerAgentInfo.displayName} />,
      title: displayTitle,
      subtitle: block.description,
      expandable: false,
      expanded: true,
    };
  return (
    <ChatResourceCard
      {...pendingCardProps}
      className={styles.sessionCollabDraftCard}
    >
      <div className={styles.sessionCollabDraftBody}>
        {isCreate && (
          <>
            <label className={styles.automationDraftField}>
              <span>{window.t('automation.field.agent')}</span>
              <SelectWidget
                className={styles.automationDraftAgentSelect}
                triggerClassName={styles.automationDraftControlButton}
                popupClassName={styles.automationDraftAgentPopup}
                value={effectiveAgentId || ''}
                options={agents.map((agent: any): SelectOption => ({
                  value: agent.id,
                  label: agent.name || agent.id,
                }))}
                onChange={(value) => setSelectedAgentId(value)}
                align="start"
                density="comfortable"
                renderTrigger={(_option, isOpen) => (
                  <>
                    <AgentAvatar info={selectedAgentInfo} className={styles.automationDraftAgentAvatar} />
                    <span className={styles.automationDraftAgentName}>{selectedAgentInfo.displayName}</span>
                    <svg className={styles.automationDraftControlArrow} data-open={isOpen} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M4 6l4 4 4-4" />
                    </svg>
                  </>
                )}
                renderOption={(option, selected) => {
                  const info = resolveAgentDisplayInfo({
                    id: option.value,
                    agents,
                    fallbackAgentName: option.label,
                  });
                  return (
                    <span className={styles.automationDraftAgentOption} data-selected={selected}>
                      <AgentAvatar info={info} className={styles.automationDraftAgentAvatar} />
                      <span>{info.displayName}</span>
                    </span>
                  );
                }}
              />
            </label>
            <input
              className={styles.sessionCollabDraftTitleInput}
              value={draftTitle}
              onChange={e => setDraftTitle(e.target.value)}
              placeholder={window.t('automation.field.label')}
              spellCheck={false}
            />
          </>
        )}
        <textarea
          className={styles.sessionCollabDraftTextarea}
          value={draftMessage}
          onChange={e => setDraftMessage(e.target.value)}
          aria-label={window.t('sessionCollab.messageField')}
          spellCheck={false}
        />
        {errorState && (
          <div className={styles.sessionCollabDraftError}>{errorState.text}</div>
        )}
        <div className={styles.automationDraftActions}>
          <button
            className={styles.automationDraftTextButton}
            type="button"
            onClick={handleIgnore}
            disabled={submitting || rejecting}
          >
            {window.t('sessionCollab.ignore')}
          </button>
          <button
            className={styles.automationDraftPrimaryButton}
            type="button"
            onClick={handleApprove}
            disabled={submitting || rejecting || expired}
          >
            {window.t(isCreate ? 'sessionCollab.confirmCreate' : 'sessionCollab.confirmSend')}
          </button>
        </div>
      </div>
    </ChatResourceCard>
  );
});
