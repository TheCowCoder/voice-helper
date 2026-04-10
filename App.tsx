
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { RotateCcw, Loader2, Volume2, Bug } from 'lucide-react';
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
import { DebugModal } from './components/DebugModal';
import { AppState, AppMode, StructuredTranscription, TranscriptionStep, TranscriptionMode } from './types';

const App: React.FC = () => {
  const { user, loading: authLoading, login, register, logout } = useAuth();

  // Mode & view state
  const [mode, setMode] = useState<AppMode>('transcribe');
  const [showProfile, setShowProfile] = useState(false);
  const [transcriptionMode, setTranscriptionMode] = useState<TranscriptionMode>(
    () => (localStorage.getItem('transcriptionMode') as TranscriptionMode) || 'fast'
  );

  const handleTranscriptionModeChange = (m: TranscriptionMode) => {
    setTranscriptionMode(m);
    localStorage.setItem('transcriptionMode', m);
  };

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
  const lastTranscriptionLogRef = useRef<any>(null);

  // Debug modal state
  const [debugEntries, setDebugEntries] = useState<any[]>([]);
  const [showDebug, setShowDebug] = useState(false);

  // Pipeline timer
  const [pipelineElapsed, setPipelineElapsed] = useState(0);
  const pipelineStartRef = useRef<number>(0);

  useEffect(() => {
    if (appState === AppState.TRANSCRIBING) {
      pipelineStartRef.current = Date.now();
      const id = setInterval(() => setPipelineElapsed(Date.now() - pipelineStartRef.current), 100);
      return () => clearInterval(id);
    }
  }, [appState]);

  // ── Step management helpers ──
  const initSteps = useCallback(() => {
    setSteps([
      { id: 'preprocess', label: 'Audio Preprocessing', status: 'pending', detail: 'Gain boost + dynamic compression via Web Audio' },
      { id: 'stage1', label: 'Stage 1: Acoustic Transcription', status: 'pending', detail: 'Gemini 3 Flash — structured JSON, thinkingLevel: low' },
      { id: 'refine', label: 'Stage 2: Semantic Refinement', status: 'pending', detail: 'Deep reasoning pass for best interpretation' },
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
      setAppState(AppState.RECORDING);
    } else if (appState === AppState.RECORDING) {
      setAppState(AppState.TRANSCRIBING);
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
      const signal = geminiService.createAbortSignal();
      updateStep('stage1', 'active');
      const base64Audio = await blobToBase64(blob);
      lastAudioRef.current = { base64: base64Audio, mimeType: blob.type };
      const recent = localStore.getRecentTranscriptions();
      const newDebugEntries: any[] = [];

      // Stage 1: Acoustic transcription
      const stage1Raw = await geminiService.transcribeStage1(
        base64Audio,
        blob.type,
        user?._id,
        recent,
        transcriptionMode,
        signal
      );

      const { _debug: stage1Debug, ...stage1 } = stage1Raw;
      if (stage1Debug) {
        newDebugEntries.push({
          stage: 'Stage 1: Acoustic Transcription',
          systemInstruction: stage1Debug.systemInstruction,
          prompt: stage1Debug.dynamicPrompt,
          audioReferences: stage1Debug.audioReferences,
          audioRefCount: stage1Debug.audioRefCount,
          rawResponse: stage1Debug.rawResponse,
          thinking: stage1Debug.thinking,
        });
      }

      updateStep('stage1', 'done', `Phonetic: "${stage1.phonetic_transcription}" — ${Math.round(stage1.confidence * 100)}% confidence`);
      updateStep('refine', 'active', 'Deep reasoning refinement in progress...');

      // Stage 2: Semantic refinement
      const result = await geminiService.transcribeStage2(
        base64Audio,
        blob.type,
        stage1,
        user?._id,
        recent,
        transcriptionMode,
        signal
      );

      const { _debug: stage2Debug } = result as any;
      if (stage2Debug) {
        newDebugEntries.push({
          stage: 'Stage 2: Semantic Refinement',
          systemInstruction: stage2Debug.systemInstruction,
          prompt: stage2Debug.stage2Prompt,
          audioReferences: stage2Debug.audioReferences,
          audioRefCount: stage2Debug.audioRefCount,
          rawResponse: stage2Debug.rawResponse,
          thinking: stage2Debug.thinking,
        });
      }

      setDebugEntries(newDebugEntries);

      // Build transcription log for storage
      lastTranscriptionLogRef.current = {
        phonetic: stage1.phonetic_transcription || undefined,
        stage1Thinking: (stage1 as any)._thinking || undefined,
        stage2Thinking: (result.structured as any)?._thinking || (result as any)._thinking || undefined,
        alternatives: stage1.alternative_interpretations || undefined,
        confidence: result.structured?.confidence ?? stage1.confidence,
      };

      if (result.structured) {
        setStructured(result.structured);
        updateStep('refine', 'done', `Refined to ${Math.round(result.structured.confidence * 100)}% confidence via deep reasoning`);
      } else {
        updateStep('refine', 'done');
      }

      setTranscription(result.text);
      originalTextRef.current = result.text;
      localStore.addRecentTranscription(result.text);
      setAppState(AppState.REVIEW);
    } catch (error) {
      if ((error as any)?.name === 'AbortError') {
        console.log('Transcription aborted');
        return;
      }
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
    // Abort any in-flight transcription requests
    geminiService.abort();

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
        heard: originalTextRef.current || undefined,
        transcriptionLog: lastTranscriptionLogRef.current || undefined,
      }).catch(console.error);
    }
    setTranscription("");
    setStructured(undefined);
    setSteps([]);
    setAppState(AppState.IDLE);
    setIsPlaying(false);
    setPipelineElapsed(0);
    originalTextRef.current = '';
    lastAudioRef.current = null;
    lastTranscriptionLogRef.current = null;
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
        <CalibrationView userId={user._id} onClose={() => setMode('transcribe')} transcriptionMode={transcriptionMode} />
      </div>

      {/* Chat view */}
      <div className="flex-1 min-h-0" style={{ display: !showProfile && mode === 'chat' ? 'flex' : 'none', flexDirection: 'column' }}>
        <ChatView userId={user._id} transcriptionMode={transcriptionMode} />
      </div>

      {/* Transcribe view */}
      <div className="flex-1 min-h-0 flex flex-col p-3 sm:p-6 md:p-8 pt-0 sm:pt-0 md:pt-0" style={{ display: !showProfile && mode === 'transcribe' ? 'flex' : 'none' }}>
        <div className="shrink-0 mb-3 sm:mb-5">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-800">Voice Helper</h1>
            <div className="flex items-center gap-3 sm:gap-4">
              {/* Fast / Deep mode toggle */}
              <div className="flex rounded-full bg-slate-200 p-1">
                <button
                  onClick={() => handleTranscriptionModeChange('fast')}
                  className={`px-4 py-2 rounded-full text-base sm:text-lg font-bold transition-all ${
                    transcriptionMode === 'fast'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-slate-500'
                  }`}
                >
                  ⚡ Fast
                </button>
                <button
                  onClick={() => handleTranscriptionModeChange('deep')}
                  className={`px-4 py-2 rounded-full text-base sm:text-lg font-bold transition-all ${
                    transcriptionMode === 'deep'
                      ? 'bg-white text-purple-600 shadow-sm'
                      : 'text-slate-500'
                  }`}
                >
                  🧠 Deep
                </button>
              </div>
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
              <span className="font-mono tabular-nums text-4xl sm:text-5xl text-slate-400">
                {Math.floor(pipelineElapsed / 60000)}:{String(Math.floor(pipelineElapsed / 1000) % 60).padStart(2, '0')}
              </span>
              <StepBubbles steps={steps} />
            </div>
          )}

          {(appState === AppState.REVIEW || appState === AppState.PLAYING) && (
            <div className="w-full flex-1 flex flex-col gap-3 sm:gap-6 min-h-0 animate-in slide-in-from-bottom-10 duration-500">
              <div className="flex items-center gap-3">
                {steps.length > 0 && (
                  <details className="flex-1">
                      <summary className="cursor-pointer text-xl sm:text-2xl text-slate-500 font-bold px-3 py-2 hover:text-slate-700 transition-colors">
                      Pipeline steps ({steps.filter(s => s.status === 'done').length}/{steps.length} complete) — {Math.floor(pipelineElapsed / 60000)}:{String(Math.floor(pipelineElapsed / 1000) % 60).padStart(2, '0')}
                    </summary>
                    <div className="mt-2">
                      <StepBubbles steps={steps} />
                    </div>
                  </details>
                )}
                {debugEntries.length > 0 && (
                  <button
                    onClick={() => setShowDebug(true)}
                    className="shrink-0 p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors"
                    title="View debug logs"
                  >
                    <Bug className="w-5 h-5" />
                  </button>
                )}
              </div>
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
                  shrink-0 w-full py-3 sm:py-5 rounded-2xl shadow-lg flex items-center justify-center gap-3 sm:gap-4 transition-all transform active:scale-[0.98]
                  ${isPlaying 
                    ? 'bg-green-600 cursor-wait' 
                    : 'bg-green-500 hover:bg-green-600'}
                  disabled:opacity-50 disabled:cursor-not-allowed
                `}
              >
                {isPlaying ? (
                  <>
                    <Loader2 className="w-7 h-7 sm:w-9 sm:h-9 animate-spin text-white" />
                    <span className="text-2xl sm:text-3xl font-bold text-white tracking-wide">Speaking...</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="w-7 h-7 sm:w-9 sm:h-9 text-white fill-current" />
                    <span className="text-2xl sm:text-3xl font-bold text-white tracking-wide">Play Voice</span>
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
          {appState === AppState.REVIEW && ""}
        </footer>
      </div>

      {/* Debug modal */}
      {showDebug && (
        <DebugModal entries={debugEntries} onClose={() => setShowDebug(false)} />
      )}
    </div>
  );
};

export default App;