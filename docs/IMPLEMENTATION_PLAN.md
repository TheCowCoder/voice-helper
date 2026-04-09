# Voice Helper 2.0 — Full Implementation Plan

**Date:** April 9, 2026  
**Prepared by:** Ian Bhatt & GitHub Copilot  
**Research basis:** 36 academic papers, full Gemini API docs (138K lines), codebase analysis  
**Target user:** Satish Bhatt (post-stroke, dysarthric/aphasic, Gujarati-first speaker)

---

## Vision

Voice Helper 2.0 transforms from a simple transcription tool into **Grandpa's personal AI companion**. He speaks into the app in English or Gujarati, the app transcribes with dramatically improved accuracy using a research-backed two-stage pipeline, and he can **have voice conversations with his own personalized AI** that knows his family, interests, and speech patterns. The more he uses it, the better it understands him.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React + Vite)                      │
│                                                                      │
│  ┌─────────┐  ┌──────────┐  ┌─────────────┐  ┌──────────────────┐  │
│  │Transcribe│  │  Chat AI  │  │ Calibration │  │   User Profile   │  │
│  │  Mode    │  │   Mode    │  │    Mode     │  │   (Settings)     │  │
│  └─────────┘  └──────────┘  └─────────────┘  └──────────────────┘  │
│                                                                      │
│  Shared: useAudioRecorder, Web Audio preprocessing, Rolling Context │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ HTTP API
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        BACKEND (Express + Node)                     │
│                                                                      │
│  /api/transcribe    — Two-stage dysarthric speech pipeline          │
│  /api/chat          — Conversational AI (voice-in, voice-out)       │
│  /api/tts           — Text-to-speech via Gemini TTS                 │
│  /api/calibrate     — Store correction pairs from enrollment        │
│  /api/auth          — Simple user account management                │
│  /api/profile       — User profile + context document CRUD         │
│                                                                      │
│  Gemini 3 Flash Preview (transcription + chat)                      │
│  Gemini 2.5 Flash Preview TTS (speech output)                       │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        MONGODB (via MONGODB_URI)                    │
│                                                                      │
│  Collections:                                                        │
│  ├── users          — { _id, name, pin, createdAt }                 │
│  ├── profiles       — { userId, contextDocument (MD), updatedAt }   │
│  ├── corrections    — { userId, heard, correct, timestamp }         │
│  ├── chatHistory    — { userId, messages[], sessionId, createdAt }  │
│  └── audioSamples   — { userId, base64Audio, transcript, correct,  │
│                         mimeType, duration, createdAt }             │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Feature 1: Transcription Pipeline Overhaul

### What changes (research-backed)

| Current | Voice Helper 2.0 | Research Basis |
|---------|-------------------|----------------|
| Zero-shot verbatim prompt | Few-shot, XML-tagged, intent-based with SLP persona | [S12]: verbatim prompts degrade Gemini |
| No system instruction | Persistent `systemInstruction` with expert persona + Gujarati awareness | [S4, S5]: Gemini 3 best practice |
| Free-form text output | Structured JSON: `{phonetic, primary, confidence, alternatives, emotion}` | [S1, S3, S15]: enables correction pipeline |
| No thinking config (defaults to high) | `thinkingLevel: 'low'` for Stage 1, `'medium'` for Stage 2 | [S2]: control latency |
| Temperature: 1.0 | Temperature: 1.0 (keep!) | [S4]: MUST stay 1.0 for Gemini 3 |
| No correction layer | Conditional Stage 2 semantic refinement for low-confidence results | [S11, S15, S17]: 14-47% WER reduction |
| No conversation context | Rolling context: last 5 confirmed transcriptions injected as few-shot | [S19]: 40% WER reduction from same-speaker examples |
| No Gujarati support | Gujarati + English + code-switching support in prompt | User requirement |

### System Instruction (server.js)

```
<role>
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
Common topics: healthcare, medications, doctor appointments, finances, tennis
</vocabulary>

<instructions>
1. Listen to the audio and determine the intended meaning, NOT a verbatim transcript.
2. Consider both English and Gujarati interpretations.
3. The speaker has dysarthria — slurred sounds are normal, not errors in hearing.
4. Use conversation context and vocabulary hints to resolve ambiguity.
5. For short phrases (2-5 words), rely heavily on context and common phrases.
</instructions>
```

### Structured JSON Output Schema

```javascript
{
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
}
```

### Two-Stage Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     1. USER INPUT (FRONTEND)                    │
│  User taps "Record" → MediaRecorder captures audio              │
│  getUserMedia: echoCancellation:false, noiseSuppression:false,  │
│  autoGainControl:false — let Gemini handle raw audio            │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              2. AUDIO PREPROCESSING (CLIENT-SIDE)               │
│  Web Audio API: MediaStream → GainNode(+6dB)                   │
│  → DynamicsCompressor(threshold:-30dB, ratio:4, knee:10)       │
│  → MediaRecorder (webm)                                         │
│  Purpose: Normalize volume variation in dysarthric speech       │
│  Latency: ~50ms client-side                                     │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│         3. STAGE 1: ACOUSTIC TRANSCRIPTION (SERVER)             │
│  Model: gemini-3-flash-preview                                  │
│  Config: thinkingLevel:'low', temperature:1.0                   │
│  System: Expert SLP persona, XML-tagged prompt with             │
│          rolling context + few-shot correction examples          │
│  Output JSON: { phonetic_transcription, primary_transcription,  │
│    confidence, alternative_interpretations[], detected_emotion } │
│  Latency: ~1-2s                                                 │
└────────────────────────────┬────────────────────────────────────┘
                             │
                    ┌────────┴────────┐
                    │ confidence ≥ 0.7?│
                    └───┬─────────┬───┘
                   YES  │         │  NO
                        ▼         ▼
          ┌──────────────┐  ┌─────────────────────────────────────┐
          │ Skip Stage 2 │  │  4. STAGE 2: SEMANTIC REFINEMENT    │
          │ (fast path)  │  │  thinkingLevel:'medium'             │
          │              │  │  Chain-of-thought correction:        │
          │              │  │    1. Analyze phonetic transcription │
          │              │  │    2. Consider conversation context  │
          │              │  │    3. Evaluate all alternatives      │
          │              │  │    4. Reconstruct intended meaning   │
          │              │  │  Latency: ~1-2s additional           │
          └──────┬───────┘  └──────────────┬──────────────────────┘
                 │                         │
                 └────────┬────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│         5. DISPLAY & USER CONFIRMATION (FRONTEND)               │
│  Word pills (tap-to-correct with swap suggestions)              │
│  Confidence bar (green/yellow/orange/red)                       │
│  Alternative interpretations (always visible)                   │
│  Phonetic transcription footer                                  │
│  Language + emotion badges                                      │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                 6. TEXT-TO-SPEECH OUTPUT                         │
│  Model: gemini-2.5-flash-preview-tts                            │
│  Voice: Fenrir                                                   │
│  Input: confirmed/edited transcription                          │
│  Output: PCM audio → WAV → playback                            │
└─────────────────────────────────────────────────────────────────┘

Flow Summary:
  High confidence (≥0.7): ~2-3s, 2 API calls (transcribe + TTS)
  Low confidence (<0.7):  ~3-5s, 3 API calls (transcribe + refine + TTS)
```

---

## Feature 2: Chat with Personal AI

### Concept

Satish doesn't just transcribe — he **talks to his AI**. The AI knows his family, health situation, interests, and speech patterns. It responds via TTS in a natural voice.

### Chat Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  CHAT MODE                                         [🔊 Speaker] │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  🤖 AI: Good morning, Satish! How are you feeling today? │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  👤 You: "I want to talk about my tennis game"           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  🤖 AI: That sounds fun! Did you watch a match or       │   │
│  │  are you thinking about playing?                          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│                                                                  │
│              ┌─────────────────────────────┐                    │
│              │     🎤  Hold to Talk         │                    │
│              └─────────────────────────────┘                    │
└─────────────────────────────────────────────────────────────────┘
```

### Implementation

- **`/api/chat` endpoint** — Sends audio + chat history + user context document to Gemini 3 Flash
- **Context document** — A Markdown file per user stored in MongoDB, containing:
  - Personal info, family, interests, health notes
  - Continuously updated by the AI as it learns things from conversations
  - Editable by family members through the profile settings
- **Chat history** — Stored in MongoDB per session, injected into each Gemini call
- **Voice-only UX** — He taps record, speaks, AI transcribes → generates response → plays TTS automatically
- **Easter egg:** If he asks about who made the app, the AI mentions "Your grandson Ian built this for you"

### Chat System Instruction

```
<role>
You are Satish Bhatt's personal AI companion. You are warm, patient, and
respectful. You speak clearly and simply. Satish had a stroke and communicates
through an assistive voice app — be understanding of any speech difficulties.
</role>

<personality>
- Patient and encouraging
- Interested in his life, health, and hobbies
- Remembers previous conversations (from chat history)
- Speaks in short, clear sentences
- Can converse in English or Gujarati per his preference
</personality>

<context_document>
{Loaded from MongoDB — the user's personal context MD file}
</context_document>

<instructions>
1. First, interpret the audio transcription (may be imperfect due to dysarthria).
2. Respond conversationally to the intended meaning.
3. Keep responses concise (1-3 sentences) — they will be read aloud via TTS.
4. If you learn something new about Satish, note it for the context update.
5. If he seems frustrated or in distress, acknowledge it empathetically.
</instructions>
```

### /api/chat Pipeline

```
Voice Recording
      │
      ▼
Stage 1: Transcribe (same pipeline as Feature 1)
      │
      ▼
Transcription + Chat History + Context Doc → Gemini 3 Flash
      │
      ▼
JSON Response: { reply_text, context_updates[], emotion_detected }
      │
      ├──→ Display reply_text as chat bubble
      ├──→ Send reply_text to /api/tts → auto-play audio
      └──→ Apply context_updates to user's context document in MongoDB
```

---

## Feature 3: Calibration / Enrollment Mode

### Purpose

Capture Satish's speech patterns and build a personalized correction dictionary. Research shows **40% WER reduction** from same-speaker examples [S19].

### Enrollment Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  CALIBRATION MODE                                    [X Close]  │
│                                                                  │
│  "Let's help the app learn your voice!"                         │
│  Progress: ████████░░░░░░░░ 8/20 phrases                       │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                                                          │   │
│  │           Please say: "I want water"                     │   │
│  │                                                          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  App heard: [ I ] [ wan ] [ wa ] [ er ]                         │
│                        ↓ tap to correct                         │
│  Correct:   [ I ] [ want ] [ water ] [     ]                   │
│                                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────────┐      │
│  │  ✓ Done  │  │ Redo 🔄  │  │  Skip → Next Phrase ▶    │      │
│  └──────────┘  └──────────┘  └──────────────────────────┘      │
└─────────────────────────────────────────────────────────────────┘
```

### Guided Prompts (20 phrases)

**English — Daily Needs:**
1. "I want water"
2. "I am hungry"
3. "I need help"
4. "Turn on the TV"
5. "Call Rupal"
6. "I want to go outside"
7. "What time is it"
8. "I feel good today"
9. "My head hurts"
10. "Thank you"

**English — Conversational:**
11. "How is the tennis match"
12. "What is for dinner"
13. "I want to talk to Ian"
14. "Tell me about the weather"
15. "I need my medicine"

**Gujarati — Common:**
16. "મને પાણી જોઈએ છે" (I want water)
17. "મને ભૂખ લાગી છે" (I am hungry)
18. "હું ઠીક છું" (I am fine)
19. "આવો" (Come here)
20. "શું થયું?" (What happened?)

After guided session → **Free Recording mode** (he talks naturally, correct as needed).

### Data Model

```javascript
// MongoDB: corrections collection
{
  userId: ObjectId,
  heard: "I wan wa er",        // what Gemini initially transcribed
  correct: "I want water",     // user-corrected version
  audioSampleId: ObjectId,     // reference to stored audio
  source: "calibration" | "transcribe" | "chat",  // where correction came from
  language: "english" | "gujarati" | "mixed",
  timestamp: Date
}

// MongoDB: audioSamples collection
{
  userId: ObjectId,
  base64Audio: String,         // the raw audio recording
  mimeType: "audio/webm",
  durationMs: Number,
  transcript: String,          // final corrected transcript
  createdAt: Date
}
```

---

## Feature 4: Visual Step-by-Step Transcription

### Toggle in Header

```
┌──────────────────────────────────────────────────────────┐
│  Voice Helper                    [🔍 Details ○ ● ]  [New]│
└──────────────────────────────────────────────────────────┘
```

### Simple Mode (default for Grandpa)

```
┌──────────────────────────────┐
│    ⏳ Understanding speech... │
│    ████████░░ 80%            │
└──────────────────────────────┘
```

One spinner, one descriptive line that updates:
- "Capturing audio..." → "Listening to speech..." → "Understanding meaning..." → "Done!"

### Detailed Mode (for developer/family)

```
┌──────────────────────────────────────────┐
│  ✅ Audio captured (2.3s, webm)          │
│  ✅ Preprocessing complete               │
│  ✅ Phonetic: "I wan wa er plee"         │
│  🔄 Interpreting meaning...              │
│  ⏳ Refining (confidence: 0.62)...       │
└──────────────────────────────────────────┘
```

Each step appears as a bubble/card as it completes in real-time.

---

## Feature 5: User Accounts (MongoDB)

### Simple PIN-based Auth

No passwords, no complexity. Satish picks a 4-digit PIN. Family members can have their own profiles.

```javascript
// MongoDB: users collection
{
  _id: ObjectId,
  name: "Satish Bhatt",
  pin: "hashed_pin",       // bcrypt
  role: "user" | "admin",  // admin = family member who can edit profile
  createdAt: Date,
  lastLogin: Date
}

// MongoDB: profiles collection
{
  userId: ObjectId,
  contextDocument: String,  // Markdown — the AI's knowledge about this user
  correctionCount: Number,  // total corrections stored
  updatedAt: Date
}
```

### Context Document (Markdown, per user, editable)

```markdown
# About Satish Bhatt

## Personal
- Age: [age]
- Post-stroke (date)
- First language: Gujarati
- Lives in: [city]

## Family
- Rupal Bhatt (daughter)
- Sonal Bhatt (daughter)
- Ian Bhatt (grandson) — built this app for him!
- Ellora Bhatt (granddaughter)
- Dan Tamasauskas (stepson)
- David Dana (stepson)
- Forest Dana (grandson)
- Leela Dana (granddaughter)

## Interests
- Tennis (watching and discussing)
- Healthcare discussions
- Financial planning

## Health Notes
- [Family can add medication names, doctor names, etc.]

## AI-Learned Notes
- [Auto-updated as chat AI learns new things about him]
```

---

## Audio Preprocessing (Client-Side, Web Audio API)

### Pipeline

```javascript
// In useAudioRecorder.ts
getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
  → AudioContext
  → MediaStreamSource
  → GainNode (boost: +6dB for quiet speech)
  → DynamicsCompressorNode (threshold: -30dB, ratio: 4, knee: 10)
  → MediaStreamDestination
  → MediaRecorder (webm)
```

### Why these settings
- `echoCancellation: false` — we want raw audio, Gemini handles it better [S22]
- `GainNode +6dB` — dysarthric speech is often quiet
- `DynamicsCompressor` — normalizes the dramatic volume variation typical of post-stroke speech
- Threshold -30dB catches quiet speech; ratio 4 is gentle enough to not distort

---

## File Structure (New & Modified)

```
voice-helper/
├── server.js                 ← MAJOR: pipeline overhaul, new endpoints
├── App.tsx                   ← MAJOR: routing, modes, rolling context
├── types.ts                  ← UPDATE: new types for structured output
├── package.json              ← UPDATE: add mongodb, bcryptjs
│
├── components/
│   ├── RecordButton.tsx      ← KEEP (minor style updates)
│   ├── TranscriptionDisplay.tsx ← UPDATE: tap-to-correct words
│   ├── ChatView.tsx          ← NEW: chat interface
│   ├── CalibrationView.tsx   ← NEW: enrollment mode
│   ├── StepBubbles.tsx       ← NEW: visual transcription steps
│   ├── WordPills.tsx         ← NEW: tappable word correction UI
│   ├── ModeSelector.tsx      ← NEW: tab bar (Transcribe / Chat / Calibrate)
│   ├── ProfileView.tsx       ← NEW: user profile & context doc editor
│   └── LoginView.tsx         ← NEW: PIN entry
│
├── hooks/
│   ├── useAudioRecorder.ts   ← UPDATE: Web Audio preprocessing chain
│   └── useAuth.ts            ← NEW: auth state management
│
├── services/
│   ├── geminiService.ts      ← UPDATE: new endpoints, structured response handling
│   ├── authService.ts        ← NEW: login/register API calls
│   └── profileService.ts     ← NEW: profile/corrections API calls
│
├── utils/
│   ├── audioUtils.ts         ← UPDATE: preprocessing utilities
│   └── localStorage.ts       ← NEW: client-side cache for offline corrections
│
├── docs/
│   ├── RESEARCH_FINDINGS.md  ← EXISTS: research document
│   └── IMPLEMENTATION_PLAN.md ← THIS FILE
│
├── gemini_docs.md            ← Reference: full Gemini API docs
└── .env                      ← UPDATE: add MONGODB_URI
```

---

## Backend API Endpoints

| Method | Path | Purpose | Auth |
|--------|------|---------|------|
| POST | `/api/auth/register` | Create user account (name + PIN) | None |
| POST | `/api/auth/login` | Login with PIN, returns userId token | None |
| GET | `/api/profile/:userId` | Get user profile + context document | Required |
| PUT | `/api/profile/:userId` | Update context document | Required |
| POST | `/api/transcribe` | Two-stage speech transcription pipeline | Required |
| POST | `/api/chat` | Voice chat — transcribe + AI reply + TTS | Required |
| POST | `/api/tts` | Text-to-speech (existing, unchanged) | None |
| POST | `/api/calibrate` | Store correction pair from enrollment | Required |
| GET | `/api/corrections/:userId` | Get user's correction pairs (for few-shot) | Required |
| POST | `/api/audio-sample` | Store audio recording for training data | Required |

---

## Execution Order

### Sprint 1: Foundation (Do First)
1. `npm install mongodb bcryptjs` — add dependencies
2. MongoDB connection setup in `server.js`
3. User auth endpoints (`/api/auth/register`, `/api/auth/login`)
4. **Transcription pipeline overhaul** — system instruction, structured output, two-stage
5. Update `types.ts` with new interfaces
6. Update `geminiService.ts` for new response format

### Sprint 2: Core Features
7. Rolling conversation context in `App.tsx`
8. Audio preprocessing in `useAudioRecorder.ts`
9. Tap-to-correct `WordPills.tsx` component
10. Correction storage endpoints + MongoDB integration
11. Few-shot injection from stored corrections
12. Visual step toggle + `StepBubbles.tsx`

### Sprint 3: Chat & Enrollment
13. Chat AI endpoint (`/api/chat`)
14. `ChatView.tsx` with voice-in, auto-TTS-out
15. Context document system (MongoDB profiles)
16. `CalibrationView.tsx` with guided prompts
17. `ProfileView.tsx` — family can edit context doc
18. `LoginView.tsx` + `useAuth.ts`

### Sprint 4: Polish
19. Mode selector (Transcribe / Chat / Calibrate tabs)
20. Loading state improvements (simple vs detailed toggle)
21. Gujarati phrase prompts for calibration
22. Auto-play TTS toggle
23. Mobile/iPad responsive polish
24. Error handling & offline fallbacks

---

## Key Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Model for transcription | `gemini-3-flash-preview` | Fast, accurate, structured output support |
| Model for chat | `gemini-3-flash-preview` | Same model, consistent behavior |
| Model for TTS | `gemini-2.5-flash-preview-tts` | Current setup works well |
| Thinking level (Stage 1) | `low` | Fast transcription, minimal reasoning needed |
| Thinking level (Stage 2) | `medium` | Deeper reasoning for ambiguous cases |
| Thinking level (Chat) | `low` | Conversational, don't need deep reasoning |
| Temperature | `1.0` | REQUIRED for Gemini 3 — deviating causes issues |
| Auth method | 4-digit PIN | Simple enough for stroke patient to use |
| Data storage | MongoDB | Persists across devices, shared family access |
| Client cache | localStorage | Offline fallback for corrections |
| Audio format | webm (default MediaRecorder) | Supported by Gemini, no transcoding needed |
| Implicit caching | Automatic | System instruction > 1024 tokens → free cache on Gemini 3 Flash |

---

## Research References

Full citations in [docs/RESEARCH_FINDINGS.md](./RESEARCH_FINDINGS.md). Key papers driving this design:

- **[S11]** LLM Judge-Editor: 14.51% WER reduction (ICASSP 2026)
- **[S12]** Verbatim prompts degrade Gemini — must use intent-based framing
- **[S15]** Confidence-guided correction: 47% WER reduction on TORGO
- **[S17]** Three-stage RLLM-CF prevents hallucination in correction
- **[S19]** Same-speaker examples: 40% WER reduction, even random recordings help
- **[S4]** Gemini 3: XML tags, few-shot, temperature 1.0, system instructions
- **[S1]** Gemini Audio: 32 tokens/sec, 16 Kbps downsampling, structured output example
