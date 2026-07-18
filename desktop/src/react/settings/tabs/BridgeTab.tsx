import React from 'react';
import { t } from '../helpers';
import { PlatformSection } from './bridge/PlatformSection';
import { useBridgeState } from './bridge/useBridgeState';
import type { BridgeSecretDraft } from './bridge/useBridgeSecretDrafts';
import { BridgeAgentRow } from './bridge/BridgeAgentRow';
import { BridgePermissionModeSelect, type BridgePermissionMode } from './bridge/BridgeWidgets';
import {
  BRIDGE_SETTINGS_PLATFORMS,
  bridgePlatformLabel,
  type BridgePlatform,
} from '../../utils/bridge-platforms';
import { SettingsSection } from '../components/SettingsSection';
import { SettingsRow } from '../components/SettingsRow';
import { Toggle } from '@/ui';
import { useSettingsStore } from '../store';
import styles from '../Settings.module.css';

function hasUsableSecret(draft: BridgeSecretDraft) {
  return draft.dirty ? !!draft.value.trim() : draft.hasStored;
}

function credentialPayload(fields: Record<string, string>, secretField: string, draft: BridgeSecretDraft) {
  return draft.dirty ? { ...fields, [secretField]: draft.value.trim() } : fields;
}

function shouldUseSavedSecret(draft: BridgeSecretDraft) {
  return !draft.dirty && draft.hasStored;
}

function storedSecretPlaceholder(draft: BridgeSecretDraft) {
  return draft.hasStored && !draft.dirty ? t('settings.bridge.secretStoredPlaceholder') : '';
}

function whatsappCredentials(b: any) {
  return {
    phoneNumberId: b.whatsappPhoneNumberId.trim(),
    webhookUrl: b.whatsappWebhookUrl.trim(),
    ...(b.whatsappAccessTokenDraft.dirty ? { accessToken: b.whatsappAccessToken.trim() } : {}),
    ...(b.whatsappVerifyTokenDraft.dirty ? { verifyToken: b.whatsappVerifyToken.trim() } : {}),
    ...(b.whatsappAppSecretDraft.dirty ? { appSecret: b.whatsappAppSecret.trim() } : {}),
  };
}

function hasUsableWhatsAppCredentials(b: any) {
  return !!b.whatsappPhoneNumberId.trim()
    && hasUsableSecret(b.whatsappAccessTokenDraft)
    && hasUsableSecret(b.whatsappVerifyTokenDraft)
    && hasUsableSecret(b.whatsappAppSecretDraft);
}

export function BridgeTab() {
  const b = useBridgeState();
  const snapshotBridge = useSettingsStore(s => s.settingsSnapshot.data?.preferences?.bridge);
  const tgInfo = b.status?.telegram;
  const permissionMode = (b.status?.permissionMode || snapshotBridge?.permissionMode) as BridgePermissionMode | undefined;
  const receiptEnabled = typeof b.status?.receiptEnabled === 'boolean'
    ? b.status.receiptEnabled
    : snapshotBridge?.receiptEnabled;
  const richStreamingEnabled = typeof b.status?.richStreamingEnabled === 'boolean'
    ? b.status.richStreamingEnabled
    : snapshotBridge
      ? snapshotBridge.richStreamingEnabled !== false
      : undefined;
  const globalSettingsPending = !permissionMode || b.globalSettingsSaving;
  const platformSections: Partial<Record<BridgePlatform, React.ReactNode>> = {
    telegram: (
      <PlatformSection
        platform="telegram"
        title={bridgePlatformLabel('telegram', t)}
        status={tgInfo}
        credentialFields={[{
          key: 'token',
          label: t('settings.bridge.telegramToken'),
          type: 'secret',
          value: b.tgToken,
          placeholder: storedSecretPlaceholder(b.tgTokenDraft),
          onChange: b.setTgToken,
        }]}
        onToggle={async (on) => {
          if (on && !hasUsableSecret(b.tgTokenDraft)) {
            b.showToast(t('settings.bridge.noToken'), 'error');
            return;
          }
          await b.saveBridgeConfig('telegram', b.tgTokenDraft.dirty ? { token: b.tgToken.trim() } : null, on);
        }}
        onTest={() => {
          if (!hasUsableSecret(b.tgTokenDraft)) {
            b.showToast(t('settings.bridge.noToken'), 'error');
            return;
          }
          b.testPlatform('telegram', credentialPayload({}, 'token', b.tgTokenDraft), shouldUseSavedSecret(b.tgTokenDraft));
        }}
        onCredentialBlur={async () => {
          if (b.tgTokenDraft.dirty) {
            await b.saveBridgeConfig('telegram', credentialPayload({}, 'token', b.tgTokenDraft), undefined);
          }
        }}
        testing={b.testingPlatform === 'telegram'}
        hint={t('settings.bridge.telegramHint')}
        ownerUsers={b.status?.knownUsers?.telegram || []}
        currentOwner={b.status?.owner?.telegram}
        onOwnerChange={(userId) => b.setOwner('telegram', userId)}
      />
    ),
    whatsapp: (
      <PlatformSection
        platform="whatsapp"
        title={bridgePlatformLabel('whatsapp', t)}
        status={b.status?.whatsapp}
        credentialFields={[
          {
            key: 'phoneNumberId',
            label: t('settings.bridge.whatsappPhoneNumberId'),
            type: 'text',
            value: b.whatsappPhoneNumberId,
            onChange: b.setWhatsAppPhoneNumberId,
          },
          {
            key: 'webhookUrl',
            label: t('settings.bridge.whatsappWebhookUrl'),
            type: 'text',
            value: b.whatsappWebhookUrl,
            onChange: b.setWhatsAppWebhookUrl,
          },
          {
            key: 'accessToken',
            label: t('settings.bridge.whatsappAccessToken'),
            type: 'secret',
            value: b.whatsappAccessToken,
            placeholder: storedSecretPlaceholder(b.whatsappAccessTokenDraft),
            onChange: b.setWhatsAppAccessToken,
          },
          {
            key: 'verifyToken',
            label: t('settings.bridge.whatsappVerifyToken'),
            type: 'secret',
            value: b.whatsappVerifyToken,
            placeholder: storedSecretPlaceholder(b.whatsappVerifyTokenDraft),
            onChange: b.setWhatsAppVerifyToken,
          },
          {
            key: 'appSecret',
            label: t('settings.bridge.whatsappAppSecret'),
            type: 'secret',
            value: b.whatsappAppSecret,
            placeholder: storedSecretPlaceholder(b.whatsappAppSecretDraft),
            onChange: b.setWhatsAppAppSecret,
          },
        ]}
        onToggle={async (on) => {
          if (on && !hasUsableWhatsAppCredentials(b)) {
            b.showToast(t('settings.bridge.noWhatsAppCredentials'), 'error');
            return;
          }
          await b.saveBridgeConfig('whatsapp', whatsappCredentials(b), on);
        }}
        onTest={() => {
          if (!hasUsableWhatsAppCredentials(b)) {
            b.showToast(t('settings.bridge.noWhatsAppCredentials'), 'error');
            return;
          }
          const useSavedCredentials = [
            b.whatsappAccessTokenDraft,
            b.whatsappVerifyTokenDraft,
            b.whatsappAppSecretDraft,
          ].some((draft: BridgeSecretDraft) => draft.hasStored);
          b.testPlatform('whatsapp', whatsappCredentials(b), useSavedCredentials);
        }}
        onCredentialBlur={() => b.saveBridgeConfig('whatsapp', whatsappCredentials(b), undefined)}
        testing={b.testingPlatform === 'whatsapp'}
        hint={t('settings.bridge.whatsappHint')}
        ownerUsers={b.status?.knownUsers?.whatsapp || []}
        currentOwner={b.status?.owner?.whatsapp}
        onOwnerChange={(userId) => b.setOwner('whatsapp', userId)}
      />
    ),
  };

  return (
    <div className={`${styles['settings-tab-content']} ${styles.active}`} data-tab="bridge">
      <SettingsSection title={t('settings.bridge.globalSettings')}>
        <SettingsRow
          label={t('settings.bridge.permissionMode')}
          hint={t('settings.bridge.permissionModeDesc')}
          control={<BridgePermissionModeSelect value={permissionMode} onChange={(mode) => b.saveGlobalSettings({ permissionMode: mode })} disabled={globalSettingsPending} />}
        />
        <SettingsRow
          label={t('settings.bridge.receiptEnabled')}
          hint={t('settings.bridge.receiptEnabledDesc')}
          control={<Toggle on={receiptEnabled} ariaLabel={t('settings.bridge.receiptEnabled')} onChange={(on) => b.saveGlobalSettings({ receiptEnabled: on })} disabled={b.globalSettingsSaving} />}
        />
        <SettingsRow
          label={t('settings.bridge.richStreamingEnabled')}
          hint={t('settings.bridge.richStreamingEnabledDesc')}
          control={<Toggle on={richStreamingEnabled} ariaLabel={t('settings.bridge.richStreamingEnabled')} onChange={(on) => b.saveGlobalSettings({ richStreamingEnabled: on })} disabled={b.globalSettingsSaving} />}
        />
      </SettingsSection>

      <SettingsSection title={t('settings.bridge.agentSettings')} surface="plain">
        <BridgeAgentRow value={b.selectedAgentId} onChange={b.setSelectedAgentId} />
      </SettingsSection>

      <SettingsSection title={t('settings.agent.publicIshiki')}>
        <div className={styles['settings-section-inset']}>
          <div className={styles['settings-section-hint']}>{t('settings.agent.publicIshikiHint')}</div>
          <textarea
            className={styles['settings-textarea']}
            rows={6}
            spellCheck={false}
            value={b.publicIshiki}
            onChange={(e) => b.setPublicIshiki(e.target.value)}
            onBlur={b.savePublicIshiki}
          />
        </div>
      </SettingsSection>

      <div className="bridge-help-link-row">
        <span className="bridge-help-link" onClick={() => window.dispatchEvent(new Event('miko-show-bridge-tutorial'))}>
          {t('settings.bridge.howTo')}
        </span>
      </div>

      {BRIDGE_SETTINGS_PLATFORMS.map((descriptor) => (
        <React.Fragment key={descriptor.id}>{platformSections[descriptor.id]}</React.Fragment>
      ))}
    </div>
  );
}
