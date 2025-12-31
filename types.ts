export enum AppState {
  IDLE = 'IDLE',
  RECORDING = 'RECORDING',
  TRANSCRIBING = 'TRANSCRIBING',
  REVIEW = 'REVIEW',
  PLAYING = 'PLAYING',
}

export interface TranscriptionResult {
  text: string;
  isError: boolean;
}