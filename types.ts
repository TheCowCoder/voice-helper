// ── App-level enums ──

export enum AppState {
  IDLE = 'IDLE',
  RECORDING = 'RECORDING',
  TRANSCRIBING = 'TRANSCRIBING',
  REVIEW = 'REVIEW',
  PLAYING = 'PLAYING',
}

export type AppMode = 'transcribe' | 'chat' | 'calibrate';

export type TranscriptionMode = 'fast' | 'deep';

export type AssistantMode = 'personal' | 'pt';

// ── Transcription types ──

export interface StructuredTranscription {
  phonetic_transcription: string;
  primary_transcription: string;
  confidence: number;
  language_detected: 'english' | 'gujarati' | 'mixed';
  alternative_interpretations: string[];
  detected_emotion: 'happy' | 'sad' | 'frustrated' | 'neutral' | 'urgent';
}

export interface TranscriptionResult {
  text: string;
  isError: boolean;
  structured?: StructuredTranscription;
  stage2Used?: boolean;
}

// ── Step bubbles ──

export type StepStatus = 'pending' | 'active' | 'done' | 'error';

export interface TranscriptionStep {
  id: string;
  label: string;
  status: StepStatus;
  detail?: string;
}

// ── Chat types ──

export interface MemoryAction {
  type: string;
  label: string;
  tool: string;
  args?: Record<string, unknown>;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'memory';
  text: string;
  timestamp: number;
  memoryAction?: MemoryAction;
}

export interface ChatResponse {
  reply_text: string;
  emotion_detected: string;
  transcription?: string;
  memoryActions?: MemoryAction[];
}

// ── Calibration types ──

export interface CalibrationPhrase {
  id: number;
  text: string;
  language: 'english' | 'gujarati';
  translation?: string;
}

export interface CalibrationPair {
  heard: string;
  correct: string;
  phraseId: number;
  audioBase64?: string;
  mimeType?: string;
}

// ── Auth / User types ──

export interface UserInfo {
  _id: string;
  name: string;
  role: 'user' | 'admin';
}

export interface WhoIAm {
  personality?: string;
  interests?: string;
  personalConnections?: string;
  memories?: string;
}

export interface UserProfile {
  userId: string;
  contextDocument: string;
  correctionCount: number;
  updatedAt: string;
  whoIAm?: WhoIAm | null;
}