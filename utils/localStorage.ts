const CORRECTIONS_KEY = 'voicehelper_pending_corrections';
const RECENT_KEY = 'voicehelper_recent_transcriptions';
const MAX_RECENT = 5;

export interface PendingCorrection {
  heard: string;
  correct: string;
  source: string;
  timestamp: number;
}

export const localStore = {
  // ── Pending corrections (for offline sync) ──

  getPendingCorrections(): PendingCorrection[] {
    try {
      return JSON.parse(localStorage.getItem(CORRECTIONS_KEY) || '[]');
    } catch {
      return [];
    }
  },

  addPendingCorrection(correction: PendingCorrection) {
    const list = this.getPendingCorrections();
    list.push(correction);
    localStorage.setItem(CORRECTIONS_KEY, JSON.stringify(list));
  },

  clearPendingCorrections() {
    localStorage.removeItem(CORRECTIONS_KEY);
  },

  // ── Recent transcriptions (rolling context) ──

  getRecentTranscriptions(): string[] {
    try {
      return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    } catch {
      return [];
    }
  },

  addRecentTranscription(text: string) {
    const list = this.getRecentTranscriptions();
    list.push(text);
    // Keep only the last N
    while (list.length > MAX_RECENT) list.shift();
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  },

  clearRecentTranscriptions() {
    localStorage.removeItem(RECENT_KEY);
  },
};
