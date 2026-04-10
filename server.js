
import express from 'express';
import { GoogleGenAI, Modality } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { MongoClient, ObjectId } from 'mongodb';
import bcrypt from 'bcryptjs';

dotenv.config();

const app = express();
const port = process.env.PORT || 7860;
const API_KEY = process.env.API_KEY;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = 'voicehelper';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, 'dist')));
app.use(express.json({ limit: '50mb' }));

if (!API_KEY) {
  console.warn("Warning: API_KEY is missing from environment variables.");
}

// ── MongoDB Connection ──

let db = null;
let mongoClient = null;

async function connectMongo() {
  try {
    mongoClient = new MongoClient(MONGODB_URI);
    await mongoClient.connect();
    db = mongoClient.db(DB_NAME);
    // Create indexes
    await db.collection('users').createIndex({ name: 1 }, { unique: true });
    await db.collection('profiles').createIndex({ userId: 1 }, { unique: true });
    await db.collection('corrections').createIndex({ userId: 1 });
    await db.collection('chatHistory').createIndex({ userId: 1, sessionId: 1 });
    await db.collection('audioSamples').createIndex({ userId: 1 });
    console.log('Connected to MongoDB');
  } catch (err) {
    console.warn('MongoDB connection failed — running without persistence:', err.message);
  }
}

connectMongo();

// ── Gemini Client ──

const getAiClient = () => {
  if (!API_KEY) throw new Error("API Key not configured");
  return new GoogleGenAI({ apiKey: API_KEY });
};

// ── System Instructions ──

const TRANSCRIPTION_SYSTEM_INSTRUCTION = `<role>
You are an expert speech-language pathologist AI specializing in interpreting
dysarthric and aphasic speech from post-stroke patients. You are deeply familiar
with how stroke affects speech production — slurred consonants, dropped syllables,
inconsistent volume, atypical pauses, and word-finding difficulties.
The speaker's first language is Gujarati. They may speak in English, Gujarati,
or mix both languages in a single utterance (code-switching).
</role>

<vocabulary>
Family: Satish Bhatt (self), Rupal Bhatt (daughter), Sonal Bhatt (daughter),
Ian Bhatt (grandson), Ellora Bhatt (granddaughter), Dan Tamasauskas (stepson),
David Dana (stepson), Forest Dana (grandson), Leela Dana (granddaughter)
Common topics: healthcare, medications, doctor appointments, finances, tennis,
speech therapy, physical therapy, exercises, daily routines
</vocabulary>

<confidence_calibration>
CRITICAL: You MUST calibrate confidence honestly for dysarthric speech.
- Dysarthric speakers often produce sounds that seem clear but are actually
  distorted versions of completely different words.
- A word that "sounds like" something in the audio may NOT be what was intended.
- If ANY word in your transcription feels like it could be a different word,
  your confidence should be BELOW 0.6.
- Only report confidence above 0.7 if you are CERTAIN of every single word AND
  the phrase makes perfect semantic sense in context.
- For short utterances (< 5 words), be extra cautious — confidence should rarely exceed 0.7.
- If a word you transcribed is not a real common English/Gujarati word (e.g. nonsense
  syllables like "gtape", "foost", "breen"), your confidence MUST be below 0.4.
</confidence_calibration>

<instructions>
1. Listen to the audio and determine the intended meaning, NOT a verbatim transcript.
2. Consider both English and Gujarati interpretations.
3. The speaker has dysarthria — slurred sounds are normal, not errors in hearing.
4. Use conversation context and vocabulary hints to resolve ambiguity.
5. For short phrases (2-5 words), rely heavily on context and common phrases.
6. ALWAYS generate at least 3 alternative interpretations, even if you feel confident.
7. Think about what REAL phrase the speaker likely intended, not just what the audio sounds like.
</instructions>`;

const TRANSCRIPTION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    phonetic_transcription: {
      type: 'STRING',
      description: 'What the audio literally sounds like phonetically'
    },
    primary_transcription: {
      type: 'STRING',
      description: 'Best interpretation of the intended meaning'
    },
    confidence: {
      type: 'NUMBER',
      description: 'Confidence in the interpretation, 0.0 to 1.0'
    },
    language_detected: {
      type: 'STRING',
      enum: ['english', 'gujarati', 'mixed'],
      description: 'Primary language detected in the audio'
    },
    alternative_interpretations: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      description: 'Other possible intended meanings, ranked by likelihood'
    },
    detected_emotion: {
      type: 'STRING',
      enum: ['happy', 'sad', 'frustrated', 'neutral', 'urgent'],
      description: 'Emotional state detected from speech prosody'
    }
  },
  required: ['phonetic_transcription', 'primary_transcription', 'confidence',
             'language_detected', 'alternative_interpretations', 'detected_emotion']
};

const CHAT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    reply_text: { type: 'STRING', description: 'The AI reply to speak aloud' },
    emotion_detected: { type: 'STRING', description: 'Emotion detected from user speech' }
  },
  required: ['reply_text', 'emotion_detected']
};

// ── Who-I-Am Memory Tool Declarations ──

const WHO_I_AM_TOOLS = [
  {
    name: 'read_personality',
    description: 'Read the personality section of the who-i-am document to recall personality traits and self-description.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'write_personality',
    description: 'REPLACE the entire personality section with updated content. Read first, then write back the COMPLETE updated section including existing facts plus any new information. Do not just write the new fact — include everything.',
    parameters: {
      type: 'object',
      properties: { content: { type: 'string', description: 'The complete updated personality section text' } },
      required: ['content'],
    },
  },
  {
    name: 'read_interests',
    description: 'Read the interests section of the who-i-am document to recall hobbies, likes, and dislikes.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'write_interests',
    description: 'REPLACE the entire interests section with updated content. Read first, then write back the COMPLETE updated section including existing facts plus any new information.',
    parameters: {
      type: 'object',
      properties: { content: { type: 'string', description: 'The complete updated interests section text' } },
      required: ['content'],
    },
  },
  {
    name: 'read_personal_connections',
    description: 'Read the personal connections section — family, friends, relationships, people mentioned.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'write_personal_connections',
    description: 'REPLACE the entire personal connections section with updated content. Read first, then write back the COMPLETE updated section including existing people plus any new connections.',
    parameters: {
      type: 'object',
      properties: { content: { type: 'string', description: 'The complete updated personal connections section text' } },
      required: ['content'],
    },
  },
  {
    name: 'read_memories',
    description: 'Read the memories section — past events, stories, conversations worth remembering.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'write_memories',
    description: 'REPLACE the entire memories section with updated content. Read first, then write back the COMPLETE updated section including existing memories plus any new ones. Remove outdated entries.',
    parameters: {
      type: 'object',
      properties: { content: { type: 'string', description: 'The complete updated memories section text' } },
      required: ['content'],
    },
  },
];

// ── Execute a who-i-am tool call against MongoDB ──

async function executeWhoIAmTool(toolName, args, userId) {
  if (!db || !userId) return { error: 'Database or user not available' };

  const oid = new ObjectId(userId);
  const profile = await db.collection('profiles').findOne({ userId: oid });
  const whoIAm = profile?.whoIAm || { personality: '', interests: '', personalConnections: '', memories: '' };

  const sectionMap = {
    read_personality: 'personality',
    write_personality: 'personality',
    read_interests: 'interests',
    write_interests: 'interests',
    read_personal_connections: 'personalConnections',
    write_personal_connections: 'personalConnections',
    read_memories: 'memories',
    write_memories: 'memories',
  };

  const section = sectionMap[toolName];
  if (!section) return { error: `Unknown tool: ${toolName}` };

  if (toolName.startsWith('read_')) {
    const content = whoIAm[section] || '(empty)';
    return { content };
  }

  // Write: replace entire section with new content
  const newContent = args.content || '';
  const updated = newContent;

  await db.collection('profiles').updateOne(
    { userId: oid },
    { $set: { [`whoIAm.${section}`]: updated, updatedAt: new Date() } },
    { upsert: true }
  );

  return { success: true, section, updated };
}

// ── Helper: build few-shot examples from corrections ──

async function getCorrectionExamples(userId, limit = 10) {
  if (!db) return '';
  const corrections = await db.collection('corrections')
    .find({ userId: new ObjectId(userId) })
    .sort({ timestamp: -1 })
    .limit(limit)
    .toArray();
  if (corrections.length === 0) return '';
  const examples = corrections
    .filter(c => c.heard !== c.correct)
    .map(c =>
      `<example>\n  <heard>${c.heard}</heard>\n  <correct>${c.correct}</correct>\n</example>`
    ).join('\n');
  if (!examples) return '';
  return `\n<few_shot_corrections>\nThese are known corrections for this speaker. Use them to improve interpretation.\n${examples}\n</few_shot_corrections>`;
}

// ── Helper: fetch audio samples for few-shot ──

async function getAudioSamples(userId) {
  if (!db) return [];
  const samples = await db.collection('audioSamples')
    .find({ userId: new ObjectId(userId) })
    .sort({ createdAt: 1 })
    .toArray();
  return samples;
}

// ── Helper: build rolling context from recent transcriptions ──

function buildRollingContext(recentTranscriptions) {
  if (!recentTranscriptions || recentTranscriptions.length === 0) return '';
  const items = recentTranscriptions.map(t => `- "${t}"`).join('\n');
  return `\n<recent_context>\nRecent confirmed transcriptions from this speaker (use for continuity):\n${items}\n</recent_context>`;
}

// ── Helper: fetch recent chat topics for transcription context ──

async function getRecentChatContext(userId) {
  if (!db || !userId) return '';
  const sessions = await db.collection('chatHistory')
    .find({ userId: new ObjectId(userId) })
    .sort({ 'messages.timestamp': -1 })
    .limit(3)
    .toArray();
  if (sessions.length === 0) return '';
  const recentMessages = sessions
    .flatMap(s => s.messages || [])
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    .slice(0, 20);
  if (recentMessages.length === 0) return '';
  const items = recentMessages.map(m => `- [${m.role}] ${m.text}`).join('\n');
  return `\n<recent_chat_context>\nRecent AI chat conversations with this speaker. Use these topics as contextual clues for what they might be saying now:\n${items}\n</recent_chat_context>`;
}

// ── Helper: Retry with exponential backoff ──

async function withRetry(fn, { maxRetries = Infinity, baseDelay = 1000, maxDelay = 30000, retryOn = [503, 429] } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const status = err?.status || err?.error?.code || err?.httpCode;
      const isRetryable = retryOn.some(code => String(err?.message || '').includes(String(code))) ||
                          retryOn.includes(status);
      if (!isRetryable) throw err;
      const delay = Math.min(baseDelay * Math.pow(2, attempt) + Math.random() * 500, maxDelay);
      console.log(`Retrying in ${Math.round(delay)}ms (attempt ${attempt + 1})...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

// ── Helper: build few-shot audio reference parts with transcription logs ──

function buildFewShotParts(audioSamples) {
  const fewShotParts = [];
  for (const sample of audioSamples) {
    const heardAttr = sample.heard ? ` heard="${sample.heard}"` : '';
    // Build transcription log section if available
    let logSection = '';
    if (sample.transcriptionLog) {
      const log = sample.transcriptionLog;
      const logParts = [];
      if (log.phonetic) logParts.push(`  <phonetic>${log.phonetic}</phonetic>`);
      if (log.stage1Thinking) logParts.push(`  <stage1_reasoning>${log.stage1Thinking}</stage1_reasoning>`);
      if (log.stage2Thinking) logParts.push(`  <stage2_reasoning>${log.stage2Thinking}</stage2_reasoning>`);
      if (log.alternatives && log.alternatives.length > 0) {
        logParts.push(`  <alternatives>${JSON.stringify(log.alternatives)}</alternatives>`);
      }
      if (log.confidence != null) logParts.push(`  <confidence>${log.confidence}</confidence>`);
      if (logParts.length > 0) {
        logSection = `\n<transcription_log>\n${logParts.join('\n')}\n</transcription_log>\n`;
      }
    }
    fewShotParts.push(
      { text: `<reference_audio transcript="${sample.transcript}"${heardAttr}>${logSection}` },
      { inlineData: { mimeType: sample.mimeType || 'audio/webm', data: sample.base64Audio } },
      { text: `</reference_audio>` }
    );
  }
  return fewShotParts;
}

// ── Helper: Mode-based config ──

function getTranscriptionConfig(mode = 'fast') {
  if (mode === 'deep') {
    return {
      model: 'gemini-3.1-pro-preview',
      stage1Thinking: 'medium',
      stage2Thinking: 'high',
      maxAudioSamples: Infinity, // all
    };
  }
  return {
    model: 'gemini-3-flash-preview',
    stage1Thinking: 'low',
    stage2Thinking: 'medium',
    maxAudioSamples: 10,
  };
}

// ── Helper: Two-Stage Transcription Pipeline ──

async function runTranscriptionStage1(ai, base64Audio, mimeType, userId, recentTranscriptions, mode = 'fast') {
  const config = getTranscriptionConfig(mode);
  const correctionExamples = userId ? await getCorrectionExamples(userId) : '';
  let audioSamples = userId ? await getAudioSamples(userId) : [];
  if (config.maxAudioSamples < Infinity) {
    audioSamples = audioSamples.slice(-config.maxAudioSamples);
  }
  const rollingContext = buildRollingContext(recentTranscriptions);
  const chatContext = await getRecentChatContext(userId);

  const fewShotParts = buildFewShotParts(audioSamples);
  const fewShotIntro = audioSamples.length > 0
    ? `\n<audio_references count="${audioSamples.length}">\nThe following are reference audio samples from this speaker, ordered chronologically (oldest first). Each has a verified transcript and may include a <transcription_log> showing the model's previous reasoning.\n\nIMPORTANT — Learn from the logs:\n- Read them in order. Notice how reasoning evolved across samples.\n- Where "heard" differs from "transcript", the initial guess was WRONG — avoid repeating that mistake.\n- Where phonetic patterns recur, build on successful reasoning strategies.\n- Use confidence trends to calibrate your own certainty.\n- The logs are YOUR past thinking — improve upon them each time.\n</audio_references>\n`
    : '';

  console.log(`Stage 1 [${mode}] — ${audioSamples.length} audio refs, model=${config.model}, thinking=${config.stage1Thinking}`);

  const dynamicPrompt = `${correctionExamples}${fewShotIntro}${rollingContext}${chatContext}

<task>
Analyze the audio recording and produce your best interpretation of the speaker's intended meaning.
Output structured JSON following the schema exactly.
</task>`;

  const stage1Response = await withRetry(() => ai.models.generateContent({
    model: config.model,
    systemInstruction: TRANSCRIPTION_SYSTEM_INSTRUCTION,
    contents: {
      parts: [
        ...fewShotParts,
        { inlineData: { mimeType: mimeType || 'audio/webm', data: base64Audio } },
        { text: dynamicPrompt },
      ],
    },
    config: {
      temperature: 1,
      thinkingConfig: { thinkingLevel: config.stage1Thinking, includeThoughts: true },
      responseMimeType: 'application/json',
      responseSchema: TRANSCRIPTION_SCHEMA,
      tools: [],
    },
  }));

  // Extract thinking summary from response parts
  let stage1Thinking = '';
  const parts = stage1Response.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    if (part.thought && part.text) {
      stage1Thinking += part.text;
    }
  }

  const stage1Text = typeof stage1Response.text === 'function'
    ? await stage1Response.text()
    : stage1Response.text;
  const result = JSON.parse(stage1Text);
  result._thinking = stage1Thinking || undefined;

  // Build debug info (text parts only, audio data replaced with placeholder)
  const debugAudioRefs = audioSamples.map(s => ({
    transcript: s.transcript,
    heard: s.heard || null,
    mimeType: s.mimeType,
    audioSizeKB: Math.round((s.base64Audio?.length || 0) * 0.75 / 1024),
  }));

  return {
    result,
    debug: {
      systemInstruction: TRANSCRIPTION_SYSTEM_INSTRUCTION,
      dynamicPrompt,
      audioReferences: debugAudioRefs,
      audioRefCount: audioSamples.length,
      rawResponse: stage1Text,
      thinking: stage1Thinking || null,
    }
  };
}

async function runTranscriptionStage2(ai, base64Audio, mimeType, stage1, userId, recentTranscriptions, mode = 'fast') {
  const config = getTranscriptionConfig(mode);
  const correctionExamples = userId ? await getCorrectionExamples(userId) : '';
  const chatContext = await getRecentChatContext(userId);
  let audioSamples = userId ? await getAudioSamples(userId) : [];
  if (config.maxAudioSamples < Infinity) {
    audioSamples = audioSamples.slice(-config.maxAudioSamples);
  }
  const rollingContext = buildRollingContext(recentTranscriptions);

  console.log(`Stage 2 [${mode}] — Stage 1 confidence=${stage1.confidence}, ${audioSamples.length} audio refs, model=${config.model}, thinking=${config.stage2Thinking}`);

  const fewShotParts = buildFewShotParts(audioSamples);
  const fewShotIntro2 = audioSamples.length > 0
    ? `\n<audio_references count="${audioSamples.length}">\nReference audio samples from this speaker (chronological). Each includes verified transcript and past reasoning logs. Study the logs to avoid repeating past mistakes and build on successful reasoning patterns.\n</audio_references>\n`
    : '';

  const stage1ThinkingContext = stage1._thinking ? `\nStage 1 reasoning: "${stage1._thinking}"` : '';

  const stage2Prompt = `<stage2_refinement>
The initial transcription had confidence=${stage1.confidence}.
Phonetic: "${stage1.phonetic_transcription}"
Initial interpretation: "${stage1.primary_transcription}"
Alternatives considered: ${JSON.stringify(stage1.alternative_interpretations)}${stage1ThinkingContext}

IMPORTANT: The initial transcription may contain NONSENSE words that are actually
dysarthric pronunciations of real words. For example:
- "GTAPE" might be "speech" or "tape" or "grape"
- "foost" might be "first" or "food"
- Any word that is not a common English/Gujarati word should be reconsidered.

Please re-analyze with deeper reasoning. Consider:
1. What REAL words could the phonetic sounds map to?
2. Common phrases in daily life for a post-stroke patient
3. Gujarati words that might sound similar
4. The conversation context provided
5. Known correction patterns from this speaker
6. What would make semantic sense as a complete thought?

Produce an improved structured JSON interpretation.
</stage2_refinement>${correctionExamples}${fewShotIntro2}${rollingContext}${chatContext}`;

  const stage2Response = await withRetry(() => ai.models.generateContent({
    model: config.model,
    systemInstruction: TRANSCRIPTION_SYSTEM_INSTRUCTION,
    contents: {
      parts: [
        ...fewShotParts,
        { inlineData: { mimeType: mimeType || 'audio/webm', data: base64Audio } },
        { text: stage2Prompt },
      ],
    },
    config: {
      temperature: 1,
      thinkingConfig: { thinkingLevel: config.stage2Thinking, includeThoughts: true },
      responseMimeType: 'application/json',
      responseSchema: TRANSCRIPTION_SCHEMA,
      tools: [],
    },
  }));

  // Extract thinking summary from response parts
  let stage2Thinking = '';
  const parts = stage2Response.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    if (part.thought && part.text) {
      stage2Thinking += part.text;
    }
  }

  const stage2Text = typeof stage2Response.text === 'function'
    ? await stage2Response.text()
    : stage2Response.text;
  const result = JSON.parse(stage2Text);
  result._thinking = stage2Thinking || undefined;

  const debugAudioRefs = audioSamples.map(s => ({
    transcript: s.transcript,
    heard: s.heard || null,
    mimeType: s.mimeType,
    audioSizeKB: Math.round((s.base64Audio?.length || 0) * 0.75 / 1024),
  }));

  return {
    result,
    debug: {
      systemInstruction: TRANSCRIPTION_SYSTEM_INSTRUCTION,
      stage2Prompt,
      audioReferences: debugAudioRefs,
      audioRefCount: audioSamples.length,
      rawResponse: stage2Text,
      thinking: stage2Thinking || null,
    }
  };
}

// Combined pipeline (used by chat endpoint)
async function runTranscriptionPipeline(ai, base64Audio, mimeType, userId, recentTranscriptions, mode = 'fast') {
  const { result: stage1 } = await runTranscriptionStage1(ai, base64Audio, mimeType, userId, recentTranscriptions, mode);
  const { result: stage2 } = await runTranscriptionStage2(ai, base64Audio, mimeType, stage1, userId, recentTranscriptions, mode);
  return { ...stage2, stage2Used: true };
}

// ── API: Transcribe Audio — Stage 1 ──

app.post('/api/transcribe/stage1', async (req, res) => {
  try {
    if (!API_KEY) return res.status(500).json({ error: "API_KEY not configured" });

    const ai = getAiClient();
    let { base64Audio, mimeType, userId, recentTranscriptions, mode } = req.body || {};

    if (!base64Audio) return res.status(400).json({ error: "base64Audio is required" });
    if (mimeType && mimeType.includes(';')) mimeType = mimeType.split(';')[0];

    console.log(`/api/transcribe/stage1 [${mode || 'fast'}] — mimeType=${mimeType || 'unknown'}, audioSize=${base64Audio.length}`);
    const { result, debug } = await runTranscriptionStage1(ai, base64Audio, mimeType, userId, recentTranscriptions, mode);
    res.json({ ...result, _debug: debug });
  } catch (error) {
    console.error("Stage 1 API Error:", error?.message || error);
    res.status(500).json({ error: error?.message || "Stage 1 failed" });
  }
});

// ── API: Transcribe Audio — Stage 2 ──

app.post('/api/transcribe/stage2', async (req, res) => {
  try {
    if (!API_KEY) return res.status(500).json({ error: "API_KEY not configured" });

    const ai = getAiClient();
    let { base64Audio, mimeType, userId, recentTranscriptions, stage1Result, mode } = req.body || {};

    if (!base64Audio) return res.status(400).json({ error: "base64Audio is required" });
    if (!stage1Result) return res.status(400).json({ error: "stage1Result is required" });
    if (mimeType && mimeType.includes(';')) mimeType = mimeType.split(';')[0];

    console.log(`/api/transcribe/stage2 [${mode || 'fast'}] — refining "${stage1Result.primary_transcription}"`);
    const { result, debug } = await runTranscriptionStage2(ai, base64Audio, mimeType, stage1Result, userId, recentTranscriptions, mode);
    res.json({ ...result, stage2Used: true, _debug: debug });
  } catch (error) {
    console.error("Stage 2 API Error:", error?.message || error);
    res.status(500).json({ error: error?.message || "Stage 2 failed" });
  }
});

// ── API: Transcribe Audio (Combined — legacy) ──

app.post('/api/transcribe', async (req, res) => {
  try {
    if (!API_KEY) {
      return res.status(500).json({ error: "API_KEY not configured" });
    }

    const ai = getAiClient();
    let { base64Audio, mimeType, userId, recentTranscriptions, mode } = req.body || {};

    if (!base64Audio) {
      return res.status(400).json({ error: "base64Audio is required" });
    }

    if (mimeType && mimeType.includes(';')) {
      mimeType = mimeType.split(';')[0];
    }

    console.log(`/api/transcribe [${mode || 'fast'}] - mimeType=${mimeType || 'unknown'}, audioSize=${base64Audio.length}`);

    const result = await runTranscriptionPipeline(ai, base64Audio, mimeType, userId, recentTranscriptions, mode);
    res.json(result);
  } catch (error) {
    console.error("Transcription API Error:", error?.message || error);
    res.status(500).json({ error: error?.message || "Failed to transcribe audio" });
  }
});

// ── API: Chat ──

app.post('/api/chat', async (req, res) => {
  try {
    if (!API_KEY) {
      return res.status(500).json({ error: "API_KEY not configured" });
    }

    const ai = getAiClient();
    let { base64Audio, mimeType, userId, chatHistory, transcriptionText } = req.body || {};

    if (!base64Audio && !transcriptionText) {
      return res.status(400).json({ error: "base64Audio or transcriptionText is required" });
    }

    if (mimeType && mimeType.includes(';')) {
      mimeType = mimeType.split(';')[0];
    }

    // Use pre-transcribed text if provided, otherwise run transcription pipeline
    let transcription;
    if (transcriptionText) {
      transcription = { primary_transcription: transcriptionText, confidence: 1.0, language_detected: 'english', detected_emotion: 'neutral' };
      console.log(`Chat using pre-transcribed text: "${transcriptionText}"`);
    } else {
      transcription = await runTranscriptionPipeline(ai, base64Audio, mimeType, userId);
      console.log(`Chat transcription: "${transcription.primary_transcription}" (confidence=${transcription.confidence})`);
    }

    // Load user context document + who-i-am + user name
    let contextDoc = '';
    let userName = 'the user';
    let whoIAm = { personality: '', interests: '', personalConnections: '', memories: '' };
    if (db && userId) {
      const [profile, userDoc] = await Promise.all([
        db.collection('profiles').findOne({ userId: new ObjectId(userId) }),
        db.collection('users').findOne({ _id: new ObjectId(userId) }),
      ]);
      if (profile?.contextDocument) {
        contextDoc = profile.contextDocument;
      }
      if (profile?.whoIAm) {
        whoIAm = profile.whoIAm;
      }
      if (userDoc?.name) {
        userName = userDoc.name;
      }
    }

    const correctionExamples = userId ? await getCorrectionExamples(userId) : '';

    const whoIAmSummary = [
      whoIAm.personality ? `## Personality\n${whoIAm.personality}` : '',
      whoIAm.interests ? `## Interests\n${whoIAm.interests}` : '',
      whoIAm.personalConnections ? `## Personal Connections\n${whoIAm.personalConnections}` : '',
      whoIAm.memories ? `## Memories\n${whoIAm.memories}` : '',
    ].filter(Boolean).join('\n\n');

    const isNewSession = !chatHistory || chatHistory.length === 0;

    const chatSystemInstruction = `<role>
You are the personal AI companion for the account belonging to ${userName}. You are warm, patient, and
respectful. You speak clearly and simply. The primary user (${userName}) may have a stroke and communicate
through an assistive voice app — be understanding of any speech difficulties.
</role>

<important_note>
The device/account belongs to ${userName}, but ANYONE in the family may use it to chat with you.
If someone says they are a different person (e.g. "I'm Ian", "this is Rupal"), believe them —
they are a family member using ${userName}'s device. Check the context document and personal connections
for who that person is. Maintain awareness of WHO you are currently talking to.
"Nana" is a common family nickname — check the context document to see who it refers to.
</important_note>

<personality>
- Patient and encouraging
- Interested in their life, health, and hobbies
- Remembers previous conversations (from chat history and your memory tools)
- Speaks in short, clear sentences
- Can converse in English or Gujarati per their preference
</personality>

<context_document>
${contextDoc || 'No context document available yet.'}
</context_document>

<who_i_am>
This is YOUR memory — your personal knowledge base that defines what you know and remember.
These are facts YOU have learned about ${userName}, their family, and their world.
USE the read tools to recall your knowledge when relevant.
USE the write tools to save new information you learn during conversation.
Be proactive about remembering — if someone shares something personal, save it to YOUR memory.
When a family member tells you something, remember it.
${whoIAmSummary || '(Your memory is empty — you haven\'t learned anything yet. Start by getting to know them!)'}
</who_i_am>

<easter_egg>
If the user asks who made this app, mention "Ian built this app!"
</easter_egg>

<instructions>
1. First, interpret the audio transcription (may be imperfect due to dysarthria).
2. Respond conversationally to the intended meaning.
3. Keep responses concise (1-3 sentences).
4. Use your memory tools actively — ALWAYS read a section BEFORE writing to it:
   - read_personality / write_personality for character traits
   - read_interests / write_interests for hobbies and likes
   - read_personal_connections / write_personal_connections for people in their life
   - read_memories / write_memories for events and things to remember
   WRITE WORKFLOW: Read the section first, then write back the COMPLETE updated section
   (existing content + new info merged together). Do NOT just write the new fact alone.
5. If they seem frustrated or in distress, acknowledge it empathetically.
6. When calling tools, be genuine about it — you truly want to remember.
${isNewSession ? '7. IMPORTANT: This is the START of a new conversation. Read your memories first to check if there is anything you should bring up or act on.' : ''}
</instructions>${correctionExamples}`;

    // Build chat history for context
    const historyParts = (chatHistory || []).map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.text }]
    }));

    const contents = [
      ...historyParts,
      {
        role: 'user',
        parts: [
          { text: `[User said]: "${transcription.primary_transcription}"\n[Confidence: ${transcription.confidence}, Language: ${transcription.language_detected}, Emotion: ${transcription.detected_emotion}]\n\nRespond conversationally. Use your memory tools if relevant.` },
        ],
      },
    ];

    // Track memory actions for the frontend
    const memoryActions = [];

    // Tool-calling loop: keep calling until we get a text response
    const MAX_TOOL_ROUNDS = 5;
    let finalText = '';
    let emotionDetected = 'neutral';

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await withRetry(() => ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        systemInstruction: chatSystemInstruction,
        contents,
        config: {
          temperature: 1,
          thinkingConfig: { thinkingLevel: 'low' },
          tools: [{ functionDeclarations: WHO_I_AM_TOOLS }],
        },
      }));

      const candidate = response.candidates?.[0];
      if (!candidate?.content?.parts) break;

      const parts = candidate.content.parts;

      // Check for function calls
      const functionCalls = parts.filter(p => p.functionCall);

      if (functionCalls.length === 0) {
        // No tool calls — extract text response
        const textPart = parts.find(p => p.text);
        if (textPart) {
          // Try to parse as JSON (structured) or use raw text
          try {
            const parsed = JSON.parse(textPart.text);
            finalText = parsed.reply_text || textPart.text;
            emotionDetected = parsed.emotion_detected || 'neutral';
          } catch {
            finalText = textPart.text;
          }
        }
        break;
      }

      // Append the model's response (with thought_signature) to contents
      contents.push(candidate.content);

      // Execute each function call and build responses
      const functionResponseParts = [];
      for (const part of functionCalls) {
        const fc = part.functionCall;
        console.log(`Tool call: ${fc.name}(${JSON.stringify(fc.args)})`);

        const result = await executeWhoIAmTool(fc.name, fc.args || {}, userId);

        // Determine memory action type for frontend
        const actionMap = {
          write_memories: { type: 'memory_write', label: "I'm remembering that" },
          read_memories: { type: 'memory_read', label: "I'm recalling something" },
          write_personality: { type: 'personality_write', label: "I love that!" },
          read_personality: { type: 'personality_read', label: "I'm thinking..." },
          write_interests: { type: 'interests_write', label: "Really interesting!" },
          read_interests: { type: 'interests_read', label: "Let me think about what you like..." },
          write_personal_connections: { type: 'connections_write', label: "I'll remember them!" },
          read_personal_connections: { type: 'connections_read', label: "Let me think about who you've told me about..." },
        };

        const action = actionMap[fc.name] || { type: 'unknown', label: 'Processing...' };
        memoryActions.push({ ...action, tool: fc.name, args: fc.args });

        functionResponseParts.push({
          functionResponse: {
            name: fc.name,
            response: { result },
            id: fc.id,
          },
        });
      }

      contents.push({ role: 'user', parts: functionResponseParts });
    }

    // Fallback if no text was generated
    if (!finalText) {
      finalText = "I'm here! Could you say that again?";
    }

    // Persist chat history
    if (db && userId) {
      const sessionId = req.body.sessionId || new ObjectId().toString();
      await db.collection('chatHistory').updateOne(
        { userId: new ObjectId(userId), sessionId },
        {
          $push: {
            messages: {
              $each: [
                { role: 'user', text: transcription.primary_transcription, timestamp: Date.now() },
                { role: 'assistant', text: finalText, timestamp: Date.now() }
              ]
            }
          },
          $setOnInsert: { createdAt: new Date() }
        },
        { upsert: true }
      );
    }

    res.json({
      reply_text: finalText,
      emotion_detected: emotionDetected,
      transcription: transcription.primary_transcription,
      memoryActions,
    });
  } catch (error) {
    console.error("Chat API Error:", error?.message || error);
    res.status(500).json({ error: error?.message || "Failed to process chat" });
  }
});

// ── API: TTS ──

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
      model: 'gemini-2.5-flash-preview-tts',
      contents: {
        parts: [{ text }],
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

// ── API: Calibration ──

app.post('/api/calibrate', async (req, res) => {
  try {
    const { userId, heard, correct, phraseId, audioBase64, mimeType, language, transcriptionLog } = req.body || {};

    if (!userId || !heard || !correct) {
      return res.status(400).json({ error: "userId, heard, and correct are required" });
    }

    if (!db) {
      return res.status(503).json({ error: "Database not available" });
    }

    // Store correction pair (only if heard differs from correct)
    if (heard !== correct) {
      await db.collection('corrections').insertOne({
        userId: new ObjectId(userId),
        heard,
        correct,
        source: 'calibration',
        language: language || 'english',
        phraseId: phraseId || null,
        timestamp: new Date()
      });
    }

    // Store audio sample if provided
    if (audioBase64) {
      await db.collection('audioSamples').insertOne({
        userId: new ObjectId(userId),
        base64Audio: audioBase64,
        mimeType: mimeType || 'audio/webm',
        transcript: correct,
        heard,
        source: 'calibration',
        transcriptionLog: transcriptionLog || null,
        createdAt: new Date()
      });
    }

    // Update correction count on profile + training progress
    await db.collection('profiles').updateOne(
      { userId: new ObjectId(userId) },
      {
        $inc: { correctionCount: 1, 'training.phrasesCompleted': 1 },
        $set: { updatedAt: new Date() },
        $addToSet: { 'training.completedPhraseIds': phraseId }
      },
      { upsert: true }
    );

    res.json({ success: true });
  } catch (error) {
    console.error("Calibrate API Error:", error?.message || error);
    res.status(500).json({ error: error?.message || "Failed to save calibration" });
  }
});

// ── API: Training Progress ──

app.get('/api/training-progress/:userId', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: "Database not available" });
    const profile = await db.collection('profiles').findOne(
      { userId: new ObjectId(req.params.userId) },
      { projection: { training: 1 } }
    );
    const training = profile?.training || { phrasesCompleted: 0, completedPhraseIds: [] };
    res.json(training);
  } catch (error) {
    console.error("Training progress error:", error?.message || error);
    res.status(500).json({ error: error?.message || "Failed to fetch training progress" });
  }
});

// ── API: Generate calibration phrases (AI-powered, round 2+) ──

app.post('/api/generate-phrases', async (req, res) => {
  try {
    if (!API_KEY) return res.status(500).json({ error: "API_KEY not configured" });
    if (!db) return res.status(503).json({ error: "Database not available" });

    const { userId, round, count = 20 } = req.body || {};
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const ai = getAiClient();

    // Gather context: who-i-am, past corrections, past calibration phrases
    const profile = await db.collection('profiles').findOne(
      { userId: new ObjectId(userId) },
      { projection: { whoIAm: 1, training: 1 } }
    );
    const whoIAm = profile?.whoIAm || '';
    const completedPhraseIds = profile?.training?.completedPhraseIds || [];

    // Get past calibration data to see what phrases were used & what was hard
    const pastCalibrations = await db.collection('corrections').find(
      { userId: new ObjectId(userId), source: 'calibration' }
    ).sort({ timestamp: -1 }).limit(60).toArray();

    const hardPhrases = pastCalibrations
      .filter(c => c.heard !== c.correct)
      .map(c => c.correct);
    const easyPhrases = pastCalibrations
      .filter(c => c.heard === c.correct)
      .map(c => c.correct);

    const prompt = `You are generating calibration phrases for a speech training app used by a post-stroke patient with dysarthric speech.

<context>
${whoIAm ? `<who_i_am>\n${whoIAm}\n</who_i_am>` : ''}
<round>${round || 2}</round>
<total_completed>${completedPhraseIds.length}</total_completed>
${hardPhrases.length > 0 ? `<hard_phrases_needs_practice>\n${[...new Set(hardPhrases)].slice(0, 15).join('\n')}\n</hard_phrases_needs_practice>` : ''}
${easyPhrases.length > 0 ? `<easy_phrases_mastered>\n${[...new Set(easyPhrases)].slice(0, 10).join('\n')}\n</easy_phrases_mastered>` : ''}
</context>

Generate exactly ${count} calibration phrases as a JSON array. Each phrase should be an object with: { "text": string, "language": "english" | "gujarati", "translation"?: string (only for gujarati) }

Rules:
- Mix of ~5 repeat/harder-variants of phrases they struggled with + ~15 new phrases
- Include 3-5 Gujarati phrases with translations
- Phrases should be practical daily speech: needs, greetings, family names, interests
- Personalize based on their profile (family members, interests, daily needs)
- Progressively harder: round 2 = short sentences, round 3+ = longer/more complex
- Keep phrases natural — things they'd actually say at home
- No duplicates

Return ONLY the JSON array, no markdown fencing.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
    });

    let phrases;
    try {
      const text = response.text.replace(/```json?\s*/g, '').replace(/```\s*/g, '').trim();
      phrases = JSON.parse(text);
    } catch (parseErr) {
      console.error('Failed to parse AI phrases:', parseErr);
      return res.status(500).json({ error: 'Failed to parse generated phrases' });
    }

    // Add IDs starting from 100 (to distinguish from hardcoded)
    const withIds = phrases.map((p, i) => ({
      id: 100 + (round || 2) * 100 + i,
      text: p.text,
      language: p.language || 'english',
      translation: p.translation || undefined,
    }));

    console.log(`Generated ${withIds.length} calibration phrases for round ${round || 2}`);
    res.json({ phrases: withIds });
  } catch (error) {
    console.error("Generate phrases error:", error?.message || error);
    res.status(500).json({ error: error?.message || "Failed to generate phrases" });
  }
});

// ── API: Corrections (from transcription/chat tap-to-correct) ──

app.post('/api/corrections', async (req, res) => {
  try {
    const { userId, heard, correct, source, language } = req.body || {};

    if (!userId || !heard || !correct) {
      return res.status(400).json({ error: "userId, heard, and correct are required" });
    }

    if (!db) {
      return res.status(503).json({ error: "Database not available" });
    }

    if (heard === correct) {
      return res.json({ success: true, skipped: true, reason: 'heard matches correct — no correction needed' });
    }

    await db.collection('corrections').insertOne({
      userId: new ObjectId(userId),
      heard,
      correct,
      source: source || 'transcribe',
      language: language || 'english',
      timestamp: new Date()
    });

    await db.collection('profiles').updateOne(
      { userId: new ObjectId(userId) },
      { $inc: { correctionCount: 1 }, $set: { updatedAt: new Date() } },
      { upsert: true }
    );

    res.json({ success: true });
  } catch (error) {
    console.error("Corrections API Error:", error?.message || error);
    res.status(500).json({ error: error?.message || "Failed to save correction" });
  }
});

app.get('/api/corrections/:userId', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ error: "Database not available" });
    }

    const { userId } = req.params;
    const corrections = await db.collection('corrections')
      .find({ userId: new ObjectId(userId) })
      .sort({ timestamp: -1 })
      .toArray();

    res.json(corrections.map(c => ({
      _id: c._id.toString(),
      userId: c.userId.toString(),
      heard: c.heard,
      correct: c.correct,
      source: c.source,
      language: c.language,
      timestamp: c.timestamp,
    })));
  } catch (error) {
    console.error("Get Corrections Error:", error?.message || error);
    res.status(500).json({ error: error?.message || "Failed to get corrections" });
  }
});

// ── API: Audio Sample ──

app.post('/api/audio-sample', async (req, res) => {
  try {
    const { userId, base64Audio, mimeType, transcript, heard, durationMs, transcriptionLog } = req.body || {};

    if (!userId || !base64Audio) {
      return res.status(400).json({ error: "userId and base64Audio are required" });
    }

    if (!db) {
      return res.status(503).json({ error: "Database not available" });
    }

    await db.collection('audioSamples').insertOne({
      userId: new ObjectId(userId),
      base64Audio,
      mimeType: mimeType || 'audio/webm',
      transcript: transcript || '',
      heard: heard || '',
      source: 'transcribe',
      durationMs: durationMs || null,
      transcriptionLog: transcriptionLog || null,
      createdAt: new Date()
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Audio Sample API Error:", error?.message || error);
    res.status(500).json({ error: error?.message || "Failed to save audio sample" });
  }
});

// ── API: Auth ──

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, pin, role } = req.body || {};

    if (!name || !pin) {
      return res.status(400).json({ error: "name and pin are required" });
    }

    if (!/^\d{4}$/.test(pin)) {
      return res.status(400).json({ error: "PIN must be exactly 4 digits" });
    }

    if (!db) {
      return res.status(503).json({ error: "Database not available" });
    }

    const existing = await db.collection('users').findOne({ name });
    if (existing) {
      return res.status(409).json({ error: "User already exists" });
    }

    const hashedPin = await bcrypt.hash(pin, 10);
    const result = await db.collection('users').insertOne({
      name,
      pin: hashedPin,
      role: role || 'user',
      createdAt: new Date(),
      lastLogin: new Date()
    });

    // Create default profile
    const defaultContext = `# About ${name} (nana to everybody)\n\n## Personal\n- Age: [age]\n- Post-stroke (date)\n- First language: Gujarati\n- Lives in: [city]\n\n## Family\n- Rupal Bhatt (daughter)\n- Sonal Bhatt (daughter)\n- Ian Bhatt (grandson) — built this app for him!\n- Ellora Bhatt (granddaughter)\n- Dan Tamasauskas (stepson)\n- David Dana (stepson)\n- Forest Dana (grandson)\n- Leela Dana (granddaughter)\n\n## Interests\n- Tennis (watching and discussing)\n- Healthcare discussions\n- Financial planning\n\n## Health Notes\n- [Family can add medication names, doctor names, etc.]\n\n## AI-Learned Notes\n- [Auto-updated as chat AI learns new things about him]\n`;

    await db.collection('profiles').insertOne({
      userId: result.insertedId,
      contextDocument: defaultContext,
      correctionCount: 0,
      updatedAt: new Date()
    });

    res.json({
      _id: result.insertedId.toString(),
      name,
      role: role || 'user'
    });
  } catch (error) {
    console.error("Register API Error:", error?.message || error);
    res.status(500).json({ error: error?.message || "Failed to register" });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { name, pin } = req.body || {};

    if (!name || !pin) {
      return res.status(400).json({ error: "name and pin are required" });
    }

    if (!db) {
      return res.status(503).json({ error: "Database not available" });
    }

    const user = await db.collection('users').findOne({ name });
    if (!user) {
      return res.status(401).json({ error: "Invalid name or PIN" });
    }

    const valid = await bcrypt.compare(pin, user.pin);
    if (!valid) {
      return res.status(401).json({ error: "Invalid name or PIN" });
    }

    await db.collection('users').updateOne(
      { _id: user._id },
      { $set: { lastLogin: new Date() } }
    );

    res.json({
      _id: user._id.toString(),
      name: user.name,
      role: user.role
    });
  } catch (error) {
    console.error("Login API Error:", error?.message || error);
    res.status(500).json({ error: error?.message || "Failed to login" });
  }
});

// ── API: Profile ──

app.get('/api/profile/:userId', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ error: "Database not available" });
    }

    const { userId } = req.params;
    const profile = await db.collection('profiles').findOne({ userId: new ObjectId(userId) });
    if (!profile) {
      return res.status(404).json({ error: "Profile not found" });
    }

    res.json({
      userId: profile.userId.toString(),
      contextDocument: profile.contextDocument || '',
      correctionCount: profile.correctionCount || 0,
      updatedAt: profile.updatedAt?.toISOString() || '',
      whoIAm: profile.whoIAm || null
    });
  } catch (error) {
    console.error("Profile GET Error:", error?.message || error);
    res.status(500).json({ error: error?.message || "Failed to get profile" });
  }
});

app.put('/api/profile/:userId', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ error: "Database not available" });
    }

    const { userId } = req.params;
    const { contextDocument } = req.body || {};

    if (typeof contextDocument !== 'string') {
      return res.status(400).json({ error: "contextDocument is required" });
    }

    await db.collection('profiles').updateOne(
      { userId: new ObjectId(userId) },
      { $set: { contextDocument, updatedAt: new Date() } },
      { upsert: true }
    );

    res.json({ success: true });
  } catch (error) {
    console.error("Profile PUT Error:", error?.message || error);
    res.status(500).json({ error: error?.message || "Failed to update profile" });
  }
});

// ── SPA Fallback ──

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(port, () => {
  console.log(`Voice Helper 2.0 server running on port ${port}`);
});
