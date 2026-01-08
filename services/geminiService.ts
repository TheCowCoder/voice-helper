
import { TranscriptionResult } from "../types";

export class GeminiService {
  
  constructor() {}

  async transcribeAudio(base64Audio: string, mimeType: string): Promise<TranscriptionResult> {
    try {
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64Audio, mimeType }),
      });

      if (!response.ok) throw new Error(`Server error: ${response.statusText}`);
      const data = await response.json();
      return { text: data.text || "", isError: false };
    } catch (error) {
      console.error("Transcription error:", error);
      return {
        text: "Sorry, I couldn't understand that. Please try recording again.",
        isError: true,
      };
    }
  }

  // Calls our new OpenAI endpoint
  async generateSpeech(text: string): Promise<string> {
    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) throw new Error(`Server error: ${response.statusText}`);

      const data = await response.json();
      if (!data.audioData) throw new Error("No audio received");
      
      return data.audioData;
    } catch (error) {
      console.error("TTS error:", error);
      throw error;
    }
  }
}

export const geminiService = new GeminiService();