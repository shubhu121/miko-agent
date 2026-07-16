

const TAGS = ["mood", "pulse", "reflect"];


function trailingPrefixLen(buffer, target) {
  const maxCheck = Math.min(buffer.length, target.length - 1);
  for (let len = maxCheck; len >= 1; len--) {
    if (buffer.endsWith(target.slice(0, len))) return len;
  }
  return 0;
}

export class MoodParser {
  declare _currentTag: any;
  declare _justEndedMood: any;
  declare buffer: any;
  declare inMood: any;
  constructor() {
    this.inMood = false;
    this.buffer = "";
    this._justEndedMood = false;
    this._currentTag = null; 
  }

  
  feed(delta, emit) {
    this.buffer += delta;
    this._drain(emit);
  }

  
  flush(emit) {
    if (this.buffer) {
      if (this.inMood) {
        emit({ type: "mood_text", data: this.buffer });
      } else {
        emit({ type: "text", data: this.buffer });
      }
      this.buffer = "";
    }
    if (this.inMood) {
      emit({ type: "mood_end" });
      this.inMood = false;
      this._currentTag = null;
    }
  }

  reset() {
    this.inMood = false;
    this.buffer = "";
    this._justEndedMood = false;
    this._currentTag = null;
  }

  _trailingPrefixLen(buffer, target) {
    return trailingPrefixLen(buffer, target);
  }

  
  _findOpenTag() {
    let best = null;
    for (const tag of TAGS) {
      const openTag = `<${tag}>`;
      const idx = this.buffer.indexOf(openTag);
      if (idx !== -1 && (best === null || idx < best.idx)) {
        best = { tag, idx, openTag };
      }
    }
    return best;
  }

  
  _maxTrailingPrefix() {
    let max = 0;
    for (const tag of TAGS) {
      const len = trailingPrefixLen(this.buffer, `<${tag}>`);
      if (len > max) max = len;
    }
    return max;
  }

  
  _drain(emit) {
    while (this.buffer.length > 0) {
      
      if (this._justEndedMood && !this.inMood) {
        this.buffer = this.buffer.replace(/^\n+/, "");
        this._justEndedMood = false;
        if (!this.buffer.length) break;
      }

      if (!this.inMood) {
        
        const found = this._findOpenTag();
        if (found) {
          const before = this.buffer.slice(0, found.idx);
          if (before) emit({ type: "text", data: before });
          emit({ type: "mood_start" });
          this.inMood = true;
          this._currentTag = found.tag;
          this.buffer = this.buffer.slice(found.idx + found.openTag.length);
          continue;
        }
        
        const holdLen = this._maxTrailingPrefix();
        if (holdLen > 0) {
          const safe = this.buffer.slice(0, -holdLen);
          if (safe) emit({ type: "text", data: safe });
          this.buffer = this.buffer.slice(-holdLen);
          break;
        }
        emit({ type: "text", data: this.buffer });
        this.buffer = "";
      } else {
        
        const closeTag = `</${this._currentTag}>`;
        const idx = this.buffer.indexOf(closeTag);
        if (idx !== -1) {
          const content = this.buffer.slice(0, idx);
          if (content) emit({ type: "mood_text", data: content });
          emit({ type: "mood_end" });
          this.inMood = false;
          this._justEndedMood = true;
          this.buffer = this.buffer.slice(idx + closeTag.length);
          this._currentTag = null;
          continue;
        }
        
        const moodHoldLen = trailingPrefixLen(this.buffer, closeTag);
        if (moodHoldLen > 0) {
          const safe = this.buffer.slice(0, -moodHoldLen);
          if (safe) emit({ type: "mood_text", data: safe });
          this.buffer = this.buffer.slice(-moodHoldLen);
          break;
        }
        emit({ type: "mood_text", data: this.buffer });
        this.buffer = "";
      }
    }
  }
}


const THINK_TAGS = ["think", "thinking"];

export class ThinkTagParser {
  declare _allowOpenTag: any;
  declare _currentTag: any;
  declare _justEnded: any;
  declare buffer: any;
  declare inThink: any;
  constructor() {
    this.inThink = false;
    this.buffer = "";
    this._justEnded = false;
    this._currentTag = null;
    this._allowOpenTag = true;
  }

  feed(delta, emit) {
    this.buffer += delta;
    this._drain(emit);
  }

  flush(emit) {
    if (this.buffer) {
      emit({ type: this.inThink ? "think_text" : "text", data: this.buffer });
      this.buffer = "";
    }
    if (this.inThink) {
      emit({ type: "think_end" });
      this.inThink = false;
      this._currentTag = null;
    }
  }

  reset() {
    this.inThink = false;
    this.buffer = "";
    this._justEnded = false;
    this._currentTag = null;
    this._allowOpenTag = true;
  }

  _findOpenTag() {
    if (!this._allowOpenTag) return null;
    let best = null;
    for (const tag of THINK_TAGS) {
      const openTag = `<${tag}>`;
      const idx = this.buffer.indexOf(openTag);
      if (idx !== -1 && this.buffer.slice(0, idx).trim().length > 0) continue;
      if (idx !== -1 && (best === null || idx < best.idx)) {
        best = { tag, idx, openTag };
      }
    }
    return best;
  }

  _maxTrailingPrefix() {
    if (!this._allowOpenTag) return 0;
    let max = 0;
    for (const tag of THINK_TAGS) {
      const len = trailingPrefixLen(this.buffer, `<${tag}>`);
      if (len > max) max = len;
    }
    return max;
  }

  _drain(emit) {
    while (this.buffer.length > 0) {
      
      if (this._justEnded && !this.inThink) {
        this.buffer = this.buffer.replace(/^\n+/, "");
        this._justEnded = false;
        if (!this.buffer.length) break;
      }

      if (!this.inThink) {
        const found = this._findOpenTag();
        if (found) {
          const before = this.buffer.slice(0, found.idx);
          if (before) emit({ type: "text", data: before });
          emit({ type: "think_start" });
          this.inThink = true;
          this._currentTag = found.tag;
          this.buffer = this.buffer.slice(found.idx + found.openTag.length);
          continue;
        }
        
        const holdLen = this._maxTrailingPrefix();
        if (holdLen > 0) {
          const safe = this.buffer.slice(0, -holdLen);
          if (safe.trim().length > 0) {
            emit({ type: "text", data: this.buffer });
            this._allowOpenTag = false;
            this.buffer = "";
            break;
          }
          if (safe) {
            emit({ type: "text", data: safe });
          }
          this.buffer = this.buffer.slice(-holdLen);
          break;
        }
        emit({ type: "text", data: this.buffer });
        if (this.buffer.trim().length > 0) this._allowOpenTag = false;
        this.buffer = "";
      } else {
        const closeTag = `</${this._currentTag}>`;
        const idx = this.buffer.indexOf(closeTag);
        if (idx !== -1) {
          const content = this.buffer.slice(0, idx);
          if (content) emit({ type: "think_text", data: content });
          emit({ type: "think_end" });
          this.inThink = false;
          this._justEnded = true;
          this._currentTag = null;
          this.buffer = this.buffer.slice(idx + closeTag.length);
          continue;
        }
        const holdLen = trailingPrefixLen(this.buffer, closeTag);
        if (holdLen > 0) {
          const safe = this.buffer.slice(0, -holdLen);
          if (safe) emit({ type: "think_text", data: safe });
          this.buffer = this.buffer.slice(-holdLen);
          break;
        }
        emit({ type: "think_text", data: this.buffer });
        this.buffer = "";
      }
    }
  }
}


const CARD_ATTR_RE = /(\w+)="([^"]*)"/g;

export class CardParser {
  declare _attrs: any;
  declare buffer: any;
  declare inCard: any;
  constructor() {
    this.inCard = false;
    this.buffer = "";
    this._attrs = null;
  }

  feed(delta, emit) {
    this.buffer += delta;
    this._drain(emit);
  }

  flush(emit) {
    if (this.buffer) {
      if (this.inCard) {
        emit({ type: "card_text", data: this.buffer });
      } else {
        emit({ type: "text", data: this.buffer });
      }
      this.buffer = "";
    }
    if (this.inCard) {
      emit({ type: "card_end" });
      this.inCard = false;
      this._attrs = null;
    }
  }

  reset() {
    this.inCard = false;
    this.buffer = "";
    this._attrs = null;
  }

  _parseAttrs(tag) {
    const attrs = {};
    let m;
    CARD_ATTR_RE.lastIndex = 0;
    while ((m = CARD_ATTR_RE.exec(tag)) !== null) {
      attrs[m[1]] = m[2];
    }
    return attrs;
  }

  _findCardOpen() {
    // Find <card followed by space or > (word boundary — excludes <cardiac etc.)
    let searchFrom = 0;
    while (searchFrom < this.buffer.length) {
      const idx = this.buffer.indexOf("<card", searchFrom);
      if (idx === -1) return -1;
      const after = this.buffer[idx + 5];
      if (after === undefined || after === " " || after === ">" || after === "\n" || after === "\t") return idx;
      searchFrom = idx + 1;
    }
    return -1;
  }

  _drain(emit) {
    while (this.buffer.length > 0) {
      if (!this.inCard) {
        // Look for complete opening tag <card ... > (with word boundary)
        const openIdx = this._findCardOpen();
        if (openIdx !== -1) {
          // Check if the full opening tag is present (find closing >)
          const closeAngle = this.buffer.indexOf(">", openIdx);
          if (closeAngle !== -1) {
            const before = this.buffer.slice(0, openIdx);
            if (before) emit({ type: "text", data: before });
            const openTag = this.buffer.slice(openIdx, closeAngle + 1);
            this._attrs = this._parseAttrs(openTag);
            emit({ type: "card_start", attrs: this._attrs });
            this.inCard = true;
            this.buffer = this.buffer.slice(closeAngle + 1);
            continue;
          }
          // Have <card but no > yet — hold from <card onward
          const before = this.buffer.slice(0, openIdx);
          if (before) emit({ type: "text", data: before });
          this.buffer = this.buffer.slice(openIdx);
          break;
        }
        // Check trailing prefix for partial <card
        const holdLen = trailingPrefixLen(this.buffer, "<card");
        if (holdLen > 0) {
          const safe = this.buffer.slice(0, -holdLen);
          if (safe) emit({ type: "text", data: safe });
          this.buffer = this.buffer.slice(-holdLen);
          break;
        }
        emit({ type: "text", data: this.buffer });
        this.buffer = "";
      } else {
        // Inside card — look for </card>
        const closeTag = "</card>";
        const idx = this.buffer.indexOf(closeTag);
        if (idx !== -1) {
          const content = this.buffer.slice(0, idx);
          if (content) emit({ type: "card_text", data: content });
          emit({ type: "card_end" });
          this.inCard = false;
          this._attrs = null;
          this.buffer = this.buffer.slice(idx + closeTag.length);
          continue;
        }
        const holdLen = trailingPrefixLen(this.buffer, closeTag);
        if (holdLen > 0) {
          const safe = this.buffer.slice(0, -holdLen);
          if (safe) emit({ type: "card_text", data: safe });
          this.buffer = this.buffer.slice(-holdLen);
          break;
        }
        emit({ type: "card_text", data: this.buffer });
        this.buffer = "";
      }
    }
  }
}
