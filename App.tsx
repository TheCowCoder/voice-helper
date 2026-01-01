import React, { useState, useEffect } from 'react';
import { Play, RotateCcw, Loader2, Volume2 } from 'lucide-react';
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

  // Handle Record Button Interaction
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
        // Fallback if recording failed to produce blob
        setAppState(AppState.IDLE);
        alert("Recording failed. Please try again.");
      }
    }
  };

  // Process Audio with Gemini
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

  // Handle TTS Playback
  const handlePlay = async () => {
    if (!transcription) return;
    
    try {
      setIsPlaying(true);
      // Generate speech using Gemini TTS
      const audioData = await geminiService.generateSpeech(transcription);
      // Play the audio
      await playAudioFromBase64(audioData);
    } catch (error) {
      console.error("Playback error", error);
      alert("Could not play audio. Please try again.");
    } finally {
      setIsPlaying(false);
    }
  };

  // Reset to Start
  const handleReset = () => {
    setTranscription("");
    setAppState(AppState.IDLE);
    setIsPlaying(false);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 p-4 sm:p-6 md:p-8 max-w-4xl mx-auto">
      
      {/* Header */}
      <header className="mb-6 flex justify-between items-center">
        <h1 className="text-3xl font-bold text-slate-800">Voice Helper</h1>
        {appState !== AppState.IDLE && (
          <button 
            onClick={handleReset}
            className="flex items-center gap-2 px-6 py-3 rounded-full bg-slate-200 text-slate-700 font-semibold hover:bg-slate-300 transition-colors text-lg"
          >
            <RotateCcw size={24} />
            New
          </button>
        )}
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col items-center justify-center gap-8 min-h-0">
        
        {/* State: Permission Error */}
        {permissionError && (
          <div className="p-6 bg-red-100 border-l-4 border-red-500 text-red-700 text-xl rounded shadow-md">
            <p className="font-bold">Microphone Error</p>
            <p>Please allow microphone access in your browser settings to use this app.</p>
          </div>
        )}

        {/* State: IDLE or RECORDING */}
        {(appState === AppState.IDLE || appState === AppState.RECORDING) && (
          <div className="flex flex-col items-center gap-8 animate-in fade-in duration-500">
             <div className="text-3xl sm:text-4xl text-center font-medium text-slate-600 max-w-lg leading-relaxed">
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

        {/* State: TRANSCRIBING */}
        {appState === AppState.TRANSCRIBING && (
          <div className="flex flex-col items-center gap-6 animate-in fade-in zoom-in duration-300">
            <div className="w-24 h-24 border-8 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
            <p className="text-3xl text-slate-600 font-medium animate-pulse">Processing Speech...</p>
          </div>
        )}

        {/* State: REVIEW or PLAYING */}
        {(appState === AppState.REVIEW || appState === AppState.PLAYING) && (
          <div className="w-full self-stretch flex-1 min-h-0 flex flex-col gap-6 overflow-auto animate-in slide-in-from-bottom-10 duration-500">
            
            <TranscriptionDisplay 
              text={transcription} 
              onChange={setTranscription} 
            />

            <button
              onClick={handlePlay}
              disabled={isPlaying || !transcription}
              className={`
                w-full py-8 rounded-3xl shadow-xl flex items-center justify-center gap-4 transition-all transform active:scale-[0.98]
                ${isPlaying 
                  ? 'bg-green-600 cursor-wait' 
                  : 'bg-green-500 hover:bg-green-600'}
                disabled:opacity-50 disabled:cursor-not-allowed
              `}
            >
              {isPlaying ? (
                <>
                  <Loader2 size={48} className="animate-spin text-white" />
                  <span className="text-4xl font-bold text-white tracking-wide">Speaking...</span>
                </>
              ) : (
                <>
                  <Volume2 size={48} className="text-white fill-current" />
                  <span className="text-4xl font-bold text-white tracking-wide">Play Voice</span>
                </>
              )}
            </button>
          </div>
        )}

      </main>
      
      {/* Footer / Status Bar */}
      <footer className="mt-6 text-center text-slate-400 text-2xl font-medium uppercase tracking-widest">
        {appState === AppState.IDLE && "Ready"}
        {appState === AppState.RECORDING && <span className="text-red-500">Recording in progress</span>}
        {appState === AppState.TRANSCRIBING && "Connecting to Gemini..."}
        {appState === AppState.REVIEW && "Review & Play"}
      </footer>
    </div>
  );
};

export default App;
