import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { miko } from '@miko/plugin-sdk';
import {
  Button,
  CardShell,
  EmptyState,
  MikoThemeProvider,
  List,
  Select,
  SettingRow,
  Switch,
  TextInput,
} from '@miko/plugin-components';
import '@miko/plugin-components/styles.css';

type ThemeMode = 'inherit' | 'miko' | 'custom';

function Panel() {
  const surface = document.getElementById('root')?.dataset.surface || 'page';
  const [themeMode, setThemeMode] = useState<ThemeMode>('inherit');
  const [title, setTitle] = useState('SDK Showcase');
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    miko.ready();
    miko.ui.resize({ height: surface === 'widget' ? 300 : 460 });
  }, [surface]);

  const customTheme = useMemo(() => (
    themeMode === 'custom'
      ? { bg: '#F7F4EF', bgCard: '#FFFDF8', accent: '#537D96' }
      : undefined
  ), [themeMode]);

  async function copyTitle() {
    await miko.clipboard.writeText(title);
    await miko.toast.show({ message: 'Copied title', type: 'success' });
  }

  return (
    <MikoThemeProvider mode={themeMode} theme={customTheme || (themeMode === 'miko' ? 'warm-paper' : undefined)}>
      <CardShell
        title={title}
        description="A compact example using Miko plugin SDK packages."
        actions={<Button variant="ghost" onClick={() => miko.external.open('https://example.com')}>Open</Button>}
        footer={<Button variant="primary" onClick={copyTitle}>Copy title</Button>}
      >
        <SettingRow
          label="Enabled"
          hint="Switch state stays local to this iframe."
          control={<Switch checked={enabled} onChange={setEnabled} label={enabled ? 'On' : 'Off'} />}
        />
        <SettingRow
          label="Theme"
          control={
            <Select
              value={themeMode}
              onChange={(value) => setThemeMode(value as ThemeMode)}
              options={[
                { value: 'inherit', label: 'Follow Miko' },
                { value: 'miko', label: 'Warm paper' },
                { value: 'custom', label: 'Custom' },
              ]}
            />
          }
        />
        <TextInput label="Title" value={title} onChange={(event) => setTitle(event.currentTarget.value)} />
        <List
          items={[
            { id: 'runtime', title: '@miko/plugin-runtime', meta: 'Node' },
            { id: 'sdk', title: '@miko/plugin-sdk', meta: 'iframe' },
            { id: 'components', title: '@miko/plugin-components', meta: 'React' },
          ]}
        />
        {!enabled && <EmptyState title="Paused" description="Turn the switch back on to resume actions." />}
      </CardShell>
    </MikoThemeProvider>
  );
}

const root = document.getElementById('root');
if (root) createRoot(root).render(<Panel />);
