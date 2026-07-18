# @miko/plugin-components

React component primitives for Miko plugin WebViews/iframes.

```tsx
import {
  Button,
  CardShell,
  MikoThemeProvider,
  SettingRow,
  Switch,
} from '@miko/plugin-components';
import '@miko/plugin-components/styles.css';

export function PluginPanel() {
  return (
    <MikoThemeProvider mode="inherit">
      <CardShell title="Sync">
        <SettingRow
          label="Enabled"
          hint="Follows the current Miko theme."
          control={<Switch checked label="On" />}
        />
        <Button variant="primary">Run</Button>
      </CardShell>
    </MikoThemeProvider>
  );
}
```

`MikoThemeProvider` has three modes:

- `inherit`: use host CSS variables when the WebView/iframe receives them, then fall back to Miko defaults from `styles.css`.
- `miko`: set one of Miko's named theme token groups, such as `warm-paper` or `midnight`.
- `custom`: set only the tokens you provide. Missing tokens still fall back through host variables and SDK defaults.

Components intentionally expose stable `miko-plugin-*` classes so plugin authors can add small local refinements without depending on Miko renderer internals.
