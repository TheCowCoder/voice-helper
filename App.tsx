
import React, { useState } from 'react';
import { RotateCcw, Loader2, Volume2 } from 'lucide-react';
import { useAudioRecorder } from './hooks/useAudioRecorder';
import { geminiService } from './services/geminiService';
import { playAudioFromBase64, blobToBase64 } from './utils/audioUtils';
import { RecordButton } from './components/RecordButton';
import { TranscriptionDisplay } from './components/TranscriptionDisplay';
import { AppState } from './types';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [transcription, setTranscription] = useState<string>("");
  const { isRecording, startRecording, stopRecording, permissionError } = useAudioRecorder();
  const [isPlaying, setIsPlaying] = useState(false);

  const handleRecordToggle = async () => {
    if (appState === AppState.IDLE) {
      setTranscription("");
      await startRecording();
      setAppState(AppState.RECORDING);
    } else if (appState === AppState.RECORDING) {
      setAppState(AppState.TRANSCRIBING);
      const blob = await stopRecording();
      if (blob) {
        await processAudio(blob);
      } else {
        setAppState(AppState.IDLE);
        alert("Recording failed. Please try again.");
      }
    }
  };

  const processAudio = async (blob: Blob) => {
    try {
      const base64Audio = await blobToBase64(blob);
      const result = await geminiService.transcribeAudio(base64Audio, blob.type);
      setTranscription(result.text);
      setAppState(AppState.REVIEW);
    } catch (error) {
      console.error(error);
      setTranscription("Error transcribing. Please check your connection.");
      setAppState(AppState.REVIEW);
    }
  };

  // Play high-quality MP3 from server
  const handlePlay = async () => {
    if (!transcription) return;
    
    try {
      setIsPlaying(true);
      // Fetch MP3 from OpenAI via our server
      const audioData = await geminiService.generateSpeech(transcription);
      // Play it
      await playAudioFromBase64(audioData);
    } catch (error) {
      console.error("Playback error", error);
      alert("Could not play audio. Check API Key or Connection.");
    } finally {
      setIsPlaying(false);
    }
  };

  const handleReset = () => {
    setTranscription("");
    setAppState(AppState.IDLE);
    setIsPlaying(false);
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-slate-50 p-2 sm:p-6 md:p-8 max-w-4xl mx-auto overflow-hidden">
      
      <header className="shrink-0 mb-2 sm:mb-6 flex justify-between items-center">
        <h1 className="text-xl sm:text-3xl font-bold text-slate-800">Voice Helper</h1>
        {appState !== AppState.IDLE && (
          <button 
            onClick={handleReset}
            className="flex items-center gap-2 px-4 py-2 sm:px-6 sm:py-3 rounded-full bg-slate-200 text-slate-700 font-semibold hover:bg-slate-300 transition-colors text-base sm:text-lg"
          >
            <RotateCcw className="w-5 h-5 sm:w-6 sm:h-6" />
            New
          </button>
        )}
      </header>

      <main className="flex-1 flex flex-col items-center justify-center gap-4 sm:gap-8 min-h-0 w-full">
        {permissionError && (
          <div className="p-4 sm:p-6 bg-red-100 border-l-4 border-red-500 text-red-700 text-lg sm:text-xl rounded shadow-md mx-4">
            <p className="font-bold">Microphone Error</p>
            <p>Please allow microphone access in your browser settings to use this app.</p>
          </div>
        )}

        {(appState === AppState.IDLE || appState === AppState.RECORDING) && (
          <div className="flex flex-col items-center gap-6 sm:gap-8 animate-in fade-in duration-500">
             <div className="text-xl sm:text-3xl text-center font-medium text-slate-600 max-w-lg leading-relaxed px-2">
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
            <div className="w-20 h-20 sm:w-24 sm:h-24 border-8 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
            <p className="text-2xl sm:text-3xl text-slate-600 font-medium animate-pulse">Processing Speech...</p>
          </div>
        )}

        {(appState === AppState.REVIEW || appState === AppState.PLAYING) && (
          <div className="w-full flex-1 flex flex-col gap-3 sm:gap-6 min-h-0 animate-in slide-in-from-bottom-10 duration-500">
            <TranscriptionDisplay 
              text={transcription} 
              onChange={setTranscription} 
            />
            <button
              onClick={handlePlay}
              disabled={isPlaying || !transcription}
              className={`
                shrink-0 w-full py-3 sm:py-8 rounded-3xl shadow-xl flex items-center justify-center gap-3 sm:gap-4 transition-all transform active:scale-[0.98]
                ${isPlaying 
                  ? 'bg-green-600 cursor-wait' 
                  : 'bg-green-500 hover:bg-green-600'}
                disabled:opacity-50 disabled:cursor-not-allowed
              `}
            >
              {isPlaying ? (
                <>
                  <Loader2 className="w-8 h-8 sm:w-12 sm:h-12 animate-spin text-white" />
                  <span className="text-xl sm:text-4xl font-bold text-white tracking-wide">Speaking...</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-8 h-8 sm:w-12 sm:h-12 text-white fill-current" />
                  <span className="text-xl sm:text-4xl font-bold text-white tracking-wide">Play Voice</span>
                </>
              )}
            </button>
          </div>
        )}
      </main>
      
      <footer className="shrink-0 mt-2 sm:mt-6 text-center text-slate-400 text-xs sm:text-2xl font-medium uppercase tracking-widest pb-safe">
        {appState === AppState.IDLE && "Ready"}
        {appState === AppState.RECORDING && <span className="text-red-500">Recording in progress</span>}
        {appState === AppState.TRANSCRIBING && "Connecting to Gemini..."}
        {appState === AppState.REVIEW && "Review & Play"}
      </footer>
    </div>
  );
};

export default App;