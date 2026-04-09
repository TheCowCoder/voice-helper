
import React, { useState, useCallback, useRef } from 'react';
import { RotateCcw, Loader2, Volume2 } from 'lucide-react';
import { useAudioRecorder } from './hooks/useAudioRecorder';
import { useAuth } from './hooks/useAuth';
import { geminiService } from './services/geminiService';
import { playAudioFromBase64, blobToBase64 } from './utils/audioUtils';
import { localStore } from './utils/localStorage';
import { RecordButton } from './components/RecordButton';
import { TranscriptionDisplay } from './components/TranscriptionDisplay';
import { LoginView } from './components/LoginView';
import { ModeSelector } from './components/ModeSelector';
import { ChatView } from './components/ChatView';
import { CalibrationView } from './components/CalibrationView';
import { ProfileView } from './components/ProfileView';
import { StepBubbles } from './components/StepBubbles';
import { AppState, AppMode, StructuredTranscription, TranscriptionStep } from './types';

const App: React.FC = () => {
  const { user, loading: authLoading, login, register, logout } = useAuth();

  // Mode & view state
  const [mode, setMode] = useState<AppMode>('transcribe');
  const [showProfile, setShowProfile] = useState(false);

  // Transcribe mode state
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [transcription, setTranscription] = useState<string>("");
  const [structured, setStructured] = useState<StructuredTranscription | undefined>();
  const [steps, setSteps] = useState<TranscriptionStep[]>([]);
  const { isRecording, startRecording, stopRecording, permissionError } = useAudioRecorder();
  const [isPlaying, setIsPlaying] = useState(false);

  // Keep original transcription for correction tracking
  const originalTextRef = useRef<string>('');
  const lastAudioRef = useRef<{ base64: string; mimeType: string } | null>(null);

  // ── Step management helpers ──
  const initSteps = useCallback(() => {
    setSteps([
      { id: 'capture', label: 'Audio Capture', status: 'pending', detail: 'Recording from microphone' },
      { id: 'preprocess', label: 'Audio Preprocessing', status: 'pending', detail: 'Gain boost + dynamic compression via Web Audio' },
      { id: 'stage1', label: 'Stage 1: Acoustic Transcription', status: 'pending', detail: 'Gemini 3 Flash — structured JSON, thinkingLevel: low' },
      { id: 'refine', label: 'Stage 2: Semantic Refinement', status: 'pending', detail: 'Chain-of-thought correction if confidence < 70%' },
    ]);
  }, []);

  const updateStep = useCallback((id: string, status: TranscriptionStep['status'], detail?: string) => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, status, ...(detail !== undefined ? { detail } : {}) } : s));
  }, []);

  // ── Transcribe mode handlers ──

  const handleRecordToggle = async () => {
    if (appState === AppState.IDLE) {
      setTranscription("");
      setStructured(undefined);
      initSteps();
      await startRecording();
      updateStep('capture', 'active');
      setAppState(AppState.RECORDING);
    } else if (appState === AppState.RECORDING) {
      setAppState(AppState.TRANSCRIBING);
      updateStep('capture', 'done', 'Audio captured');
      updateStep('preprocess', 'active');

      const blob = await stopRecording();
      if (blob) {
        updateStep('preprocess', 'done', `Preprocessed ${(blob.size / 1024).toFixed(0)}KB ${blob.type}`);
        await processAudio(blob);
      } else {
        setAppState(AppState.IDLE);
      }
    }
  };

  const processAudio = async (blob: Blob) => {
    try {
      updateStep('stage1', 'active');
      const base64Audio = await blobToBase64(blob);
      lastAudioRef.current = { base64: base64Audio, mimeType: blob.type };
      const recent = localStore.getRecentTranscriptions();

      const result = await geminiService.transcribeAudio(
        base64Audio,
        blob.type,
        user?._id,
        recent
      );

      if (result.structured) {
        setStructured(result.structured);
        updateStep('stage1', 'done', `Phonetic: "${result.structured.phonetic_transcription}" — ${Math.round(result.structured.confidence * 100)}% confidence`);

        if (result.stage2Used) {
          updateStep('refine', 'done', `Refined to ${Math.round(result.structured.confidence * 100)}% confidence via chain-of-thought`);
        } else {
          updateStep('refine', 'done', 'Skipped — high confidence (≥70%), no refinement needed');
        }
      } else {
        updateStep('stage1', 'done');
        updateStep('refine', 'done');
      }

      setTranscription(result.text);
      originalTextRef.current = result.text;
      localStore.addRecentTranscription(result.text);
      setAppState(AppState.REVIEW);
    } catch (error) {
      console.error(error);
      updateStep('stage1', 'error', 'Failed');
      setTranscription("Error transcribing. Please check your connection.");
      setAppState(AppState.REVIEW);
    }
  };

  const handlePlay = async () => {
    if (!transcription) return;
    try {
      setIsPlaying(true);
      const audioData = await geminiService.generateSpeech(transcription);
      await playAudioFromBase64(audioData);
    } catch (error) {
      console.error("Playback error", error);
    } finally {
      setIsPlaying(false);
    }
  };

  const handleReset = () => {
    // Submit correction if text was edited
    if (originalTextRef.current && transcription !== originalTextRef.current && user?._id) {
      geminiService.submitCorrection({
        userId: user._id,
        heard: originalTextRef.current,
        correct: transcription,
        source: 'transcribe',
      }).catch(console.error);
    }
    // Save audio sample for continuous learning
    if (lastAudioRef.current && transcription && user?._id) {
      geminiService.saveAudioSample({
        userId: user._id,
        base64Audio: lastAudioRef.current.base64,
        mimeType: lastAudioRef.current.mimeType,
        transcript: transcription,
      }).catch(console.error);
    }
    setTranscription("");
    setStructured(undefined);
    setSteps([]);
    setAppState(AppState.IDLE);
    setIsPlaying(false);
    originalTextRef.current = '';
    lastAudioRef.current = null;
  };

  const handleWordCorrection = (original: string, corrected: string) => {
    // Replace the word in the transcription text
    setTranscription(prev => {
      const words = prev.split(/(\s+)/);
      const idx = words.findIndex(w => w === original);
      if (idx !== -1) words[idx] = corrected;
      return words.join('');
    });
    // Save to server
    if (user?._id) {
      geminiService.submitCorrection({
        userId: user._id,
        heard: original,
        correct: corrected,
        source: 'transcribe',
      }).catch(console.error);
    }
  };

  // ── Auth loading ──
  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-[100dvh] bg-slate-50">
        <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
      </div>
    );
  }

  // ── Login gate ──
  if (!user) {
    return (
      <LoginView
        onLogin={login}
        onRegister={register}
      />
    );
  }

  // ── Profile view ──
  // All views rendered simultaneously, hidden with display:none to persist state
  return (
    <div className="flex flex-col h-[100dvh] bg-slate-50 max-w-4xl mx-auto overflow-hidden">
      <header className="shrink-0 p-4 sm:p-6">
        <ModeSelector mode={mode} onChange={(m) => { setShowProfile(false); setMode(m); }} onProfileClick={() => setShowProfile(true)} />
      </header>

      {/* Profile overlay */}
      <div className="flex-1 min-h-0" style={{ display: showProfile ? 'flex' : 'none', flexDirection: 'column' }}>
        <ProfileView user={user} onClose={() => setShowProfile(false)} onLogout={logout} />
      </div>

      {/* Calibration view */}
      <div className="flex-1 min-h-0" style={{ display: !showProfile && mode === 'calibrate' ? 'flex' : 'none', flexDirection: 'column' }}>
        <CalibrationView userId={user._id} onClose={() => setMode('transcribe')} />
      </div>

      {/* Chat view */}
      <div className="flex-1 min-h-0" style={{ display: !showProfile && mode === 'chat' ? 'flex' : 'none', flexDirection: 'column' }}>
        <ChatView userId={user._id} />
      </div>

      {/* Transcribe view */}
      <div className="flex-1 min-h-0 flex flex-col p-3 sm:p-6 md:p-8 pt-0 sm:pt-0 md:pt-0" style={{ display: !showProfile && mode === 'transcribe' ? 'flex' : 'none' }}>
        <div className="shrink-0 mb-3 sm:mb-5">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-800">Voice Helper</h1>
            <div className="flex items-center gap-3 sm:gap-4">
              {appState !== AppState.IDLE && (
                <button 
                  onClick={handleReset}
                  className="flex items-center gap-3 px-6 py-3 sm:px-8 sm:py-4 rounded-full bg-slate-200 text-slate-700 font-bold hover:bg-slate-300 transition-colors text-xl sm:text-2xl"
                >
                  <RotateCcw className="w-7 h-7 sm:w-8 sm:h-8" />
                  New
                </button>
              )}
            </div>
          </div>
        </div>

        <main className="flex-1 flex flex-col items-center justify-center gap-4 sm:gap-8 min-h-0 w-full">
          {permissionError && (
            <div className="p-5 sm:p-8 bg-red-100 border-l-4 border-red-500 text-red-700 text-xl sm:text-2xl rounded-2xl shadow-md mx-4">
              <p className="font-bold text-2xl sm:text-3xl">Microphone Error</p>
              <p>Please allow microphone access in your browser settings to use this app.</p>
            </div>
          )}

          {(appState === AppState.IDLE || appState === AppState.RECORDING) && (
            <div className="flex flex-col items-center gap-8 sm:gap-10 animate-in fade-in duration-500">
              <div className="text-2xl sm:text-3xl text-center font-bold text-slate-600 max-w-lg leading-relaxed px-2">
                {appState === AppState.IDLE 
                  ? "Press the button below to start recording." 
                  : "Listening... Press again to stop."}
              </div>
              <RecordButton 
                isRecording={appState === AppState.RECORDING} 
                onClick={handleRecordToggle} 
                disabled={permissionError}
              />
            </div>
          )}

          {appState === AppState.TRANSCRIBING && (
            <div className="flex flex-col items-center gap-6 animate-in fade-in zoom-in duration-300">
              <StepBubbles steps={steps} />
            </div>
          )}

          {(appState === AppState.REVIEW || appState === AppState.PLAYING) && (
            <div className="w-full flex-1 flex flex-col gap-3 sm:gap-6 min-h-0 animate-in slide-in-from-bottom-10 duration-500">
              {steps.length > 0 && (
                <details className="w-full">
                    <summary className="cursor-pointer text-xl sm:text-2xl text-slate-500 font-bold px-3 py-2 hover:text-slate-700 transition-colors">
                    Pipeline steps ({steps.filter(s => s.status === 'done').length}/{steps.length} complete)
                  </summary>
                  <div className="mt-2">
                    <StepBubbles steps={steps} />
                  </div>
                </details>
              )}
              <TranscriptionDisplay 
                text={transcription} 
                onChange={setTranscription}
                structured={structured}
                onWordCorrection={handleWordCorrection}
              />
              <button
                onClick={handlePlay}
                disabled={isPlaying || !transcription}
                className={`
                  shrink-0 w-full py-5 sm:py-10 rounded-3xl shadow-xl flex items-center justify-center gap-4 sm:gap-5 transition-all transform active:scale-[0.98]
                  ${isPlaying 
                    ? 'bg-green-600 cursor-wait' 
                    : 'bg-green-500 hover:bg-green-600'}
                  disabled:opacity-50 disabled:cursor-not-allowed
                `}
              >
                {isPlaying ? (
                  <>
                    <Loader2 className="w-10 h-10 sm:w-14 sm:h-14 animate-spin text-white" />
                    <span className="text-3xl sm:text-4xl font-bold text-white tracking-wide">Speaking...</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="w-10 h-10 sm:w-14 sm:h-14 text-white fill-current" />
                    <span className="text-3xl sm:text-4xl font-bold text-white tracking-wide">Play Voice</span>
                  </>
                )}
              </button>
            </div>
          )}
        </main>
        
        <footer className="shrink-0 mt-3 sm:mt-5 text-center text-slate-400 text-lg sm:text-xl font-bold uppercase tracking-widest pb-safe">
          {appState === AppState.IDLE && "Ready"}
          {appState === AppState.RECORDING && <span className="text-red-500">Recording in progress</span>}
          {appState === AppState.TRANSCRIBING && "Processing with Gemini..."}
          {appState === AppState.REVIEW && "Review & Play"}
        </footer>
      </div>
    </div>
  );
};

export default App;