
import { TranscriptionResult } from "../types";

export class GeminiService {
  
  constructor() {}

  async transcribeAudio(base64Audio: string, mimeType: string): Promise<TranscriptionResult> {
    try {
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ base64Audio, mimeType }),
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.text) {
        throw new Error("No transcription received from server.");
      }

      return { text: data.text, isError: false };
    } catch (error) {
      console.error("Transcription error:", error);
      return {
        text: "Sorry, I couldn't understand that. Please try recording again.",
        isError: true,
      };
    }
  }

  // TTS method removed - we now use browser native speech
}

export const geminiService = new GeminiService();