import { defineConfig, type Plugin, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { injectCsp } from './vite.csp-profiles';

interface DevWebClientConfig {
  serverPort: string;
  apiBaseUrl: string;
}

   
                   
                                                           
                                             
                                        
  
                                              
   
function preserveLegacyCss(): Plugin {
  const CSS_PLACEHOLDER_RE = /<!--MIKO_CSS:(.*?)-->/g;
  return {
    name: 'miko-preserve-legacy-css',
    enforce: 'pre',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
                                                              
                    
        return html.replace(
          /<link\s+rel="stylesheet"\s+href="([^"]+)"([^>]*)>/g,
          (_match, href, rest) => `<!--MIKO_CSS:${href}${rest}-->`
        );
      },
    },
  };
}

function restoreLegacyCss(): Plugin {
  return {
    name: 'miko-restore-legacy-css',
    enforce: 'post',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
                            
        return html.replace(
          /<!--MIKO_CSS:(.*?)-->/g,
          (_match, content) => {
                                                                               
            const parts = content.split(/\s+/);
            const href = parts[0];
            const rest = parts.slice(1).join(' ');
            return `<link rel="stylesheet" href="${href}"${rest ? ' ' + rest : ''}>`;
          }
        );
      },
    },
  };
}

   
                                                                                    
                                                             
   
function useSourceThemeInDev(): Plugin {
  return {
    name: 'miko-use-source-theme-in-dev',
    apply: 'serve',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return html.replace(
          /<script\s+src="lib\/theme\.js"><\/script>/g,
          '<script type="module" src="/shared/theme.ts"></script>',
        );
      },
    },
  };
}

function readDevWebClientConfig(): DevWebClientConfig | null {
  if (process.env.MIKO_DEV_WEB !== '1') return null;
  const apiBaseUrl = process.env.MIKO_DEV_WEB_API_BASE_URL?.trim();
  if (!apiBaseUrl) {
    throw new Error('MIKO_DEV_WEB requires MIKO_DEV_WEB_API_BASE_URL');
  }
  const parsed = new URL(apiBaseUrl);
  const serverPort = process.env.MIKO_DEV_WEB_CLIENT_PORT?.trim() || parsed.port;
  if (!serverPort) {
    throw new Error('MIKO_DEV_WEB requires MIKO_DEV_WEB_CLIENT_PORT or a port in MIKO_DEV_WEB_API_BASE_URL');
  }
  return { serverPort, apiBaseUrl };
}

/**
 * Browser-only dev entry for Codex Preview.
 * Electron keeps using preload; this injects only the Vite-facing browser
 * endpoint when scripts/dev-web.js starts Vite with MIKO_DEV_WEB=1. The
 * loopback owner token stays in the Vite proxy environment.
 */
function injectDevWebConfig(): Plugin {
  return {
    name: 'miko-inject-dev-web-config',
    apply: 'serve',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        if (path.basename(ctx.filename) !== 'index.html') return html;
        const config = readDevWebClientConfig();
        if (!config) return html;
        const payload = JSON.stringify(config).replace(/</g, '\\u003c');
        return html.replace(
          '</head>',
          `<script>window.__MIKO_DEV_WEB__=${payload};</script>\n</head>`,
        );
      },
    },
  };
}

/**
 * Vite dev only: synthesize an ESM `default` export for project-owned
 * CommonJS `.cjs` files when they get pulled into the browser graph.
 *
 * Several shared/*.cjs modules are the single Node-side source of truth (the
 * desktop shell raw-`require`s them from a plain CommonJS main.cjs, so they
 * cannot become .ts/.mjs), and thin shared/*.ts wrappers re-export them for the
 * renderer via `import x from './x.cjs'` (default import + destructure).
 * Production bundles synthesize the CJS→ESM default export through Rollup, but
 * Vite's dev server serves source .cjs individually WITHOUT synthesizing one,
 * so in dev the default import resolves to nothing and the entire static import
 * graph fails silently — no console error, and the module's top-level code
 * (including main.tsx) never executes. This closes that dev-only gap.
 *
 * Only PURE .cjs (no `require`, no Node builtins) can actually run in a browser.
 * If a .cjs that reaches the browser graph uses require(), we throw loudly
 * instead of shipping a broken module: such a file must move its constants to
 * JSON (see shared/contract-versions.json) or split its Node-only logic out —
 * silently degrading would just reproduce the invisible-failure this fixes.
 */
function browserCjsDefaultInterop(): Plugin {
  return {
    name: 'miko-browser-cjs-default-interop',
    apply: 'serve',
    enforce: 'pre',
    transform(code, id, options) {
      // Real dev-server browser context only. Vitest runs a Node-based module
      // runner (even under jsdom) that resolves CommonJS natively, so this
      // interop is both unnecessary and unsafe there — its require()-guard's
      // premise ("a browser cannot require()") does not hold for the vitest
      // runner and would spuriously throw on a legitimately CJS-importing test.
      if (process.env.VITEST) return null;
      if (options?.ssr) return null;
      const filePath = id.split('?')[0];
      if (!filePath.endsWith('.cjs')) return null;
      if (filePath.includes('/node_modules/')) return null;
      if (/\brequire\s*\(/.test(code)) {
        const rel = path.relative(__dirname, filePath);
        throw new Error(
          `[miko-browser-cjs-default-interop] ${rel} is imported into the browser graph but uses require(); ` +
          `browser-graph .cjs must be pure — move constants to JSON or split Node-only logic out.`,
        );
      }
      // Provide CJS `module`/`exports` bindings, run the original body, then
      // expose the result as the ESM default the .ts wrappers import.
      return {
        code: `const module = { exports: {} };\nconst exports = module.exports;\n${code}\nexport default module.exports;`,
        map: null,
      };
    },
  };
}

function serveMobilePwaStaticFiles(): Plugin {
  const srcDir = path.resolve(__dirname, 'desktop/src');
  const filesByUrl = new Map<string, { file: string; contentType: string }>([
    ['/sw.js', { file: path.join(srcDir, 'mobile-sw.js'), contentType: 'application/javascript; charset=utf-8' }],
    ['/manifest.webmanifest', { file: path.join(srcDir, 'mobile-manifest.webmanifest'), contentType: 'application/manifest+json; charset=utf-8' }],
    ['/icon.png', { file: path.join(srcDir, 'icon.png'), contentType: 'image/png' }],
  ]);

  return {
    name: 'miko-serve-mobile-pwa-static-files',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url || '';
                                                                 
                                                                                     
                                                                
                                                                    
                                                                 
                                            
        if (url.includes('?')) {
          next();
          return;
        }
        const asset = filesByUrl.get(url);
        if (!asset) {
          next();
          return;
        }
        fs.readFile(asset.file, (err, data) => {
          if (err) {
            next(err);
            return;
          }
          res.statusCode = 200;
          res.setHeader('Content-Type', asset.contentType);
          res.setHeader('Cache-Control', 'no-cache');
          res.end(data);
        });
      });
    },
  };
}

function createDevWebProxy(): Record<string, ProxyOptions> | undefined {
  if (process.env.MIKO_DEV_WEB !== '1') return undefined;
  const target = process.env.MIKO_DEV_WEB_SERVER_URL?.trim();
  const token = process.env.MIKO_DEV_WEB_SERVER_TOKEN?.trim();
  if (!target || !token) {
    throw new Error('MIKO_DEV_WEB proxy requires MIKO_DEV_WEB_SERVER_URL and MIKO_DEV_WEB_SERVER_TOKEN');
  }
  const auth = `Bearer ${token}`;
  const targetUrl = new URL(target);
  const wsTarget = `${targetUrl.protocol === 'https:' ? 'wss:' : 'ws:'}//${targetUrl.host}`;

  const withAuth = (proxyTarget: string, extra: ProxyOptions = {}): ProxyOptions => ({
    target: proxyTarget,
    changeOrigin: true,
    ...extra,
    headers: {
      ...(extra.headers || {}),
      Authorization: auth,
    },
    configure(proxy, options) {
      proxy.on('proxyReq', (proxyReq) => {
        proxyReq.setHeader('Authorization', auth);
      });
      proxy.on('proxyReqWs', (proxyReq) => {
        proxyReq.setHeader('Authorization', auth);
      });
      extra.configure?.(proxy, options);
    },
  });

  return {
    '/api': withAuth(target),
    '/preview': withAuth(target),
    '/ws': withAuth(wsTarget, { ws: true }),
  };
}

   
                                
                          
                                  
   
function copyLegacyFiles(): Plugin {
  return {
    name: 'miko-copy-legacy-files',
    closeBundle() {
      const srcDir = path.resolve(__dirname, 'desktop/src');
      const outDir = path.resolve(__dirname, 'desktop/dist-renderer');

      const dirs = ['lib', 'modules', 'themes', 'assets', 'locales'];
      const files = ['styles.css', 'animations.css', 'mobile-manifest.webmanifest', 'mobile-sw.js', 'icon.png'];

      for (const dir of dirs) {
        const src = path.join(srcDir, dir);
        const dest = path.join(outDir, dir);
        if (fs.existsSync(src)) {
          fs.cpSync(src, dest, { recursive: true });
        }
      }

      for (const file of files) {
        const src = path.join(srcDir, file);
        const destName = file === 'mobile-manifest.webmanifest'
          ? 'manifest.webmanifest'
          : file === 'mobile-sw.js'
          ? 'sw.js'
          : file;
        const dest = path.join(outDir, destName);
        if (fs.existsSync(src)) {
          fs.cpSync(src, dest);
        }
      }
    },
  };
}

export default defineConfig({
  root: 'desktop/src',
  base: './',
  plugins: [
    browserCjsDefaultInterop(),
    preserveLegacyCss(),
    react(),
    injectCsp(),
    injectDevWebConfig(),
    serveMobilePwaStaticFiles(),
    useSourceThemeInDev(),
    restoreLegacyCss(),
    copyLegacyFiles(),
  ],
  resolve: {
    alias: {
      '@miko/plugin-protocol': path.resolve(__dirname, 'packages/plugin-protocol/src/index.ts'),
      '@miko/plugin-sdk': path.resolve(__dirname, 'packages/plugin-sdk/src/index.ts'),
      '@miko/plugin-runtime': path.resolve(__dirname, 'packages/plugin-runtime/src/index.ts'),
      '@miko/plugin-components': path.resolve(__dirname, 'packages/plugin-components/src/index.ts'),
      '@': path.resolve(__dirname, 'desktop/src/react'),
    },
  },
  css: {
    modules: {
                                                                         
                                                                          
                                                        
      generateScopedName(name: string, filename: string): string {
        if (name.startsWith('miko-')) return name;
        const hash = crypto.createHash('md5').update(filename + '|' + name).digest('hex').slice(0, 5);
        return `_${name}_${hash}`;
      },
    },
  },
  build: {
    outDir: '../dist-renderer',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'desktop/src/index.html'),
        mobile: path.resolve(__dirname, 'desktop/src/mobile.html'),
        settings: path.resolve(__dirname, 'desktop/src/settings.html'),
        'quick-chat': path.resolve(__dirname, 'desktop/src/quick-chat.html'),
        onboarding: path.resolve(__dirname, 'desktop/src/onboarding.html'),
                                                    
                                                                         
                                                          
                                                           
                                        
        'browser-viewer': path.resolve(__dirname, 'desktop/src/browser-viewer.html'),
        'viewer-window': path.resolve(__dirname, 'desktop/src/viewer-window.html'),
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: createDevWebProxy(),
  },
  test: {
    root: path.resolve(__dirname),
  },
});
