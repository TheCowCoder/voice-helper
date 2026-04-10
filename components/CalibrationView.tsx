import React, { useState, useCallback, useEffect } from 'react';
import { Mic, Square, Check, RotateCcw, SkipForward, Loader2 } from 'lucide-react';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { geminiService } from '../services/geminiService';
import { blobToBase64 } from '../utils/audioUtils';
import { CalibrationPhrase, TranscriptionStep, TranscriptionMode } from '../types';
import { StepBubbles } from './StepBubbles';

const PHRASES: CalibrationPhrase[] = [
  { id: 1, text: "I want water", language: 'english' },
  { id: 2, text: "I am hungry", language: 'english' },
  { id: 3, text: "I need help", language: 'english' },
  { id: 4, text: "Turn on the TV", language: 'english' },
  { id: 5, text: "Call Rupal", language: 'english' },
  { id: 6, text: "I want to go outside", language: 'english' },
  { id: 7, text: "What time is it", language: 'english' },
  { id: 8, text: "I feel good today", language: 'english' },
  { id: 9, text: "My head hurts", language: 'english' },
  { id: 10, text: "Thank you", language: 'english' },
  { id: 11, text: "How is the tennis match", language: 'english' },
  { id: 12, text: "What is for dinner", language: 'english' },
  { id: 13, text: "I want to talk to Ian", language: 'english' },
  { id: 14, text: "Tell me about the weather", language: 'english' },
  { id: 15, text: "I need my medicine", language: 'english' },
  { id: 16, text: "મને પાણી જોઈએ છે", language: 'gujarati', translation: "I want water" },
  { id: 17, text: "મને ભૂખ લાગી છે", language: 'gujarati', translation: "I am hungry" },
  { id: 18, text: "હું ઠીક છું", language: 'gujarati', translation: "I am fine" },
  { id: 19, text: "આવો", language: 'gujarati', translation: "Come here" },
  { id: 20, text: "શું થયું?", language: 'gujarati', translation: "What happened?" },
];

const ROUND_SIZE = 20;

// Friendly round labels
function getRoundLabel(round: number): { title: string; subtitle: string } {
  const labels = [
    { title: 'Getting Started', subtitle: 'Let\'s teach the app your voice!' },
    { title: 'Building Momentum', subtitle: 'Great progress — keep going!' },
    { title: 'Voice Expert', subtitle: 'The app is really learning your patterns now.' },
    { title: 'Fine Tuning', subtitle: 'Almost perfect recognition ahead.' },
    { title: 'Master Level', subtitle: 'You\'re a pro. Every round makes it sharper.' },
  ];
  return labels[Math.min(round, labels.length - 1)];
}

interface CalibrationViewProps {
  userId: string;
  onClose: () => void;
  transcriptionMode?: TranscriptionMode;
}

export const CalibrationView: React.FC<CalibrationViewProps> = ({ userId, onClose, transcriptionMode }) => {
  const [loading, setLoading] = useState(true);
  const [totalCompleted, setTotalCompleted] = useState(0);
  const [completedIds, setCompletedIds] = useState<Set<number>>(new Set());
  const [roundIndex, setRoundIndex] = useState(0); // index within current round (0-19)
  const [activePhrases, setActivePhrases] = useState<CalibrationPhrase[]>(PHRASES);
  const [heard, setHeard] = useState('');
  const [steps, setSteps] = useState<TranscriptionStep[]>([]);
  const [lastAudioBase64, setLastAudioBase64] = useState('');
  const [lastMimeType, setLastMimeType] = useState('');
  const [lastTranscriptionLog, setLastTranscriptionLog] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [roundComplete, setRoundComplete] = useState(false);
  const { isRecording, startRecording, stopRecording } = useAudioRecorder();

  const currentRoundIndex = Math.floor(totalCompleted / ROUND_SIZE);
  const roundProgress = roundIndex; // phrases done in this sitting
  const roundLabel = getRoundLabel(currentRoundIndex);
  const phrase = activePhrases[roundIndex] || PHRASES[0];
  const isDeepMode = transcriptionMode === 'deep';

  // Load progress from server on mount
  useEffect(() => {
    geminiService.getTrainingProgress(userId).then(async (progress) => {
      const completed = progress.phrasesCompleted || 0;
      setTotalCompleted(completed);
      setCompletedIds(new Set(progress.completedPhraseIds || []));
      setRoundIndex(0);

      // Round 2+ (index >= 1): generate AI phrases
      const nextRoundIndex = Math.floor(completed / ROUND_SIZE);
      if (nextRoundIndex >= 1) {
        try {
          const aiPhrases = await geminiService.generatePhrases(userId, nextRoundIndex + 1);
          if (aiPhrases && aiPhrases.length > 0) {
            setActivePhrases(aiPhrases);
          }
        } catch (err) {
          console.error('Failed to generate AI phrases, using defaults:', err);
        }
      }

      setLoading(false);
    }).catch(err => {
      console.error('Failed to load training progress:', err);
      setLoading(false);
    });
  }, [userId]);

  const initSteps = useCallback(() => {
    const nextSteps: TranscriptionStep[] = [
      { id: 'preprocess', label: 'Audio Preprocessing', status: 'pending', detail: 'Gain boost + dynamic compression via Web Audio' },
      { id: 'stage1', label: isDeepMode ? 'Stage 1: Acoustic Transcription' : 'Fast Transcription', status: 'pending', detail: isDeepMode ? 'Gemini 3.1 — strong phonetic first pass' : 'Gemini 3.1 single-pass phonetic + meaning decode' },
    ];
    if (isDeepMode) {
      nextSteps.push({ id: 'refine', label: 'Stage 2: Semantic Refinement', status: 'pending', detail: 'Deep reasoning pass for best interpretation' });
    }
    setSteps(nextSteps);
  }, [isDeepMode]);

  const updateStep = useCallback((id: string, status: TranscriptionStep['status'], detail?: string) => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, status, ...(detail !== undefined ? { detail } : {}) } : s));
  }, []);

  const handleRecord = async () => {
    if (isRecording) {
      // Stop recording — start pipeline
      initSteps();
      updateStep('preprocess', 'active');
      setIsProcessing(true);

      const blob = await stopRecording();
      if (!blob) { setIsProcessing(false); setSteps([]); return; }

      updateStep('preprocess', 'done', `Preprocessed ${(blob.size / 1024).toFixed(0)}KB ${blob.type}`);
      updateStep('stage1', 'active');

      try {
        const signal = geminiService.createAbortSignal();
        const base64Audio = await blobToBase64(blob);
        setLastAudioBase64(base64Audio);
        setLastMimeType(blob.type);

        const stage1 = await geminiService.transcribeStage1(base64Audio, blob.type, userId, undefined, transcriptionMode, signal);

        updateStep('stage1', 'done', `Phonetic: "${stage1.phonetic_transcription}" — ${Math.round(stage1.confidence * 100)}% confidence`);

        if (isDeepMode) {
          updateStep('refine', 'active', 'Deep reasoning refinement in progress...');

          const result = await geminiService.transcribeStage2(base64Audio, blob.type, stage1, userId, undefined, transcriptionMode, signal);

          updateStep('refine', 'done', result.structured
            ? `Refined to ${Math.round(result.structured.confidence * 100)}% confidence via deep reasoning`
            : undefined);

          setHeard(result.text);
          setLastTranscriptionLog({
            phonetic: stage1.phonetic_transcription || undefined,
            stage1Thinking: (stage1 as any)._thinking || undefined,
            stage2Thinking: (result as any)._thinking || undefined,
            alternatives: stage1.alternative_interpretations || undefined,
            confidence: result.structured?.confidence ?? stage1.confidence,
          });
        } else {
          setHeard(stage1.primary_transcription);
          setLastTranscriptionLog({
            phonetic: stage1.phonetic_transcription || undefined,
            stage1Thinking: (stage1 as any)._thinking || undefined,
            alternatives: stage1.alternative_interpretations || undefined,
            confidence: stage1.confidence,
          });
        }
      } catch (err) {
        if ((err as any)?.name === 'AbortError') {
          console.log('Calibration transcription aborted');
          setSteps([]);
          setIsProcessing(false);
          return;
        }
        console.error("Calibration transcription error:", err);
        updateStep('stage1', 'error', 'Failed');
        setHeard('(could not transcribe)');
      }
      setIsProcessing(false);
    } else {
      setHeard('');
      setSteps([]);
      setLastAudioBase64('');
      setLastTranscriptionLog(null);
      await startRecording();
      initSteps();
    }
  };

  const handleConfirm = async () => {
    if (!heard) return;

    try {
      await geminiService.calibrate({
        userId,
        heard,
        correct: phrase.text,
        phraseId: phrase.id,
        audioBase64: lastAudioBase64,
        mimeType: lastMimeType,
        language: phrase.language,
        transcriptionLog: lastTranscriptionLog || undefined,
      });
      setCompletedIds(prev => new Set(prev).add(phrase.id));
      setTotalCompleted(prev => prev + 1);

      const nextIndex = roundIndex + 1;
      if (nextIndex >= activePhrases.length) {
        setRoundComplete(true);
      } else {
        setRoundIndex(nextIndex);
      }
      setHeard('');
      setSteps([]);
      setLastAudioBase64('');
    } catch (err) {
      console.error("Calibration save error:", err);
    }
  };

  const handleSkip = () => {
    const nextIndex = roundIndex + 1;
    if (nextIndex >= activePhrases.length) {
      setRoundComplete(true);
    } else {
      setRoundIndex(nextIndex);
    }
    setHeard('');
    setSteps([]);
    setLastAudioBase64('');
  };

  const handleRedo = () => {
    setHeard('');
    setSteps([]);
    setLastAudioBase64('');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (roundComplete) {
    const completedRounds = Math.max(currentRoundIndex, 1);
    const nextRoundIndex = currentRoundIndex;
    const nextLabel = getRoundLabel(nextRoundIndex);
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 p-8">
        <div className="text-6xl">🎉</div>
        <h2 className="text-3xl font-bold text-slate-800">Round Complete!</h2>
        <p className="text-xl text-slate-500 text-center max-w-md">
          You&apos;ve completed {totalCompleted} total phrases across {completedRounds} round{completedRounds > 1 ? 's' : ''}.
          The app is getting better at understanding you!
        </p>
        <div className="flex gap-4">
          <button
            onClick={async () => {
              setRoundIndex(0);
              setRoundComplete(false);
              // Fetch new AI phrases for next round
              if (nextRoundIndex >= 1) {
                try {
                  setLoading(true);
                  const aiPhrases = await geminiService.generatePhrases(userId, nextRoundIndex + 1);
                  if (aiPhrases && aiPhrases.length > 0) setActivePhrases(aiPhrases);
                } catch (err) {
                  console.error('Failed to generate AI phrases for next round:', err);
                } finally {
                  setLoading(false);
                }
              }
            }}
            className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white text-xl font-bold rounded-2xl transition-colors"
          >
            Start Round {nextRoundIndex + 1}: {nextLabel.title}
          </button>
          <button
            onClick={onClose}
            className="px-8 py-4 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xl font-bold rounded-2xl transition-colors"
          >
            Done for now
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full p-5 sm:p-8 gap-5 sm:gap-8">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between">
        <div>
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-800">Training</h2>
          <p className="text-lg sm:text-xl text-slate-400 font-bold">Round {currentRoundIndex + 1}: {roundLabel.title}</p>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-700 text-2xl sm:text-3xl font-bold px-3">
          ✕ Close
        </button>
      </div>

      {/* Progress bar */}
      <div className="shrink-0">
        <div className="flex justify-between text-xl sm:text-2xl text-slate-500 mb-3">
          <span>{roundLabel.subtitle}</span>
          <span className="font-bold">{roundProgress}/{activePhrases.length} this round &middot; {totalCompleted} total</span>
        </div>
        <div className="w-full h-4 sm:h-5 bg-slate-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-500"
            style={{ width: `${(roundProgress / activePhrases.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Prompt card */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6 sm:gap-8 min-h-0 overflow-y-auto">
        <div className="w-full bg-white rounded-3xl shadow-lg border-2 border-slate-100 p-8 sm:p-10 text-center shrink-0">
          <p className="text-slate-500 text-xl sm:text-2xl mb-4">Please say:</p>
          <p className="text-4xl sm:text-5xl font-bold text-slate-800 leading-relaxed">&ldquo;{phrase.text}&rdquo;</p>
          {phrase.translation && (
            <p className="text-2xl sm:text-3xl text-slate-400 mt-4">({phrase.translation})</p>
          )}
        </div>

        {/* 4-step pipeline display */}
        {isProcessing && steps.length > 0 && (
          <div className="w-full shrink-0">
            <StepBubbles steps={steps} />
          </div>
        )}

        {/* Transcription result — simplified since target is known */}
        {heard && !isProcessing && (
          <div className="w-full bg-slate-50 rounded-3xl p-6 sm:p-8 space-y-5 shrink-0">
            {steps.length > 0 && (
              <details className="w-full">
                <summary className="cursor-pointer text-xl sm:text-2xl text-slate-500 font-bold py-2 hover:text-slate-700 transition-colors">
                  Pipeline steps ({steps.filter(s => s.status === 'done').length}/{steps.length} complete)
                </summary>
                <div className="mt-2">
                  <StepBubbles steps={steps} />
                </div>
              </details>
            )}
            <div>
              <label className="text-lg sm:text-xl font-bold text-slate-400 uppercase tracking-wider">App heard:</label>
              <p className="text-2xl sm:text-3xl text-slate-600 font-medium mt-2">{heard}</p>
            </div>
            <div>
              <label className="text-lg sm:text-xl font-bold text-slate-400 uppercase tracking-wider">Target:</label>
              <p className="text-2xl sm:text-3xl text-green-600 font-bold mt-2">&ldquo;{phrase.text}&rdquo;</p>
            </div>
          </div>
        )}

        {/* Record button */}
        {!heard && !isProcessing && (
          <button
            onClick={handleRecord}
            className={`
              w-40 h-40 sm:w-48 sm:h-48 rounded-full shadow-xl flex items-center justify-center transition-all transform active:scale-95 shrink-0
              ${isRecording ? 'bg-red-500 hover:bg-red-600 animate-pulse' : 'bg-blue-600 hover:bg-blue-700'}
            `}
          >
            {isRecording ? (
              <Square className="w-16 h-16 sm:w-20 sm:h-20 text-white" />
            ) : (
              <Mic className="w-16 h-16 sm:w-20 sm:h-20 text-white" />
            )}
          </button>
        )}

        {/* Action buttons */}
        {heard && !isProcessing && (
          <div className="flex gap-4 sm:gap-5 w-full shrink-0">
            <button
              onClick={handleConfirm}
              className="flex-1 flex items-center justify-center gap-3 py-5 sm:py-6 rounded-2xl bg-green-500 hover:bg-green-600 text-white font-bold text-2xl sm:text-3xl transition-colors"
            >
              <Check className="w-8 h-8 sm:w-9 sm:h-9" /> Done
            </button>
            <button
              onClick={handleRedo}
              className="flex items-center justify-center gap-3 px-6 py-5 sm:px-8 sm:py-6 rounded-2xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-2xl sm:text-3xl transition-colors"
            >
              <RotateCcw className="w-8 h-8 sm:w-9 sm:h-9" /> Redo
            </button>
            <button
              onClick={handleSkip}
              className="flex items-center justify-center gap-3 px-6 py-5 sm:px-8 sm:py-6 rounded-2xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-2xl sm:text-3xl transition-colors"
            >
              <SkipForward className="w-8 h-8 sm:w-9 sm:h-9" /> Skip
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
