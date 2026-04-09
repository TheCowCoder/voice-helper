# Voice Helper: Research Findings — Optimizing Transcription for Impaired Speech

**Date:** April 9, 2026  
**Scope:** 36 academic papers, 7 API documentation pages, 3 MDN references, 3 commercial products, 2 arxiv search catalogs  
**Goal:** Make Voice Helper's transcription of vocally impaired speech dramatically better

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Source Catalog (36 Sources)](#source-catalog)
3. [Finding 1: Two-Stage ASR + LLM Correction](#finding-1-two-stage-asr--llm-correction)
4. [Finding 2: Prompt Engineering is Model-Specific](#finding-2-prompt-engineering-is-model-specific)
5. [Finding 3: Structured Output Unlocks Confidence & Alternatives](#finding-3-structured-output-unlocks-confidence--alternatives)
6. [Finding 4: Speaker Personalization Yields 40% WER Reduction](#finding-4-speaker-personalization-yields-40-wer-reduction)
7. [Finding 5: Audio Preprocessing — Compression & Normalization](#finding-5-audio-preprocessing--compression--normalization)
8. [Finding 6: Semantic Fidelity > Exact Word Accuracy](#finding-6-semantic-fidelity--exact-word-accuracy)
9. [Finding 7: Gemini API Technical Constraints & Opportunities](#finding-7-gemini-api-technical-constraints--opportunities)
10. [Current Architecture Gap Analysis](#current-architecture-gap-analysis)
11. [Open Questions](#open-questions)

---

## Executive Summary

Standard ASR achieves <5% WER on typical speech but degrades to **>49% WER on severe dysarthria** across ALL commercial systems, including Gemini and GPT-4o [S12]. The current Voice Helper uses a single zero-shot prompt with no preprocessing, no structured output, no correction layer, and no personalization — all of which are validated improvement paths in the literature.

**The three highest-ROI changes, ranked by evidence strength:**

1. **Prompt Engineering Overhaul** — Zero infrastructure cost. Few-shot > zero-shot consistently [S4]. System instructions with expert persona. XML-tagged structure for Gemini 3. **WARNING:** Prompts that help GPT-4o hurt Gemini [S12]. Must test empirically.

2. **Structured JSON Output with Confidence Scoring** — Gemini API natively supports JSON schemas for audio transcription [S1, S3]. Enables confidence-aware correction and alternative display.

3. **Two-Stage Correction Pipeline** (Acoustic → Semantic) — 14–47% WER reductions across 6+ papers [S11, S13, S15, S16, S17]. Chain-of-thought sub-tasks prevent hallucination during correction [S17].

---

## Source Catalog

### Academic Papers — Dysarthric ASR + LLM Correction

| # | Title | Authors | Year | Venue | ArXiv |
|---|-------|---------|------|-------|-------|
| S11 | Towards Robust Dysarthric Speech Recognition: LLM-Agent Post-ASR Correction Beyond WER | Zheng, Dong, Phukon, Hasegawa-Johnson, Yoo | 2026 | ICASSP 2026 | [2601.21347](https://arxiv.org/abs/2601.21347) |
| S12 | Zero-Shot Recognition of Dysarthric Speech Using Commercial ASR and MLLMs | Alsayegh, Masood | 2025 | Preprint | [2512.17474](https://arxiv.org/abs/2512.17474) |
| S13 | Exploring Generative Error Correction for Dysarthric Speech Recognition | La Quatra, Koudounas, Salerno, Siniscalchi | 2025 | Interspeech 2025 | [2505.20163](https://arxiv.org/abs/2505.20163) |
| S14 | Bridging ASR and LLMs for Dysarthric Speech Recognition | Aboeitta, Sharshar, Nafea, Shehata | 2025 | Preprint | [2508.08027](https://arxiv.org/abs/2508.08027) |
| S15 | Confidence-Guided Error Correction for Disordered Speech Recognition | Hernandez, Arias Vergara, Maier, Pérez-Toro | 2025 | ICASSP Submission | [2509.25048](https://arxiv.org/abs/2509.25048) |
| S16 | HyPoradise: An Open Baseline for Generative Speech Recognition with LLMs | Chen et al. | 2023 | NeurIPS 2023 | [2309.15701](https://arxiv.org/abs/2309.15701) |
| S17 | Fewer Hallucinations, More Verification: Three-Stage LLM-Based ASR Error Correction | Fang, Chen, Peng et al. | 2025 | ASRU | [2505.24347](https://arxiv.org/abs/2505.24347) |
| S18 | Enhancing AAC Software for Dysarthric Speakers: Evaluation Using TORGO | Hui, Zhang, Mohan | 2024 | Preprint | [2411.00980](https://arxiv.org/abs/2411.00980) |

### Academic Papers — Speaker Adaptation & Personalization

| # | Title | Authors | Year | Venue | ArXiv |
|---|-------|---------|------|-------|-------|
| S19 | The Universal Personalizer: Few-Shot Dysarthric Speech Recognition via Meta-Learning | Agarwal, Zhang, Yu, Wang | 2025 | Preprint | [2509.15516](https://arxiv.org/abs/2509.15516) |
| S20 | Two-Stage Adaptation for Non-Normative Speech Recognition | Jiang, Qi, Huo, Gao, Chen | 2026 | Interspeech 2026 Submission | [2603.15261](https://arxiv.org/abs/2603.15261) |
| S21 | A Self-Training Approach for Whisper to Enhance Long Dysarthric Speech | Wang, Zhou, Zhao, Qin | 2025 | Interspeech 2025 | [2506.22810](https://arxiv.org/abs/2506.22810) |

### Academic Papers — Voice Conversion & Data Augmentation

| # | Title | Authors | Year | Venue | ArXiv |
|---|-------|---------|------|-------|-------|
| S22 | Unsupervised Rhythm and Voice Conversion to Improve ASR on Dysarthric Speech | El Hajal, Hermann, Hovsepyan, Magimai-Doss | 2025 | Interspeech 2025 | [2506.01618](https://arxiv.org/abs/2506.01618) |
| S31 | Personalized Fine-Tuning with Controllable Synthetic Speech from LLM-Generated Transcripts | Wagner et al. | 2025 | Interspeech 2025 | [2505.12991](https://arxiv.org/abs/2505.12991) |
| S32 | Improved Dysarthric STT via TTS Personalization | Mihajlik et al. | 2025 | Preprint | [2508.06391](https://arxiv.org/abs/2508.06391) |
| S36 | DARS: Dysarthria-Aware Rhythm-Style Synthesis for ASR Enhancement | Wu et al. | 2026 | APSIPA ASC 2025 | [2603.01369](https://arxiv.org/abs/2603.01369) |

### Academic Papers — Analysis & Benchmarks

| # | Title | Authors | Year | Venue | ArXiv |
|---|-------|---------|------|-------|-------|
| S23 | Probing Whisper for Dysarthric Speech in Detection and Assessment | Yue, Kayande, Cvetkovic, Loweimi | 2025 | ICASSP 2026 Submission | [2510.04219](https://arxiv.org/abs/2510.04219) |
| S24 | Robust Speech Recognition via Large-Scale Weak Supervision (Whisper) | Radford, Kim, Xu et al. | 2022 | OpenAI Technical Report | [2212.04356](https://arxiv.org/abs/2212.04356) |
| S30 | Idiosyncratic Versus Normative Modeling of Atypical Speech Recognition | Raja, Ganesan et al. | 2025 | EMNLP 2025 | [2509.16718](https://arxiv.org/abs/2509.16718) |
| S33 | RAG + Adaptive CoT for ASR Named Entity Correction | An et al. | 2026 | Preprint | [2602.12287](https://arxiv.org/abs/2602.12287) |
| S34 | Aligning ASR Evaluation with Human and LLM Judgments: Intelligibility Metrics | Phukon, Zheng, Hasegawa-Johnson | 2025 | Interspeech 2025 | [2506.16528](https://arxiv.org/abs/2506.16528) |
| S35 | On-the-fly Routing for Zero-shot MoE Speaker Adaptation | Hu et al. | 2025 | Interspeech 2025 | [2505.22072](https://arxiv.org/abs/2505.22072) |

### API Documentation

| # | Title | URL |
|---|-------|-----|
| S1 | Gemini Audio Understanding API | [ai.google.dev/gemini-api/docs/audio](https://ai.google.dev/gemini-api/docs/audio) |
| S2 | Gemini Thinking Mode | [ai.google.dev/gemini-api/docs/thinking](https://ai.google.dev/gemini-api/docs/thinking) |
| S3 | Gemini Structured Output / JSON Mode | [ai.google.dev/gemini-api/docs/structured-output](https://ai.google.dev/gemini-api/docs/structured-output) |
| S4 | Gemini Prompting Strategies | [ai.google.dev/gemini-api/docs/prompting-strategies](https://ai.google.dev/gemini-api/docs/prompting-strategies) |
| S5 | Gemini System Instructions / Text Generation | [ai.google.dev/gemini-api/docs/text-generation](https://ai.google.dev/gemini-api/docs/text-generation) |
| S6 | Vertex AI Audio Understanding | [docs.cloud.google.com/vertex-ai/generative-ai/docs/multimodal/audio-understanding](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/multimodal/audio-understanding) |
| S7 | Cloud Speech-to-Text Enhanced Models | [docs.cloud.google.com/speech-to-text/docs/enhanced-models](https://docs.cloud.google.com/speech-to-text/docs/enhanced-models) |

### Web Audio API References

| # | Title | URL |
|---|-------|-----|
| S8 | MDN Web Audio API | [developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) |
| S9 | MDN DynamicsCompressorNode | [developer.mozilla.org/en-US/docs/Web/API/DynamicsCompressorNode](https://developer.mozilla.org/en-US/docs/Web/API/DynamicsCompressorNode) |
| S10 | MDN AnalyserNode | [developer.mozilla.org/en-US/docs/Web/API/AnalyserNode](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode) |

### Commercial Products & Open Source

| # | Title | URL |
|---|-------|-----|
| S25 | Voiceitt — Atypical Speech Recognition App | [voiceitt.com](https://voiceitt.com) |
| S26 | Apple Accessibility — Speech Features | [apple.com/accessibility/speech](https://www.apple.com/accessibility/speech/) |
| S27 | OpenAI Whisper Repository | [github.com/openai/whisper](https://github.com/openai/whisper) |

### Discovery Catalogs

| # | Title | Papers Indexed |
|---|-------|---------------|
| S28 | Arxiv Search: "dysarthric speech recognition" | 89 papers |
| S29 | Arxiv Search: "LLM ASR error correction" | 68 papers |

---

## Finding 1: Two-Stage ASR + LLM Correction

**The dominant pattern in 2024–2026 literature.** Instead of asking one model to perfectly transcribe impaired speech in a single pass, separate *acoustic decoding* from *semantic correction*.

### Evidence

- **[S11]** LLM Judge-Editor agent over top-k ASR hypotheses: keeps high-confidence spans, rewrites uncertain segments. **14.51% WER reduction** + semantic gains (+7.59pp MENLI, +7.66pp Slot Micro F1). Released SAP-Hypo5 benchmark.
- **[S13]** Two-stage ASR + Generative Error Correction (GER) shows complementary roles of acoustic and linguistic modeling. Effective on structured and spontaneous speech.
- **[S15]** Word-level confidence scores embedded into LLM prompts for correction. **47% WER reduction on TORGO** vs naive LLM correction. Confidence-aware approach prevents overcorrecting already-correct words.
- **[S16]** HyPoradise (NeurIPS 2023): N-best hypothesis input to LLM. LLM can **recover tokens missing from ALL N-best candidates** — not just selecting but generating novel corrections. 334K+ hypothesis-transcription pairs dataset.
- **[S17]** Three-stage RLLM-CF: (1) error pre-detection, (2) chain-of-thought iterative correction, (3) reasoning verification. **No fine-tuning required.** 21% relative CER reduction on AISHELL. Prevents hallucination — critical for assistive use.
- **[S14]** LLM-enhanced decoding (BART, GPT-2, Vicuna) improves dysarthric ASR by leveraging linguistic constraints for phoneme restoration and grammatical correction.

### Applicability to Voice Helper

**HIGH.** Current architecture is single-pass zero-shot. Implementation path:
1. First Gemini call: get raw transcription + thinking-level analysis of the audio
2. Second Gemini call: semantic correction with chain-of-thought, using the raw transcript + conversation context
3. Use structured output to request confidence scores, guiding which words need correction

---

## Finding 2: Prompt Engineering is Model-Specific

**What works for GPT-4o actively hurts Gemini.**

### Evidence

- **[S12] CRITICAL:** Evaluated 8 systems on TORGO dataset. Verbatim-transcription prompts: GPT-4o achieves **-7.36pp WER reduction**; Gemini variants **DEGRADE** with the same prompt. This means the current Voice Helper prompt (which is a verbatim transcription instruction) may actually be making Gemini perform worse.
- **[S4]** Gemini 3 specific: use XML tags (`<context>`, `<task>`) for structure. Few-shot examples strongly recommended over zero-shot. **Temperature must stay at 1.0** for Gemini 3 models — lowering causes looping/degradation.
- **[S5]** `system_instruction` config field sets persistent expert persona. Available for Gemini 3 Flash Preview.
- **[S2]** `thinkingLevel` supports: minimal, low, medium, high. Current app uses no thinking config (defaults to "high" for Gemini 3 Flash). For transcription tasks (not complex reasoning), `low` or `medium` may be optimal for latency.
- **[S4]** Gemini-specific: "Prioritize critical instructions. Place behavioral constraints, role definitions, and output format in System Instruction or at the very beginning."

### Applicability to Voice Helper

**HIGHEST PRIORITY.** Zero-cost change. The current prompt is a basic verbatim transcription instruction that may be degrading Gemini performance [S12]. Immediate fixes:
1. Add `system_instruction` with speech-language pathologist persona
2. Use XML-tagged prompt structure per Gemini 3 recommendations
3. Add few-shot examples of impaired → intended speech
4. Do NOT use verbatim transcription framing — use intent-interpretation framing instead
5. Set `thinkingLevel: 'low'` for speed on straightforward transcriptions

---

## Finding 3: Structured Output Unlocks Confidence & Alternatives

### Evidence

- **[S1]** Gemini Audio API supports structured output (JSON schema) for audio transcription. Official example shows emotion detection, language identification, and segmented transcription with timestamps — all in one call.
- **[S3]** `response_mime_type: 'application/json'` + `response_json_schema` enforces type-safe output. Supports Zod schemas in JavaScript. Gemini 3 Flash Preview fully supported.
- **[S15]** Confidence scores are critical for directing LLM correction to uncertain regions. Without confidence, naive correction overcorrects correct words.
- **[S3]** Best practice: use `description` field in schema to guide model behavior. Streaming supported for structured outputs.

### Applicability to Voice Helper

**HIGH.** Current `TranscriptionResult` is `{text, isError}` — binary success/fail. New schema should include:
```json
{
  "primary_transcription": "string — best interpretation of the speech",
  "phonetic_transcription": "string — literal sounds heard",
  "confidence": "number 0-1 — how confident the model is",
  "alternative_interpretations": ["string[] — other possible meanings"],
  "detected_emotion": "enum — emotional state from speech"
}
```

---

## Finding 4: Speaker Personalization Yields 40% WER Reduction

### Evidence

- **[S19] KEY FINDING:** Random same-speaker examples yield **40% WER reduction**. Even without careful curation, just providing previous recordings from the same speaker dramatically improves recognition. 13.9% WER on Euphonia (vs 17.5% baseline). Static text curation fails to beat random baseline.
- **[S20]** Two-stage Speaker-Independent → Speaker-Specific adaptation consistently outperforms direct fine-tuning. Tested on both AphasiaBank and UA-Speech — covers both dysarthric AND aphasic speech (matches your grandpa's condition).
- **[S25]** Voiceitt (commercial product): requires 50+ recordings from the user. Proof that personalized training on atypical speech works commercially.
- **[S26]** Apple Personal Voice: creates personalized voice model from ~15 minutes of recordings.
- **[S30]** Both fully personalized (idiosyncratic) and generalizable approaches have merit — hybrid is best.

### Applicability to Voice Helper

**MEDIUM-HIGH (rolling implementation).** Can't fine-tune Gemini, but can emulate:
1. **Rolling context:** Maintain last N successful transcription pairs in conversation history, inject as few-shot examples
2. **Session persistence:** Store confirmed transcriptions across sessions in localStorage
3. **Vocabulary profile:** Build automatic vocabulary list from successful transcriptions
4. **Key insight:** Even RANDOM previous recordings from the same speaker help — no careful curation needed [S19]

---

## Finding 5: Audio Preprocessing — Compression & Normalization

### Evidence

- **[S8–S10]** Web Audio API provides full DSP toolkit in browser:
  - `DynamicsCompressorNode`: normalizes loudness variation (threshold, knee, ratio, attack, release)
  - `GainNode`: volume amplification for quiet speech
  - `BiquadFilterNode`: lowpass/highpass/bandpass filtering
  - `AnalyserNode`: FFT analysis for signal quality detection
  - `AudioWorklet`: custom DSP in separate thread
  - Can chain: `MediaStream → GainNode → DynamicsCompressor → BiquadFilter → MediaRecorder`
- **[S9]** DynamicsCompressorNode default: threshold=-24dB, ratio=12. For speech normalization: threshold=-30dB, ratio=4, knee=10.
- **[S1]** Gemini downsamples to **16 KHz** and **16 Kbps**. Multi-channel audio is mixed to mono. This means high-frequency enhancement above 8 KHz is mathematically wasted.
- **[S22]** Rhythm and prosody normalization helps severe dysarthria. Syllable-based rhythm modeling suited for slow/irregular timing.
- **[S22] CAVEAT:** Fine-tuning Whisper on converted/preprocessed data has minimal effect — large models may already handle these variations internally.

### Applicability to Voice Helper

**MEDIUM.** Unknown whether Gemini's internal pipeline already normalizes loudness. Must A/B test.
However, **loudness consistency** is almost certainly beneficial — dysarthric speakers have dramatic volume variation within a single utterance. Recommended preprocessing chain:
1. `GainNode` — boost weak signals
2. `DynamicsCompressorNode` — normalize loudness peaks/valleys
3. Optionally: `BiquadFilterNode(highpass, 80Hz)` — remove rumble
4. Do NOT over-process — Gemini may handle better from raw audio

---

## Finding 6: Semantic Fidelity > Exact Word Accuracy

### Evidence

- **[S11]** WER is highly sensitive to domain shift. Semantic metrics (MENLI, Slot Micro F1) correlate **more closely with downstream task performance** than WER.
- **[S12]** Communicative intent is partially recoverable despite high WER. Even when individual words are wrong, the intended meaning often comes through.
- **[S34]** Traditional WER/CER fail to capture intelligibility for dysarthric speech. Phonetic, semantic, and NLI approaches needed for meaningful evaluation.
- **[S34]** Proposes aligning evaluation with human and LLM judgments — matching how caregivers actually interpret impaired speech.

### Applicability to Voice Helper

**HIGH for design philosophy.** The goal isn't perfect word-for-word transcription — it's capturing what your grandpa *means*. This validates:
1. The prompt should ask for "intended meaning" not "verbatim transcription"
2. The correction stage should optimize for semantic fidelity
3. User confirmation rate is the real-world success metric
4. The app should present the *interpreted meaning*, not try to reconstruct exact words

---

## Finding 7: Gemini API Technical Constraints & Opportunities

### Evidence

- **[S1]** Audio tokenized at **32 tokens/second**. Downsampled to 16 KHz. Supports WAV, MP3, FLAC, OGG, WebM. Max ~9.5 hours per prompt. Files API recommended for >20MB.
- **[S2]** Gemini 3 Flash thinking levels: `minimal` (near-zero thinking), `low`, `medium`, `high` (default, dynamic). Cannot fully disable thinking on Gemini 3.
- **[S3]** Structured output + tools (Google Search, URL Context) can be combined in Gemini 3 — could ground corrections with lookup.
- **[S4]** Gemini 3: XML tags for structure, explicit planning instructions, self-critique pattern. **Temperature MUST be 1.0** — lowering causes looping.
- **[S5]** `system_instruction` sets persistent persona across turns. JavaScript SDK: `config: { system_instruction: "..." }`.
- **[S1]** Official transcription example uses structured output with segments, timestamps, language detection, and emotion — all from audio input.

### Key API Configuration for Voice Helper

```javascript
// Optimal Gemini 3 Flash configuration for impaired speech transcription
config: {
  system_instruction: "You are an expert speech-language pathologist...",
  temperature: 1.0,  // MUST stay at 1.0 for Gemini 3
  thinking_config: { thinking_level: 'low' },  // Fast for transcription
  response_mime_type: 'application/json',
  response_json_schema: { /* structured schema */ },
  tools: [],
}
```

---

## Current Architecture Gap Analysis

| Feature | Current State | Research Recommendation | Impact |
|---------|--------------|------------------------|--------|
| Prompt | Zero-shot verbatim instruction | Few-shot, XML-tagged, intent-based, system_instruction persona | **CRITICAL** — current prompt may degrade Gemini [S12] |
| Output format | Free-form text | Structured JSON with confidence, alternatives, phonetic | **HIGH** — enables correction pipeline |
| Correction layer | None | Two-stage with CoT reasoning | **HIGH** — 14-47% WER reduction [S11,S15] |
| Audio preprocessing | Raw MediaRecorder → base64 | GainNode + DynamicsCompressor chain | **MEDIUM** — needs A/B testing |
| Personalization | None (stateless) | Rolling conversation context + few-shot injection | **HIGH** — 40% WER reduction [S19] |
| Temperature | 1.0 (correct!) | 1.0 (confirmed for Gemini 3) | ✅ Already correct |
| Thinking config | Not set (defaults to high) | `thinkingLevel: 'low'` for speed | **MEDIUM** — latency improvement |
| Confidence scoring | Binary isError | 0-1 confidence + alternatives | **HIGH** — enables smart UI feedback |

---

## Open Questions

1. **Does client-side audio preprocessing help or hurt Gemini?** Gemini downsamples to 16KHz internally. Unknown whether its preprocessing already normalizes loudness. Must A/B test.

2. **Can Gemini generate multiple transcription hypotheses in one call?** The two-stage pattern needs N-best hypotheses. May need to request `alternative_interpretations[]` in structured output schema, or make multiple calls with varied prompts.

3. **What is the optimal Gemini 3-specific prompt for dysarthric speech?** [S12] showed model-specific effects. Must test empirically with actual recordings from your grandpa.

4. **How should rolling context be persisted?** localStorage for cross-session persistence vs. in-memory for single-session. Token budget considerations for context window.
