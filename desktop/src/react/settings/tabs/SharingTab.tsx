import React, { useState } from 'react';
import { t } from '../helpers';
import styles from '../Settings.module.css';
import { SettingsSection } from '../components/SettingsSection';
import { SettingsRow } from '../components/SettingsRow';
import { NumberInput } from '../components/NumberInput';
import { SelectWidget } from '@/ui';
import { SettingsGrid } from '../components/SettingsPrimitives';
import {
  FOLLOW_READING_FONT_ID,
  READING_FONT_PRESETS,
  SCREENSHOT_FONT_STORAGE_KEY,
  normalizeFontSelectionId,
  readScreenshotFontSelectionId,
} from '../../utils/font-presets';
import {
  SCREENSHOT_SEGMENT_VISIBLE_CHAR_LIMIT,
  SCREENSHOT_SEGMENT_VISIBLE_CHAR_LIMIT_STORAGE_KEY,
  readScreenshotSegmentVisibleCharLimit,
} from '../../utils/screenshot-segments';


const SCREENSHOT_PREVIEW_COLORS = {
  light: { background: '#f8f5ed', paper: '#fffdf8', text: '#3b3d3f', accent: '#537d96' },
  dark: { background: '#2d4356', paper: '#385066', text: '#dce5eb', accent: '#a9c5d4' },
  sakura: { background: '#8abdce', paper: '#fff7fa', text: '#73545f', accent: '#df9aaa' },
} as const;

export function SharingTab() {
  const [screenshotColor, setScreenshotColor] = useState(
    () => localStorage.getItem('miko-screenshot-color') || 'light'
  );
  const [screenshotWidth, setScreenshotWidth] = useState(
    () => localStorage.getItem('miko-screenshot-width') || 'mobile'
  );
  const [screenshotFont, setScreenshotFont] = useState(() => readScreenshotFontSelectionId());
  const [segmentLimit, setSegmentLimit] = useState(() => readScreenshotSegmentVisibleCharLimit());
  const fontSelectOptions = [
    { value: FOLLOW_READING_FONT_ID, label: t('settings.fonts.followReading') },
    ...READING_FONT_PRESETS.map(preset => ({
      value: preset.id,
      label: t(preset.labelKey),
    })),
  ];

  const handleSegmentLimitChange = (value: number) => {
    const next = Math.max(1_000, Math.min(100_000, Math.round(value)));
    setSegmentLimit(next);
    if (next === SCREENSHOT_SEGMENT_VISIBLE_CHAR_LIMIT) {
      localStorage.removeItem(SCREENSHOT_SEGMENT_VISIBLE_CHAR_LIMIT_STORAGE_KEY);
    } else {
      localStorage.setItem(SCREENSHOT_SEGMENT_VISIBLE_CHAR_LIMIT_STORAGE_KEY, String(next));
    }
  };

  const handleScreenshotFontChange = (value: string) => {
    const next = normalizeFontSelectionId(value, {
      allowFollow: true,
      fallback: FOLLOW_READING_FONT_ID,
    });
    setScreenshotFont(next);
    if (next === FOLLOW_READING_FONT_ID) {
      localStorage.removeItem(SCREENSHOT_FONT_STORAGE_KEY);
    } else {
      localStorage.setItem(SCREENSHOT_FONT_STORAGE_KEY, next);
    }
  };

  return (
    <div className={`${styles['settings-tab-content']} ${styles['active']}`} data-tab="sharing">
      <SettingsSection title={t('settings.screenshot.color')} surface="plain">
        <SettingsGrid columns={3} className={styles['theme-options']}>
          {([
            { key: 'light' as const, bg: '#F8F5ED', color: '#3B3D3F', accent: '#537D96' },
            { key: 'dark' as const, bg: '#2D4356', color: '#C8D1D8', accent: '#A76F6F' },
            { key: 'sakura' as const, bg: '#8ABDCE', color: '#FFFFFF', accent: 'rgba(255,255,255,0.7)' },
          ]).map(({ key, bg, color, accent }) => (
            <button
              key={key}
              className={`${styles['theme-card']}${screenshotColor === key ? ' ' + styles['active'] : ''}`}
              style={{ background: bg }}
              onClick={() => { setScreenshotColor(key); localStorage.setItem('miko-screenshot-color', key); }}
            >
              <div className={styles['theme-card-name']} style={{ color }}>{t(`settings.screenshot.${key}`)}</div>
              <div className={styles['theme-card-mode']} style={{ color: accent }}>{t('settings.screenshot.title')}</div>
            </button>
          ))}
        </SettingsGrid>
      </SettingsSection>

      <SettingsSection title={t('settings.screenshot.width')} surface="plain">
        <SettingsGrid columns={2} gap="md" className={styles['ss-layout-group']}>
          {([
            { width: 'mobile' as const, title: t('settings.screenshot.mobileTitle'), desc: t('settings.screenshot.mobileDesc') },
            { width: 'desktop' as const, title: t('settings.screenshot.desktopTitle'), desc: t('settings.screenshot.desktopDesc') },
          ]).map(({ width, title, desc }) => {
            const preview = SCREENSHOT_PREVIEW_COLORS[screenshotColor as keyof typeof SCREENSHOT_PREVIEW_COLORS];
            return (
              <button
                key={width}
                className={`${styles['ss-layout-card']}${screenshotWidth === width ? ' ' + styles['active'] : ''}`}
                onClick={() => { setScreenshotWidth(width); localStorage.setItem('miko-screenshot-width', width); }}
              >
                <div className={styles['ss-layout-preview']} style={{ background: preview.background }}>
                  <div
                    className={styles['ss-layout-preview-paper']}
                    style={{
                      width: width === 'mobile' ? '56%' : '86%',
                      background: preview.paper,
                    }}
                  >
                    <span className={styles['ss-layout-preview-brand']} style={{ color: preview.accent }}>Miko</span>
                    <span className={styles['ss-layout-preview-line']} style={{ background: preview.text }} />
                    <span className={styles['ss-layout-preview-line']} style={{ background: preview.text }} />
                    <span className={styles['ss-layout-preview-line-short']} style={{ background: preview.text }} />
                  </div>
                </div>
                <div className={styles['ss-layout-info']}>
                  <div className={styles['ss-layout-title']}>{title}</div>
                  <div className={styles['ss-layout-desc']}>{desc}</div>
                </div>
              </button>
            );
          })}
        </SettingsGrid>
      </SettingsSection>

      <SettingsSection title={t('settings.screenshot.font')}>
        <SettingsRow
          label={t('settings.screenshot.fontLabel')}
          hint={t('settings.screenshot.fontHint')}
          control={
            <SelectWidget
              options={fontSelectOptions}
              value={screenshotFont}
              onChange={handleScreenshotFontChange}
            />
          }
        />
      </SettingsSection>

      <SettingsSection title={t('settings.screenshot.segmentTitle')}>
        <SettingsRow
          label={t('settings.screenshot.segmentLimitLabel')}
          hint={t('settings.screenshot.segmentLimitHint')}
          control={
            <NumberInput
              value={segmentLimit}
              onChange={handleSegmentLimitChange}
              min={1000}
              max={100000}
              step={1000}
              fieldWidth="wide"
              unit={t('settings.screenshot.segmentLimitUnit')}
            />
          }
        />
      </SettingsSection>
    </div>
  );
}
