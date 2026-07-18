# @miko/plugin-sdk

Browser-side SDK for Miko WebView/iframe plugins.

```ts
import { miko } from '@miko/plugin-sdk';

miko.ready();
const logoUrl = miko.assets.url('images/logo.svg');
miko.ui.resize({ height: 320 });

await miko.toast.show({ message: 'Saved', type: 'success' });
await miko.external.open('https://example.com');
await miko.clipboard.writeText('Copied text');
await miko.resources.open({ resource: { kind: 'session-file', fileId: 'sf_1' }, mode: 'preview' });
```

## Assets

Use `miko.assets.url(path)` for files bundled under the plugin's `assets/` directory:

```ts
const js = miko.assets.url('dist/app.js');
const logo = miko.assets.url('/images/logo.svg');
```

The helper returns `/api/plugins/{pluginId}/assets/{path}` for the current iframe plugin. It accepts only relative, non-dotfile paths. Miko serves these resources through a path-scoped, HttpOnly asset session cookie, so Vite chunks, lazy imports, CSS, fonts, images, JSON, wasm, and browser-playable video files such as MP4 should live under `assets/`. The host asset route supports byte ranges for video playback.

Do not put secrets, source files, or source maps in `assets/`. Agent-generated plugins and newly edited plugin UI should not create custom route handlers just to serve static files such as CSS, JS, images, or MP4. Existing plugins that already expose static-file compatibility handlers remain loadable; treat the official `assets/` route plus `miko.assets.url(...)` as the documented contract for new work.

## Plugin API Routes

Use `miko.api.fetch(path, init)` when browser code calls this plugin's own route handlers:

```ts
const res = await miko.api.fetch('api/translate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ domain: 'football' }),
});
```

The helper builds `/api/plugins/{pluginId}/{path}` for the current iframe plugin and sends the `X-Miko-Plugin-Surface-Session` header from the iframe URL. Do not reuse `pluginIframeTicket` for `fetch()` calls, and do not hard-code `/api/plugins/{pluginId}/...` in browser code. `miko.api.url(path)` is available when you only need the current plugin route URL.

## Host Requests

Stable helpers are thin wrappers around `miko.host.request(type, payload)`.

| Helper | Capability | Grant |
| --- | --- | --- |
| `miko.toast.show(input)` | `toast.show` | no |
| `miko.external.open(input)` | `external.open` | yes |
| `miko.clipboard.writeText(input)` | `clipboard.writeText` | yes |
| `miko.resources.open(input)` | `resource.open` | yes |
| `miko.resources.pick(input)` | `resource.pick` | yes |
| `miko.resources.requestAccess(input)` | `resource.requestAccess` | yes |

Grant-required capabilities must be declared in `manifest.json`:

```json
{
  "manifestVersion": 1,
  "ui": {
    "hostCapabilities": ["external.open", "clipboard.writeText", "resource.open"]
  }
}
```

Browser-side resource helpers are host requests only. They can ask Miko to open
or reveal local/session/url resources, show the host picker, or request access,
but they do not expose direct filesystem read or write APIs inside the iframe.
Runtime code that actually reads or edits user resources should use
`ctx.resources` from `@miko/plugin-runtime`.

Do not mirror runtime ResourceIO operations into iframe code. The browser SDK is
for presentation and host-mediated actions; server-side plugin tools, routes, or
lifecycle code own the actual resource read/write path.

## Theme

Use `miko.theme.getSnapshot()` for initial theme data and `miko.theme.subscribe(callback)` for host theme updates. The host also passes `miko-theme` and `miko-css` query parameters for compatibility with simple iframe pages.
