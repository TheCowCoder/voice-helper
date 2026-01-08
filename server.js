
import express from 'express';
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();
const port = process.env.PORT || 7860;

// You need an OpenAI Key for the TTS.
// If you don't have one, get it from platform.openai.com
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

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

// --- TRANSCRIPTION (GEMINI) ---
const getGeminiClient = () => {
    if (!GEMINI_API_KEY) throw new Error("Gemini API Key not configured");
    return new GoogleGenAI({ apiKey: GEMINI_API_KEY });
}

const PROMPT_TEXT = `
Task:
Transcribe this recording of my grandpa. Do your best to interpret what he is most likely trying to say, as he has had stroke and has impaired speech.
Output rules:
- Respond ONLY with the estimated transcription.
- Do NOT include explanations.
`;

app.post('/api/transcribe', async (req, res) => {
  try {
    const ai = getGeminiClient();
    const { base64Audio, mimeType } = req.body || {};

    if (!base64Audio) return res.status(400).json({ error: "No audio data" });

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: {
        parts: [
          { inlineData: { mimeType: mimeType, data: base64Audio } },
          { text: PROMPT_TEXT },
        ],
      },
    });

    res.json({ text: response.text ? response.text.trim() : "" });
  } catch (error) {
    console.error("Transcribe Error:", error);
    res.status(500).json({ error: "Transcription failed" });
  }
});

// --- TTS (OPENAI) ---
// This guarantees a high-quality American Male voice (Voice: 'onyx')
// and returns an MP3, which plays perfectly on iPhone speakers.
app.post('/api/tts', async (req, res) => {
  try {
    if (!OPENAI_API_KEY) {
        throw new Error("OpenAI API Key missing");
    }

    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    const { text } = req.body || {};

    if (!text) return res.status(400).json({ error: "No text provided" });

    console.log(`Generating TTS for: "${text.substring(0, 20)}..."`);

    const mp3 = await openai.audio.speech.create({
      model: "tts-1",
      voice: "onyx", // Deep, high-quality American Male
      input: text,
      response_format: "mp3",
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());
    const base64Audio = buffer.toString('base64');

    res.json({ audioData: base64Audio });

  } catch (error) {
    console.error("TTS Error:", error);
    res.status(500).json({ error: error.message || "TTS Failed" });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});