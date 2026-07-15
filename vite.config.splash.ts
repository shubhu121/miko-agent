import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { injectCsp } from './vite.csp-profiles';

   
                                                    
  
                                           
                                                                          
                                                   
                                                     
                                              
          
  
                                                       
                                                    
                                                        
                                                        
   
function copySplashRuntimeAssets(): Plugin {
  return {
    name: 'miko-copy-splash-runtime-assets',
    async closeBundle() {
                                                                       
                                                   
                                                             
                                          
                                                              
                                 
      const { copySplashAssets } = await import('./scripts/splash-assets.mjs');
      const srcDir = path.resolve(__dirname, 'desktop/src');
      const outDir = path.resolve(__dirname, 'desktop/dist-splash');
      copySplashAssets({ srcDir, outDir });
    },
  };
}

export default defineConfig({
  root: 'desktop/src',
  base: './',
  plugins: [react(), injectCsp(), copySplashRuntimeAssets()],
  build: {
    outDir: '../dist-splash',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        splash: path.resolve(__dirname, 'desktop/src/splash.html'),
      },
    },
  },
});
