import process from "node:process";
import { defineConfig } from "vite";
import { builtinModules } from "module";

const nodeBuiltins = builtinModules.flatMap((m) => [m, `node:${m}`]);

// MIKO_SERVER_BUNDLE_ENTRY lets a caller (scripts/build-server-phases.mjs's
// buildViteServerBundle) override which composition entry gets bundled,
// without this config file knowing anything about "open" vs "full" —
// scripts/build-server.mjs (full) never sets it, so the default below is
// unchanged; scripts/build-server-open.mjs sets it to server/main-open.ts.
const bundleEntry = process.env.MIKO_SERVER_BUNDLE_ENTRY || "server/main-full.ts";

export default defineConfig({
  build: {
    lib: {
      // main-full.ts is the thin closed composition entry: it statically
      // imports server/index.ts's open startServer() plus
      // composition/full-root.ts's registerClosedRoutes hook, so the
      // packaged bundle still ships the full product (open + closed-product
      // routes). MIKO_SERVER_BUNDLE_ENTRY overrides this for other
      // compositions (see the comment above).
      entry: bundleEntry,
      formats: ["es"],
      fileName: () => "index.js",
    },
    outDir: "dist-server-bundle",
    rollupOptions: {
      external: [
        ...nodeBuiltins,
        "@node-rs/jieba",
        "better-sqlite3",
        "node-pty",

        // ws: CJS package, Rollup's CJS→ESM interop loses WebSocketServer
        // named export. Keep external — available as PI SDK transitive dep.
        "ws",
        /^@mariozechner\//,
        /^@earendil-works\//,
        "@silvia-odwyer/photon-node",
        "@larksuiteoapi/node-sdk",
        "node-telegram-bot-api",
        "proxy-agent",
        "undici",
        "exceljs",
        "mammoth",
        // jsdom: CJS package that reads package-local resources via __dirname
        // during initialization. Bundling it into the ESM server bundle breaks
        // packaged runtime startup because __dirname is not defined there.
        "jsdom",
        "fsevents",

                                                                       
                                                 
        "qrcode",
      ],
      output: {
                           
                                             
                                                   
        inlineDynamicImports: true,
      },
    },
    target: "node24",
                                                      
                                                         
    minify: "esbuild",
    sourcemap: false,
  },
  logLevel: "info",
});
