

import { TranscriptionResult, StructuredTranscription, ChatResponse } from "../types";

export class GeminiService {
  
  constructor() {}

  async transcribeAudio(
    base64Audio: string,
    mimeType: string,
    userId?: string,
    recentTranscriptions?: string[]
  ): Promise<TranscriptionResult> {
    try {
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64Audio, mimeType, userId, recentTranscriptions }),
      });

      if (!response.ok) throw new Error(`Server error: ${response.statusText}`);
      const data = await response.json();
      
      // data is now a structured JSON response from the two-stage pipeline
      const structured: StructuredTranscription = {
        phonetic_transcription: data.phonetic_transcription || '',
        primary_transcription: data.primary_transcription || '',
        confidence: data.confidence ?? 0,
        language_detected: data.language_detected || 'english',
        alternative_interpretations: data.alternative_interpretations || [],
        detected_emotion: data.detected_emotion || 'neutral',
      };

      return {
        text: structured.primary_transcription,
        isError: false,
        structured,
        stage2Used: data.stage2Used || false,
      };
    } catch (error) {
      console.error("Transcription error:", error);
      return {
        text: "Sorry, I couldn't understand that. Please try recording again.",
        isError: true,
      };
    }
  }

  async transcribeStage1(
    base64Audio: string,
    mimeType: string,
    userId?: string,
    recentTranscriptions?: string[]
  ): Promise<StructuredTranscription> {
    const response = await fetch('/api/transcribe/stage1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64Audio, mimeType, userId, recentTranscriptions }),
    });
    if (!response.ok) throw new Error(`Stage 1 error: ${response.statusText}`);
    return response.json();
  }

  async transcribeStage2(
    base64Audio: string,
    mimeType: string,
    stage1Result: StructuredTranscription,
    userId?: string,
    recentTranscriptions?: string[]
  ): Promise<TranscriptionResult> {
    const response = await fetch('/api/transcribe/stage2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64Audio, mimeType, stage1Result, userId, recentTranscriptions }),
    });
    if (!response.ok) throw new Error(`Stage 2 error: ${response.statusText}`);
    const data = await response.json();

    const structured: StructuredTranscription = {
      phonetic_transcription: data.phonetic_transcription || '',
      primary_transcription: data.primary_transcription || '',
      confidence: data.confidence ?? 0,
      language_detected: data.language_detected || 'english',
      alternative_interpretations: data.alternative_interpretations || [],
      detected_emotion: data.detected_emotion || 'neutral',
    };

    return {
      text: structured.primary_transcription,
      isError: false,
      structured,
      stage2Used: true,
    };
  }

  async chat(
    base64Audio: string,
    mimeType: string,
    userId?: string,
    chatHistory?: { role: string; text: string }[],
    sessionId?: string
  ): Promise<ChatResponse> {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64Audio, mimeType, userId, chatHistory, sessionId }),
    });

    if (!response.ok) throw new Error(`Server error: ${response.statusText}`);
    return response.json();
  }

  async chatWithText(
    transcriptionText: string,
    userId?: string,
    chatHistory?: { role: string; text: string }[],
    sessionId?: string
  ): Promise<ChatResponse> {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcriptionText, userId, chatHistory, sessionId }),
    });

    if (!response.ok) throw new Error(`Server error: ${response.statusText}`);
    return response.json();
  }

  async generateSpeech(text: string): Promise<string> {
    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) throw new Error(`Server error: ${response.statusText}`);

      const data = await response.json();
      
      if (!data.audioData) {
        throw new Error("No audio data received from server.");
      }
      return data.audioData;

    } catch (error) {
      console.error("TTS error:", error);
      throw error;
    }
  }

  async calibrate(data: {
    userId: string;
    heard: string;
    correct: string;
    phraseId?: number;
    audioBase64?: string;
    mimeType?: string;
    language?: string;
  }): Promise<{ success: boolean }> {
    const response = await fetch('/api/calibrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error(`Server error: ${response.statusText}`);
    return response.json();
  }

  async getTrainingProgress(userId: string): Promise<{ phrasesCompleted: number; completedPhraseIds: number[] }> {
    const response = await fetch(`/api/training-progress/${userId}`);
    if (!response.ok) throw new Error(`Server error: ${response.statusText}`);
    return response.json();
  }

  async submitCorrection(data: {
    userId: string;
    heard: string;
    correct: string;
    source?: string;
    language?: string;
  }): Promise<{ success: boolean }> {
    const response = await fetch('/api/corrections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error(`Server error: ${response.statusText}`);
    return response.json();
  }

  async saveAudioSample(data: {
    userId: string;
    base64Audio: string;
    mimeType?: string;
    transcript?: string;
    durationMs?: number;
  }): Promise<{ success: boolean }> {
    const response = await fetch('/api/audio-sample', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error(`Server error: ${response.statusText}`);
    return response.json();
  }
}

export const geminiService = new GeminiService();