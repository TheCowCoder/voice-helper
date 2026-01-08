
import express from 'express';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();
const port = process.env.PORT || 7860;
const API_KEY = process.env.API_KEY || process.env.GEMINI_API_KEY;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'microphone=(self)');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

app.use(express.static(path.join(__dirname, 'dist')));
app.use(express.json({ limit: '50mb' }));

const getAiClient = () => {
    if (!API_KEY) throw new Error("API Key not configured");
    return new GoogleGenAI({ apiKey: API_KEY });
}

// --- TRANSCRIPTION ---
app.post('/api/transcribe', async (req, res) => {
  try {
    const ai = getAiClient();
    const { base64Audio, mimeType } = req.body || {};
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash', 
      contents: {
        parts: [
          { inlineData: { mimeType: mimeType, data: base64Audio } },
          { text: "Transcribe this recording of my grandpa. He has impaired speech from a stroke. Respond ONLY with the transcription text." },
        ],
      },
    });
    res.json({ text: response.text ? response.text.trim() : "" });
  } catch (error) {
    res.status(500).json({ error: "Transcription failed" });
  }
});

// --- FIXED GEMINI TTS ---
app.post('/api/tts', async (req, res) => {
  try {
    const ai = getAiClient();
    const { text } = req.body || {};

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-exp', 
      contents: {
        role: 'user',
        parts: [{ 
          // CRITICAL FIX: Explicitly instructing the model to NOT generate text output.
          // This prevents the "Model tried to generate text" error.
          text: `INSTRUCTION: Generate audio for the following text. Do not include any text in your response. Speak this text exactly: ${text}` 
        }],
      },
      config: {
        responseModalities: ['AUDIO'], 
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
    console.error("TTS API Error:", error?.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(port, () => console.log(`Server running on port ${port}`));