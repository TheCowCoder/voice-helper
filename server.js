
import express from 'express';
import { GoogleGenAI, Modality } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();
const port = process.env.PORT || 7860;
const API_KEY = process.env.API_KEY;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware to set security headers that encourage permission persistence
app.use((req, res, next) => {
  // Tells the browser that this origin is explicitly allowed to use the microphone.
  // This is critical for avoiding repeated permission prompts on some browsers/embedded views.
  res.setHeader('Permissions-Policy', 'microphone=(self)');
  
  // Standard security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

// Serve static files from the 'dist' directory
app.use(express.static(path.join(__dirname, 'dist')));
app.use(express.json({ limit: '50mb' }));

if (!API_KEY) {
  console.warn("Warning: API_KEY is missing from environment variables.");
}

const getAiClient = () => {
    if (!API_KEY) throw new Error("API Key not configured");
    return new GoogleGenAI({ apiKey: API_KEY });
}

const PROMPT_TEXT = `
Task:
Transcribe this recording of my grandpa. Do your best to interpret what he is most likely trying to say, as he has had stroke and has impaired speech.

Output rules:
- Respond ONLY with the estimated transcription.
- Do NOT include explanations, commentary, reasoning, or extra text.
- The response must be transcription text only.
`;

// API Endpoint: Transcribe Audio
app.post('/api/transcribe', async (req, res) => {
  try {
    if (!API_KEY) {
      console.error("Transcription API Error: API_KEY not configured");
      return res.status(500).json({ error: "API_KEY not configured" });
    }

    const ai = getAiClient();
    const { base64Audio, mimeType } = req.body || {};

    if (!base64Audio) {
      return res.status(400).json({ error: "base64Audio is required" });
    }

    console.log(`/api/transcribe received - mimeType=${mimeType || 'unknown'}, audioSize=${base64Audio.length}`);

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash', // Switched to Flash for faster/stable response, or keep 'gemini-1.5-flash'
      contents: {
        parts: [
          { inlineData: { mimeType: mimeType, data: base64Audio } },
          { text: PROMPT_TEXT },
        ],
      },
      config: {
        temperature: 0.4, // Lower temperature slightly for more accurate transcription
      },
    });

    const text = response.text;
    res.json({ text: text ? text.trim() : "" });
  } catch (error) {
    console.error("Transcription API Error:", error?.message || error);
    res.status(500).json({ error: error?.message || "Failed to transcribe audio" });
  }
});

// API Endpoint: Generate Speech (TTS)
app.post('/api/tts', async (req, res) => {
  try {
    if (!API_KEY) {
      return res.status(500).json({ error: "API_KEY not configured" });
    }

    const ai = getAiClient();
    const { text } = req.body || {};

    if (!text) {
      return res.status(400).json({ error: "text is required" });
    }

    console.log(`/api/tts received - textLen=${text.length}`);

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-exp', // Ensure using a model that supports speech generation
      contents: {
        parts: [{ text: text }],
      },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Fenrir' },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("No audio generated");

    res.json({ audioData: base64Audio });
  } catch (error) {
    console.error("TTS API Error:", error?.message || error);
    res.status(500).json({ error: error?.message || "Failed to generate speech" });
  }
});

// Fallback for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});