
import express from 'express';
import { GoogleGenAI, Modality } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();
const port = process.env.PORT || 7860; // HF Spaces uses port 7860 by default
const API_KEY = process.env.API_KEY;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve static files from the 'dist' directory (where Vite builds to)
app.use(express.static(path.join(__dirname, 'dist')));
app.use(express.json({ limit: '50mb' }));

if (!API_KEY) {
  console.warn("Warning: API_KEY is missing from environment variables.");
}

// Initialize Gemini Client
// Note: We initialize this lazily inside requests or check availability to prevent crashes if key is missing on startup
const getAiClient = () => {
    if (!API_KEY) throw new Error("API Key not configured");
    return new GoogleGenAI({ apiKey: API_KEY });
}

// const PROMPT_TEXT = `
// Transcribe this recording of my grandpa. Do your best to interpret what he is most likely trying to say as he has had stroke and has impaired speech.
// IMPORTANT: Even though you are set to "thinking mode", DO NOT THINK FOR THIS RESPONSE! Simply come up with a transcription and output it in 1 step. Respond ONLY with the estimated transcription, with no additional commentary or thinking/reasoning.
// `;

// const PROMPT_TEXT = `
// Transcribe this recording of my grandpa. Do your best to interpret what he is most likely trying to say as he has had stroke and has impaired speech.
// IMPORTANT: Respond ONLY with the estimated transcription, with no additional commentary or thinking/reasoning.
// `;

const PROMPT_TEXT = `
Task:
Transcribe this recording of my grandpa named Satish Bhatt. Do your best to interpret what he is most likely trying to say, as he has had stroke and has impaired speech.

Output rules:
- Respond ONLY with the estimated transcription.
- Do NOT include explanations, commentary, reasoning, or extra text.
- The response must be transcription text only.
`;


// API Endpoint: Transcribe Audio
app.post('/api/transcribe', async (req, res) => {
  try {
    // Validate API key and input early to return clear errors for debugging
    if (!API_KEY) {
      console.error("Transcription API Error: API_KEY not configured");
      return res.status(500).json({ error: "API_KEY not configured" });
    }

    const ai = getAiClient();
    const { base64Audio, mimeType } = req.body || {};

    if (!base64Audio) {
      console.error("Transcription API Error: missing base64Audio in request body");
      return res.status(400).json({ error: "base64Audio is required" });
    }

    console.log(`/api/transcribe received - mimeType=${mimeType || 'unknown'}, audioSize=${base64Audio.length}`);

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: {
        parts: [
          { inlineData: { mimeType: mimeType, data: base64Audio } },
          { text: PROMPT_TEXT },
        ],
      },
      config: {
        temperature: 1,
        // thinkingConfig: { thinkingBudget: 1024 },
        // thinkingConfig: { thinkingBudget: 768 },
        thinkingConfig: { thinkingBudget: 1 },
        tools: [],
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
    // Validate API key and input early
    if (!API_KEY) {
      console.error("TTS API Error: API_KEY not configured");
      return res.status(500).json({ error: "API_KEY not configured" });
    }

    const ai = getAiClient();
    const { text } = req.body || {};

    if (!text) {
      console.error("TTS API Error: missing text in request body");
      return res.status(400).json({ error: "text is required" });
    }

    console.log(`/api/tts received - textLen=${text.length}`);

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-preview-tts',
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

// Fallback: Send index.html for any other request (SPA support)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
