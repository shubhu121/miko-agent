
import fs from "fs";
import path from "path";
import { createModuleLogger } from "../lib/debug-log.ts";
import { t } from "../lib/i18n.ts";
import {
  addBookmarkEntry,
  createChannel,
  getChannelMembers,
  removeChannelMember,
  removeBookmarkEntry,
  deleteChannel,
} from "../lib/channels/channel-store.ts";

const log = createModuleLogger("channel");

export class ChannelManager {
  declare _channelsDir: string;
  declare _agentsDir: string;
  declare _userDir: string;
  declare _getHub: () => any;

  
  constructor(deps: any) {
    this._channelsDir = deps.channelsDir;
    this._agentsDir = deps.agentsDir;
    this._userDir = deps.userDir;
    this._getHub = deps.getHub;
  }

  async createChannelEntry({ name, description, members, intro, addUserBookmark = true }: any = {}) {
    const normalizedMembers = Array.isArray(members) ? members : [];
    fs.mkdirSync(this._channelsDir, { recursive: true });
    for (const memberId of normalizedMembers) {
      if (!this._safeAgentDir(memberId)) {
        throw new Error(`Agent not found: ${memberId}`);
      }
    }

    const created = await createChannel(this._channelsDir, {
      name,
      description,
      members: normalizedMembers,
      intro,
    } as any);

    for (const memberId of normalizedMembers) {
      const memberDir = this._safeAgentDir(memberId);
      if (!memberDir) continue;
      await addBookmarkEntry(path.join(memberDir, "channels.md"), created.id);
    }

    if (addUserBookmark) {
      await addBookmarkEntry(path.join(this._userDir, "channel-bookmarks.md"), created.id);
    }

    this._emitChannelCreated({
      id: created.id,
      name,
      description,
      members: normalizedMembers,
    });
    return created;
  }

  
  async cleanupAgentFromChannels(agentId: any) {
    if (!this._channelsDir || !fs.existsSync(this._channelsDir)) return;

    const channelFiles = fs.readdirSync(this._channelsDir).filter(f => f.endsWith(".md"));
    const deletedChannels = [];

    for (const f of channelFiles) {
      const filePath = path.join(this._channelsDir, f);
      const channelId = f.replace(".md", "");
      const members = getChannelMembers(filePath);

      if (!members.includes(agentId)) continue;

      try {
        await removeChannelMember(filePath, agentId);
        this._abortChannelPhoneSessions(channelId, agentId, "channel-member-removed");
        const remaining = getChannelMembers(filePath);
        if (remaining.length <= 1) {
          await deleteChannel(filePath);
          this._abortChannelPhoneSessions(channelId, null, "channel-deleted");
          deletedChannels.push(channelId);
          log.log("This feature is available in English only.");
        }
      } catch (err: any) {
        log.error("This feature is available in English only.");
      }
    }

    if (deletedChannels.length > 0) {
      await this._cleanupBookmarks(deletedChannels, agentId);
    }
  }

  
  async deleteChannelByName(channelId: any) {
    const filePath = path.join(this._channelsDir, `${channelId}.md`);
    if (!fs.existsSync(filePath)) {
      throw new Error(t("error.channelNotFoundById", { id: channelId }));
    }

    await deleteChannel(filePath);
    this._abortChannelPhoneSessions(channelId, null, "channel-deleted");

    
    const agentDirs = fs.readdirSync(this._agentsDir, { withFileTypes: true })
      .filter(d => d.isDirectory());

    for (const d of agentDirs) {
      const channelsMd = path.join(this._agentsDir, d.name, "channels.md");
      await removeBookmarkEntry(channelsMd, channelId);
    }

    
    const userBookmarkPath = path.join(this._userDir, "channel-bookmarks.md");
    await removeBookmarkEntry(userBookmarkPath, channelId);

    log.log("This feature is available in English only.");
  }

  
  async triggerChannelDelivery(channelName: any, opts: any) {
    return this._getHub()?.triggerChannelDelivery(channelName, opts);
  }

  async triggerChannelTriage(channelName: any, opts: any) {
    return this.triggerChannelDelivery(channelName, opts);
  }

  _safeAgentDir(agentId: any) {
    if (!agentId || /[/\\]|\.\./.test(agentId)) return null;
    const dirPath = path.resolve(this._agentsDir, agentId);
    const base = path.resolve(this._agentsDir);
    if (!dirPath.startsWith(base + path.sep) && dirPath !== base) return null;
    return fs.existsSync(dirPath) ? dirPath : null;
  }

  _emitChannelCreated(channel: any) {
    const eventBus = this._getHub?.()?.eventBus;
    if (typeof eventBus?.emit !== "function") return;
    eventBus.emit({
      type: "channel_created",
      channelName: channel.id,
      channel,
    }, null);
  }

  _abortChannelPhoneSessions(channelId: any, agentId: any, reason: any) {
    const hub = this._getHub?.();
    if (typeof hub?.abortAgentPhoneSessions !== "function") return;
    hub.abortAgentPhoneSessions(reason, {
      ...(agentId ? { agentId } : {}),
      conversationId: channelId,
      conversationType: "channel",
    });
  }

  
  async setupChannelsForNewAgent(agentId: any) {
    const channelsMdPath = path.join(this._agentsDir, agentId, "channels.md");

    
    const memberChannels = [];
    try {
      const files = fs.readdirSync(this._channelsDir);
      for (const f of files) {
        if (!f.endsWith(".md")) continue;
        const channelId = f.replace(".md", "");
        const members = getChannelMembers(path.join(this._channelsDir, f));
        if (members.includes(agentId)) {
          memberChannels.push(channelId);
        }
      }
    } catch {
      // Missing channels directory is fine during first-run initialization.
    }

    for (const ch of memberChannels) {
      await addBookmarkEntry(channelsMdPath, ch);
    }
  }

  
  async repairChannelCursorProjection() {
    if (!this._channelsDir || !fs.existsSync(this._channelsDir)) return { added: 0 };

    let added = 0;
    const files = fs.readdirSync(this._channelsDir).filter(f => f.endsWith(".md"));
    for (const f of files) {
      const channelId = f.replace(/\.md$/, "");
      const channelFile = path.join(this._channelsDir, f);
      const members = getChannelMembers(channelFile);
      for (const agentId of members) {
        const agentDir = path.join(this._agentsDir, agentId);
        const configPath = path.join(agentDir, "config.yaml");
        if (!fs.existsSync(configPath)) continue;

        const channelsMdPath = path.join(agentDir, "channels.md");
        const before = fs.existsSync(channelsMdPath)
          ? fs.readFileSync(channelsMdPath, "utf-8")
          : "";
        await addBookmarkEntry(channelsMdPath, channelId);
        const after = fs.existsSync(channelsMdPath)
          ? fs.readFileSync(channelsMdPath, "utf-8")
          : "";
        if (before !== after) added++;
      }
    }
    if (added > 0) {
      log.log("This feature is available in English only.");
    }
    return { added };
  }

  
  async _cleanupBookmarks(deletedChannels: any, excludeAgentId: any) {
    const agentDirs = fs.readdirSync(this._agentsDir, { withFileTypes: true })
      .filter(d => d.isDirectory() && d.name !== excludeAgentId);

    for (const d of agentDirs) {
      const channelsMd = path.join(this._agentsDir, d.name, "channels.md");
      for (const ch of deletedChannels) {
        try {
          await removeBookmarkEntry(channelsMd, ch);
        } catch (err: any) {
          log.error("This feature is available in English only.");
        }
      }
    }

    const userBookmarkPath = path.join(this._userDir, "channel-bookmarks.md");
    for (const ch of deletedChannels) {
      try {
        await removeBookmarkEntry(userBookmarkPath, ch);
      } catch (err: any) {
        log.error("This feature is available in English only.");
      }
    }
  }
}
