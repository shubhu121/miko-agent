import { defineConfig } from "vite";

   
                         
  
                                                                
                                                 
                                        
  
                                              
                                      
  
                                                      
                                                             
  
                                                           
                                           
   
export default defineConfig({
  build: {
    lib: {
      entry: "desktop/preload.cjs",
      formats: ["cjs"],
      fileName: () => "preload.bundle.cjs",
    },
    // Output into desktop/ alongside main.bundle.cjs — keeps __dirname semantics
    // and aligns with electron-builder files[] config.
    outDir: "desktop",
    emptyOutDir: false,
    rollupOptions: {
      // Only electron is external — sandboxed preload can't require anything else.
      // All user files (e.g. src/shared/path-to-file-url.cjs) MUST be inlined.
      external: ["electron"],
    },
    target: "node24",
    minify: "esbuild",
    sourcemap: false,
  },

  resolve: {
    conditions: ["node", "import", "module", "require", "default"],
    mainFields: ["main", "module"],
  },
});
