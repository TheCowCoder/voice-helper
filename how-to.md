# Voice Helper 2.0 — Technical How-To Guide

Complete usage guide for every feature in Voice Helper 2.0.

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [User Accounts & Authentication](#2-user-accounts--authentication)
3. [Transcription Mode](#3-transcription-mode)
4. [Chat AI Mode](#4-chat-ai-mode)
5. [Calibration Mode](#5-calibration-mode)
6. [Visual Step-by-Step Display](#6-visual-step-by-step-display)
7. [Profile & Context Document](#7-profile--context-document)
8. [Audio Preprocessing Pipeline](#8-audio-preprocessing-pipeline)
9. [Backend API Reference](#9-backend-api-reference)
10. [MongoDB Collections & Schema](#10-mongodb-collections--schema)
11. [Frontend Architecture](#11-frontend-architecture)
12. [Configuration & Environment](#12-configuration--environment)

---

## 1. Getting Started

### Prerequisites

- Node.js 18+
- MongoDB instance (local or Atlas)
- Google Gemini API key

### Environment Variables

Create a `.env` file in the project root:

```env
API_KEY=your_gemini_api_key
MONGODB_URI=mongodb://localhost:27017
PORT=7860
```

### Install & Run

```bash
npm install                # installs mongodb, bcryptjs, and all deps
npm run dev                # starts Vite dev server (frontend) on :5173
node server.js             # starts Express backend on :7860
```

### Production Build

```bash
npx vite build             # outputs to dist/
node server.js             # serves dist/ + API on :7860
```

---

## 2. User Accounts & Authentication

### How It Works

Voice Helper uses simple PIN-based authentication. No passwords or email required — designed for accessibility.

### Creating an Account

1. Open the app — you'll see the **Login screen**
2. Click **"New user? Create account"** at the bottom
3. Enter a **name** (e.g., "Satish Bhatt")
4. Enter a **4-digit PIN** (digits only, exactly 4)
5. Click **Create Account**

What happens behind the scenes:
- PIN is hashed with bcrypt (cost factor 10) and stored in MongoDB
- A default **context document** is created for the user (Markdown template with family info, interests, health notes sections)
- A **profile** record is created with `correctionCount: 0`

### Logging In

1. Enter your **name** (exact match, case-sensitive)
2. Enter your **4-digit PIN**
3. Click **Sign In**

The session is stored in `localStorage` under `voicehelper_user`. On page reload, the app auto-restores the session without requiring re-login.

### Logging Out

1. Click the **Profile** icon (person icon in the mode selector bar)
2. Click **Sign Out** (red button, top right)

This clears the `localStorage` session.

### Roles

| Role | Capabilities |
|------|--------------|
| `user` | Use all modes (transcribe, chat, calibrate), view own profile |
| `admin` | Same as user — intended for family members who edit the context document |

Roles are set at registration time (defaults to `user`).

---

## 3. Transcription Mode

### Overview

The default mode. Converts speech to text using a research-backed **two-stage pipeline** optimized for dysarthric speech.

### How to Use

1. Make sure you're on the **Transcribe** tab (microphone icon in the mode selector)
2. Press the large blue **Record** button
3. Speak your message
4. Press the red **Stop** button
5. Wait for processing (visual steps show progress)
6. Review the transcription — tap words to correct them
7. Press **Play Voice** to hear the transcription spoken aloud via TTS
8. Press **New** to reset and start over

### Two-Stage Transcription Pipeline

**Stage 1 — Fast Interpretation** (`thinkingLevel: 'low'`)
- Sends audio to `gemini-3-flash-preview` with the SLP persona system instruction
- Uses structured JSON output with `responseMimeType: 'application/json'`
- Returns: phonetic transcription, primary interpretation, confidence score, language, alternatives, emotion

**Stage 2 — Deep Refinement** (`thinkingLevel: 'medium'`)
- Triggered automatically when Stage 1 confidence < 0.7
- Re-analyzes with deeper reasoning, considering correction history and context
- Produces an improved interpretation

Both stages use:
- Model: `gemini-3-flash-preview`
- Temperature: `1.0` (required for Gemini 3)
- Structured JSON output via `responseSchema`

### Structured Output Fields

| Field | Type | Description |
|-------|------|-------------|
| `phonetic_transcription` | string | What the audio literally sounds like |
| `primary_transcription` | string | Best interpretation of intended meaning |
| `confidence` | number (0–1) | Model's confidence in the interpretation |
| `language_detected` | enum: `english`, `gujarati`, `mixed` | Primary language detected |
| `alternative_interpretations` | string[] | Other possible meanings, ranked |
| `detected_emotion` | enum: `happy`, `sad`, `frustrated`, `neutral`, `urgent` | Emotional state from speech prosody |

### Rolling Context

The app maintains a **rolling window of the last 5 confirmed transcriptions** in `localStorage`. These are injected into every transcription request as `<recent_context>` XML tags, giving Gemini conversational continuity. This achieves ~40% WER reduction per research [S19].

Example injection:
```xml
<recent_context>
Recent confirmed transcriptions from this speaker (use for continuity):
- "I want water"
- "Call Rupal"
- "What time is it"
</recent_context>
```

### Few-Shot Corrections

When a user has stored corrections (from calibration or tap-to-correct), the last 10 are injected as few-shot examples:

```xml
<few_shot_corrections>
These are known corrections for this speaker. Use them to improve interpretation.
<example>
  <heard>I wan wa er</heard>
  <correct>I want water</correct>
</example>
</few_shot_corrections>
```

### Tap-to-Correct Words (WordPills)

After transcription, each word appears as a tappable "pill" above the text area:
1. Tap any word to edit it
2. Type the correct word
3. Press Enter or tap away to confirm
4. The correction is automatically saved to MongoDB for future few-shot injection

### Alternatives Strip

When details mode is enabled, clickable alternative interpretations appear below the text area. Tap any alternative to replace the current transcription.

### Auto-Correction on Reset

When you press **New** to reset:
- If you edited the transcription text (either via the textarea or WordPills), the app automatically submits a correction pair (`heard` → `correct`) to the server
- This happens silently in the background

---

## 4. Chat AI Mode

### Overview

A voice-based conversational AI that knows the user personally. The AI reads the user's context document, maintains chat history, and responds via TTS.

### How to Use

1. Switch to the **Chat AI** tab (message icon in mode selector)
2. You'll see a welcome message from the AI
3. Press **Hold to Talk** (blue button at bottom)
4. Speak your message
5. Press **Stop** when done
6. Wait while the AI processes:
   - First, your audio is transcribed through the same two-stage pipeline as Transcription Mode
   - Then, the transcription + chat history + your context document are sent to Gemini
7. The AI's response appears as a chat bubble
8. The response is automatically **played aloud via TTS**
9. Continue the conversation by pressing Hold to Talk again

### Chat Pipeline (Detailed)

```
Audio Recording
    ↓
Stage 1: Transcribe via runTranscriptionPipeline()
    (same two-stage pipeline as Feature 1 — confidence scoring, Stage 2 if needed)
    ↓
Transcription text + Chat History + Context Document → Gemini 3 Flash
    ↓
JSON Response: { reply_text, context_updates[], emotion_detected, transcription }
    ↓
├── Display transcription as user bubble
├── Display reply_text as AI bubble
├── Send reply_text to /api/tts → auto-play audio
└── Apply context_updates to user's context document in MongoDB
```

### Context Updates

If the AI learns something new during conversation (e.g., "Oh, you watched the tennis match today!"), it includes that fact in `context_updates[]`. These are automatically appended to the user's context document under `## AI-Learned` sections with a date stamp.

### Chat History Persistence

All chat messages are stored in MongoDB under the `chatHistory` collection, indexed by `userId + sessionId`. A new session ID is generated each time you enter Chat mode.

### Easter Egg

If the user asks who made the app, the AI responds: "Your grandson Ian built this for you!"

---

## 5. Calibration Mode

### Overview

A guided enrollment flow that captures the user's speech patterns and builds a personalized correction dictionary. Research shows **40% WER reduction** from same-speaker examples.

### How to Use

1. Switch to the **Calibrate** tab (settings icon in mode selector)
2. You'll see a progress bar (`0/20 phrases`) and a prompt card
3. For each phrase:
   - Read the displayed phrase aloud (e.g., "I want water")
   - Press the **Record** button and speak
   - Press **Stop** when done
   - The app transcribes your speech and shows:
     - **App heard:** what Gemini transcribed
     - **Correct to:** editable field pre-filled with the transcription
   - Fix the "Correct to" field if needed
   - Press **Done** ✓ to save and advance, **Redo** 🔄 to re-record, or **Skip** ▶ to skip

4. After all 20 phrases, you'll see a celebration screen with a count of saved patterns

### The 20 Calibration Phrases

**English — Daily Needs (1–10):**
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

**English — Conversational (11–15):**
11. "How is the tennis match"
12. "What is for dinner"
13. "I want to talk to Ian"
14. "Tell me about the weather"
15. "I need my medicine"

**Gujarati — Common (16–20):**
16. "મને પાણી જોઈએ છે" (I want water)
17. "મને ભૂખ લાગી છે" (I am hungry)
18. "હું ઠીક છું" (I am fine)
19. "આવો" (Come here)
20. "શું થયું?" (What happened?)

### What Gets Stored

For each completed phrase:
- **Correction pair** → `corrections` collection: `{ userId, heard, correct, source: "calibration", language, phraseId, timestamp }`
- **Audio sample** → `audioSamples` collection: `{ userId, base64Audio, mimeType, transcript, createdAt }`
- **Correction count** incremented on the user's profile

---

## 6. Visual Step-by-Step Display

### Overview

During transcription processing, the app shows real-time progress. There are two display modes.

### Toggle

Click the **eye icon** button in the header (next to the "New" button) to switch between Simple and Detailed modes.

### Simple Mode (Default)

Shows:
- A spinning circle animation
- A single descriptive text line that updates:
  - "Capturing audio..." → "Preprocessing complete" → "Interpreting speech..." → "Refining interpretation..." → "Done!"
- A progress bar (percentage of steps completed)

Best for: The primary user (Grandpa) — clean, non-distracting.

### Detailed Mode

Shows each processing step as an individual card with status icons:

| Status | Icon | Visual |
|--------|------|--------|
| Pending | ○ (empty circle) | Dimmed, 40% opacity |
| Active | 🔄 (spinning loader) | Blue background, blue border |
| Done | ✅ (green checkmark) | Green tinted background |
| Error | ❌ (red alert) | Red background, red border |

The four steps:
1. **Capturing audio...** — while recording
2. **Preprocessing complete** — after audio processed through Web Audio chain
3. **Interpreting speech...** — during Stage 1 Gemini call; when done, shows: `Phonetic: "I wan wa er"`
4. **Refining interpretation...** — during Stage 2 (if triggered); when done, shows: `Confidence: 85%` or `High confidence — no refinement needed`

Best for: Developer/family to diagnose transcription quality.

---

## 7. Profile & Context Document

### Overview

Each user has a **context document** — a Markdown file stored in MongoDB that the AI uses to understand the user personally. Family members can edit it via the Profile view.

### Accessing the Profile

1. Click the **Profile** icon (person icon) in the mode selector bar
2. You'll see:
   - User's name
   - Total correction count
   - A large text editor with the context document
   - Save Changes button
   - Sign Out button

### Editing the Context Document

The context document is freeform Markdown. The default template has these sections:

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

**What to customize:**
- Fill in the `[age]`, `(date)`, `[city]` placeholders
- Add medication names, doctor names, daily routines in Health Notes
- Add specific vocabulary the user commonly uses
- The AI-Learned Notes section is auto-populated by the Chat AI

### How the Context Document Is Used

1. **Chat AI** loads it as part of the system instruction in `<context_document>` tags
2. **Chat AI** automatically appends new facts it learns to the `## AI-Learned Notes` section
3. Family members can review, edit, or remove auto-learned facts

---

## 8. Audio Preprocessing Pipeline

### Overview

Client-side Web Audio API processing chain optimized for dysarthric speech characteristics.

### Chain

```
getUserMedia (raw audio, no browser processing)
    ↓
AudioContext
    ↓
MediaStreamSource (from mic stream)
    ↓
GainNode (+6dB boost — gain.value = 2.0)
    ↓
DynamicsCompressorNode (threshold: -30dB, ratio: 4, knee: 10)
    ↓
MediaStreamDestination
    ↓
MediaRecorder (webm format)
```

### Settings Rationale

| Setting | Value | Why |
|---------|-------|-----|
| `echoCancellation` | `false` | Gemini handles raw audio better than browser-processed |
| `noiseSuppression` | `false` | Avoid removing speech artifacts that Gemini needs |
| `autoGainControl` | `false` | We apply our own gain tuned for dysarthric speech |
| `gain.value` | `2.0` (~+6dB) | Dysarthric speech is often very quiet |
| `compressor.threshold` | `-30dB` | Catches quiet speech segments |
| `compressor.ratio` | `4` | Gentle enough to not distort, strong enough to normalize |
| `compressor.knee` | `10` | Smooth compression onset |
| `compressor.attack` | `0.003` | Fast attack to catch sudden sounds |
| `compressor.release` | `0.25` | Moderate release for natural sound |

### Resource Cleanup

On recording stop:
1. All mic tracks are stopped (`stream.getTracks().forEach(track => track.stop())`)
2. AudioContext is closed (`audioCtx.close()`)
3. This is critical on iOS — releasing the mic allows the speaker to return to loud "Playback Mode" for TTS

---

## 9. Backend API Reference

All endpoints are served from Express on the configured `PORT` (default 7860).

### Authentication

#### POST `/api/auth/register`

Create a new user account.

**Body:**
```json
{
  "name": "Satish Bhatt",
  "pin": "1234",
  "role": "user"          // optional, defaults to "user"
}
```

**Validation:**
- `name` and `pin` are required
- `pin` must match `/^\d{4}$/` (exactly 4 digits)
- `name` must be unique

**Response (200):**
```json
{
  "_id": "664a1b2c3d4e5f6a7b8c9d0e",
  "name": "Satish Bhatt",
  "role": "user"
}
```

**Side effects:**
- PIN is bcrypt-hashed before storage
- A default profile with context document template is created

---

#### POST `/api/auth/login`

Authenticate with name + PIN.

**Body:**
```json
{
  "name": "Satish Bhatt",
  "pin": "1234"
}
```

**Response (200):**
```json
{
  "_id": "664a1b2c3d4e5f6a7b8c9d0e",
  "name": "Satish Bhatt",
  "role": "user"
}
```

**Side effects:**
- `lastLogin` timestamp is updated on the user record

---

### Profile

#### GET `/api/profile/:userId`

Retrieve a user's profile and context document.

**Response (200):**
```json
{
  "userId": "664a1b2c3d4e5f6a7b8c9d0e",
  "contextDocument": "# About Satish Bhatt\n\n## Personal\n...",
  "correctionCount": 42,
  "updatedAt": "2026-04-09T12:00:00.000Z"
}
```

---

#### PUT `/api/profile/:userId`

Update the context document.

**Body:**
```json
{
  "contextDocument": "# About Satish Bhatt\n\n## Personal\n- Age: 72\n..."
}
```

**Response (200):** `{ "success": true }`

---

### Transcription

#### POST `/api/transcribe`

Two-stage dysarthric speech transcription pipeline.

**Body:**
```json
{
  "base64Audio": "UklGR...",
  "mimeType": "audio/webm",
  "userId": "664a1b2c...",          // optional, enables few-shot corrections
  "recentTranscriptions": [         // optional, rolling context (last 5)
    "I want water",
    "Call Rupal"
  ]
}
```

**Response (200):**
```json
{
  "phonetic_transcription": "I wan wa er",
  "primary_transcription": "I want water",
  "confidence": 0.85,
  "language_detected": "english",
  "alternative_interpretations": ["I want waiter", "I won water"],
  "detected_emotion": "neutral",
  "stage2Used": false
}
```

When `confidence < 0.7`, the pipeline automatically triggers Stage 2 refinement and returns `"stage2Used": true`.

---

### Chat

#### POST `/api/chat`

Voice-based conversational AI. Transcribes audio through the same two-stage pipeline, then generates a conversational response.

**Body:**
```json
{
  "base64Audio": "UklGR...",
  "mimeType": "audio/webm",
  "userId": "664a1b2c...",
  "chatHistory": [
    { "role": "assistant", "text": "Hello! How are you today?" },
    { "role": "user", "text": "I feel good" }
  ],
  "sessionId": "optional-session-uuid"
}
```

**Response (200):**
```json
{
  "reply_text": "That's wonderful to hear! What would you like to talk about?",
  "context_updates": ["User is feeling good today"],
  "emotion_detected": "happy",
  "transcription": "I feel good today"
}
```

**Side effects:**
- If `context_updates` is non-empty, the user's context document is appended with new facts under `## AI-Learned`
- Chat history is persisted to MongoDB under the session ID

---

### Text-to-Speech

#### POST `/api/tts`

Convert text to speech audio using Gemini TTS.

**Body:**
```json
{
  "text": "Hello, how are you today?"
}
```

**Response (200):**
```json
{
  "audioData": "UklGR..."   // base64-encoded PCM audio (24kHz, 16-bit, mono)
}
```

The client wraps this in a WAV header and plays it via `new Audio()`.

**TTS Model:** `gemini-2.5-flash-preview-tts` with voice `Fenrir`.

---

### Calibration

#### POST `/api/calibrate`

Store a calibration correction pair and optional audio sample.

**Body:**
```json
{
  "userId": "664a1b2c...",
  "heard": "I wan wa er",
  "correct": "I want water",
  "phraseId": 1,
  "audioBase64": "UklGR...",           // optional
  "mimeType": "audio/webm",           // optional
  "language": "english"                // optional, defaults to "english"
}
```

**Response (200):** `{ "success": true }`

**Side effects:**
- Correction pair stored in `corrections` collection
- If `audioBase64` provided, stored in `audioSamples` collection
- `correctionCount` incremented on the user's profile

---

### Corrections

#### POST `/api/corrections`

Store a tap-to-correct correction from transcription or chat mode.

**Body:**
```json
{
  "userId": "664a1b2c...",
  "heard": "wa er",
  "correct": "water",
  "source": "transcribe",             // or "chat"
  "language": "english"                // optional
}
```

**Response (200):** `{ "success": true }`

---

#### GET `/api/corrections/:userId`

Retrieve all correction pairs for a user (newest first).

**Response (200):**
```json
[
  {
    "_id": "664a...",
    "userId": "664a1b2c...",
    "heard": "I wan wa er",
    "correct": "I want water",
    "source": "calibration",
    "language": "english",
    "timestamp": "2026-04-09T12:00:00.000Z"
  }
]
```

---

### Audio Samples

#### POST `/api/audio-sample`

Store a standalone audio recording for training data.

**Body:**
```json
{
  "userId": "664a1b2c...",
  "base64Audio": "UklGR...",
  "mimeType": "audio/webm",           // optional, defaults to "audio/webm"
  "transcript": "I want water",       // optional
  "durationMs": 2300                   // optional
}
```

**Response (200):** `{ "success": true }`

---

## 10. MongoDB Collections & Schema

### Connection

The backend connects to `MONGODB_URI` (default: `mongodb://localhost:27017`) and uses the `voicehelper` database.

### Collections

#### `users`

```javascript
{
  _id: ObjectId,
  name: "Satish Bhatt",         // unique index
  pin: "$2a$10$...",            // bcrypt hash of 4-digit PIN
  role: "user" | "admin",
  createdAt: Date,
  lastLogin: Date
}
```

**Index:** `{ name: 1 }` (unique)

---

#### `profiles`

```javascript
{
  _id: ObjectId,
  userId: ObjectId,              // unique index, references users._id
  contextDocument: String,       // Markdown — the AI's knowledge about this user
  correctionCount: Number,       // total corrections stored
  updatedAt: Date
}
```

**Index:** `{ userId: 1 }` (unique)

---

#### `corrections`

```javascript
{
  _id: ObjectId,
  userId: ObjectId,
  heard: "I wan wa er",          // what Gemini initially transcribed
  correct: "I want water",      // user-corrected version
  source: "calibration" | "transcribe" | "chat",
  language: "english" | "gujarati" | "mixed",
  phraseId: Number | null,       // only for calibration corrections
  timestamp: Date
}
```

**Index:** `{ userId: 1 }`

---

#### `chatHistory`

```javascript
{
  _id: ObjectId,
  userId: ObjectId,
  sessionId: String,             // UUID per chat session
  messages: [
    { role: "user", text: "I want water", timestamp: Number },
    { role: "assistant", text: "Of course! ...", timestamp: Number }
  ],
  createdAt: Date
}
```

**Index:** `{ userId: 1, sessionId: 1 }` (compound)

---

#### `audioSamples`

```javascript
{
  _id: ObjectId,
  userId: ObjectId,
  base64Audio: String,           // raw audio recording
  mimeType: "audio/webm",
  transcript: String,            // final corrected transcript
  durationMs: Number | null,
  createdAt: Date
}
```

**Index:** `{ userId: 1 }`

---

## 11. Frontend Architecture

### Mode Routing

The app has three modes accessed via the `ModeSelector` tab bar:

| Mode | Tab Label | Component | Description |
|------|-----------|-----------|-------------|
| `transcribe` | Transcribe (🎤) | Inline in `App.tsx` | Speech-to-text with two-stage pipeline |
| `chat` | Chat AI (💬) | `ChatView.tsx` | Voice conversation with personal AI |
| `calibrate` | Calibrate (⚙️) | `CalibrationView.tsx` | Guided speech enrollment |

Profile and Login are overlay views that replace the main content.

### Component Map

| Component | File | Purpose |
|-----------|------|---------|
| `LoginView` | `components/LoginView.tsx` | PIN-based auth (login/register toggle) |
| `ModeSelector` | `components/ModeSelector.tsx` | Tab bar for mode switching + profile access |
| `RecordButton` | `components/RecordButton.tsx` | Large circular record/stop button |
| `TranscriptionDisplay` | `components/TranscriptionDisplay.tsx` | Text area + WordPills + alternatives + badges |
| `WordPills` | `components/WordPills.tsx` | Tappable word correction UI |
| `StepBubbles` | `components/StepBubbles.tsx` | Processing steps (simple/detailed modes) |
| `ChatView` | `components/ChatView.tsx` | Chat bubbles + voice record input + auto-TTS |
| `CalibrationView` | `components/CalibrationView.tsx` | 20-phrase guided enrollment flow |
| `ProfileView` | `components/ProfileView.tsx` | Context document editor + logout |

### Hooks

| Hook | File | Purpose |
|------|------|---------|
| `useAudioRecorder` | `hooks/useAudioRecorder.ts` | Web Audio preprocessing chain + MediaRecorder |
| `useAuth` | `hooks/useAuth.ts` | Auth state, localStorage persistence, auto-restore |

### Services

| Service | File | Purpose |
|---------|------|---------|
| `geminiService` | `services/geminiService.ts` | API calls: transcribe, chat, TTS, calibrate, corrections |
| `authService` | `services/authService.ts` | API calls: login, register |
| `profileService` | `services/profileService.ts` | API calls: getProfile, updateProfile |

### Utilities

| Utility | File | Purpose |
|---------|------|---------|
| `localStore` | `utils/localStorage.ts` | Rolling context (last 5 transcriptions), pending corrections |
| `audioUtils` | `utils/audioUtils.ts` | `blobToBase64`, `playAudioFromBase64` (with WAV header construction) |

### State Flow (Transcribe Mode)

```
IDLE → (press record) → RECORDING → (press stop) → TRANSCRIBING → REVIEW
                                                          ↓
                                                   (press New) → IDLE
```

During `TRANSCRIBING`, StepBubbles render with real-time status updates.
During `REVIEW`, TranscriptionDisplay renders with WordPills and Play Voice button.

---

## 12. Configuration & Environment

### Gemini Models Used

| Purpose | Model | Thinking Level |
|---------|-------|----------------|
| Transcription Stage 1 | `gemini-3-flash-preview` | `low` |
| Transcription Stage 2 | `gemini-3-flash-preview` | `medium` |
| Chat AI | `gemini-3-flash-preview` | `low` |
| Text-to-Speech | `gemini-2.5-flash-preview-tts` | N/A |

All generative calls use `temperature: 1.0` (required for Gemini 3).

### Implicit Caching

The system instruction for transcription is >1024 tokens, so Gemini 3 Flash automatically caches it. This means:
- First call: full latency + caches system instruction
- Subsequent calls: reduced latency + cached system instruction (free)

### Request Size Limit

Express is configured with `express.json({ limit: '50mb' })` to accommodate base64-encoded audio in request bodies.

### TTS Audio Format

Gemini TTS returns raw PCM audio (24kHz, 16-bit, mono). The client wraps it in a WAV header before playback. The voice used is `Fenrir`.

### Offline Fallback

The `localStore` utility maintains a client-side cache of:
- **Recent transcriptions** (last 5) — for rolling context
- **Pending corrections** — corrections made while offline that can be synced later

These use `localStorage` and survive page reloads but not browser data clears.
