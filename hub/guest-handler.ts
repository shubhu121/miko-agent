   
                             
  
                 
                 
                                      
   

import { getLocale } from "../lib/i18n.ts";

export class GuestHandler {
  declare _hub: any;

  /**
   * @param {object} opts
   * @param {import('./index.ts').Hub} opts.hub
   */
  constructor({ hub }) {
    this._hub = hub;
  }

     
                
                         
                               
                                                        
                                        
                                                                                                           
                                                     
     
  async handle(text, sessionKey, meta, opts: any = {}) {
    const isZh = getLocale().startsWith("zh");
    const senderName = meta?.name || (isZh ? "This feature is available in English only." : "Guest");
    const isGroup = opts.isGroup || false;

              
    const prefixed = isZh
      ? "This feature is available in English only."
      : `[From ${senderName}] ${text}`;

                                     
    const contextTag = isGroup
      ? (isZh ? "This feature is available in English only." : "This conversation is from a group chat.")
      : (isZh ? "This feature is available in English only." : "This conversation is from an external guest.");

    return this._hub.engine.executeExternalMessage(prefixed, sessionKey, meta, {
      guest: true,
      agentId: opts.agentId,
      contextTag,
      onDelta: opts.onDelta,
      images: opts.images,
      imageAttachmentPaths: opts.imageAttachmentPaths,
      videos: opts.videos,
      videoAttachmentPaths: opts.videoAttachmentPaths,
      audios: opts.audios,
      audioAttachmentPaths: opts.audioAttachmentPaths,
      inboundFiles: opts.inboundFiles,
      displayMessage: opts.displayMessage,
    });
  }
}
