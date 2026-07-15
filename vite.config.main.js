import fs from "fs";
import path from "path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { builtinModules } from "module";

// This file is a real ES module ("type": "module" in package.json) — no
// ambient __dirname, unlike vite.config.ts (CJS-transpiled by vite's own
// config loader). Derive it explicitly, same as vitest.config.js does.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nodeBuiltins = builtinModules.flatMap((m) => [m, `node:${m}`]);

                                                  
                                                                 
                                               
                                                    
                                             
                                          
                                                              
const signKeysetOverride = process.env.MIKO_SIGN_KEYSET;
const mainAliases = [];
if (signKeysetOverride) {
  const overridePath = path.resolve(signKeysetOverride);
  if (!fs.existsSync(overridePath)) {
    throw new Error(`[vite.config.main] MIKO_SIGN_KEYSET points at a missing file: ${overridePath}`);
  }
                                                           
                                           
                                       
  mainAliases.push({ find: /^.*pinned-keyset\.json$/, replacement: overridePath });
}

                                   
                                                    
                                                    
                                                   
                                                      
                                         
                                            
                                                                   
                                                
                                                             
              
mainAliases.push({
                                           
                                                              
                                                       
                                                             
  find: /^.*artifact-ota-dev-bypass\.cjs$/,
  replacement: path.resolve(__dirname, "desktop/src/shared/artifact-ota-dev-bypass.prod-stub.cjs"),
});

export default defineConfig({
  build: {
    lib: {
      entry: "desktop/main.cjs",
      formats: ["cjs"],
      fileName: () => "main.bundle.cjs",
    },
    // Output to the same directory as source — preserves __dirname semantics
    // (main.cjs uses __dirname extensively for preload, assets, locales, etc.)
    outDir: "desktop",
    emptyOutDir: false,
    rollupOptions: {
      external: [
        "electron",
        ...nodeBuiltins,

        // ws: CJS native addon (bufferutil/utf-8-validate) breaks when bundled.
        // Keep external — Electron runtime resolves from node_modules.
        "ws",

        // mammoth / exceljs: large CJS deps with deep dependency trees.
        // Kept external — electron-builder includes them from node_modules.
        "mammoth",
        "exceljs",
      ],
    },
    target: "node24",
    minify: "esbuild",
    sourcemap: false,
  },

  // Force Node.js resolution: include "node" condition and exclude "browser"
  // to prevent ws and similar packages from resolving to browser stubs.
  resolve: {
    conditions: ["node", "import", "module", "require", "default"],
    mainFields: ["main", "module"],
    alias: mainAliases,
  },
});
