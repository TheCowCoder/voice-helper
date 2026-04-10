import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, Square, Loader2 } from 'lucide-react';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { geminiService } from '../services/geminiService';
import { blobToBase64 } from '../utils/audioUtils';
import { ChatMessage, TranscriptionStep, MemoryAction, AssistantMode } from '../types';
import { StepBubbles } from './StepBubbles';

// Color mapping for memory action bubble types
const MEMORY_BUBBLE_STYLES: Record<string, { bg: string; glow: string; text: string }> = {
  pt_status: { bg: 'bg-blue-950', glow: 'bg-blue-900', text: 'text-white' },
  memory_write: { bg: 'bg-purple-500', glow: 'bg-purple-400', text: 'text-white' },
  memory_read: { bg: 'bg-violet-400', glow: 'bg-violet-300', text: 'text-white' },
  personality_write: { bg: 'bg-rose-500', glow: 'bg-rose-400', text: 'text-white' },
  personality_read: { bg: 'bg-pink-400', glow: 'bg-pink-300', text: 'text-white' },
  interests_write: { bg: 'bg-emerald-500', glow: 'bg-emerald-400', text: 'text-white' },
  interests_read: { bg: 'bg-teal-400', glow: 'bg-teal-300', text: 'text-white' },
  connections_write: { bg: 'bg-amber-500', glow: 'bg-amber-400', text: 'text-white' },
  connections_read: { bg: 'bg-cyan-400', glow: 'bg-cyan-300', text: 'text-white' },
};

const DEFAULT_STYLE = { bg: 'bg-slate-500', glow: 'bg-slate-400', text: 'text-white' };

const LATEST_UPDATE_LOG = [
  'Fast mode is now Gemini 3.1 in a single pass with no stage 2.',
  'Deep mode stays on Gemini 3.1 with both stages.',
  'Fast mode now sends every saved audio reference instead of only the newest subset.',
  'Chat transcription is locked to fast mode.',
  'Play Voice now stops and restarts from the beginning instead of resuming mid-sentence.',
  'Replacement mode now reads left-to-right with inline word replacement and optional sentence edit.',
  'Correction storage now aggregates repeat replacements and feeds stronger replacement patterns back into transcription.',
  'The debug modal now has a separate collapsible box for stored reference phonetics and thought logs when those logs exist on the saved samples.',
  'PT Trainer is now available inside chat.',
].join('\n');

function getMemoryBubbleType(action: MemoryAction): string {
  const tool = action.tool || '';
  if (tool.includes('memories')) return tool.includes('write') ? 'memory_write' : 'memory_read';
  if (tool.includes('personality')) return tool.includes('write') ? 'personality_write' : 'personality_read';
  if (tool.includes('interests')) return tool.includes('write') ? 'interests_write' : 'interests_read';
  if (tool.includes('personal_connections')) return tool.includes('write') ? 'connections_write' : 'connections_read';
  return action.type || 'memory_read';
}

interface ChatViewProps {
  userId?: string;
}

export const ChatView: React.FC<ChatViewProps> = ({ userId }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [steps, setSteps] = useState<TranscriptionStep[]>([]);
  const [assistantMode, setAssistantMode] = useState<AssistantMode>('personal');
  const [sessionId] = useState(() => crypto.randomUUID());
  const { isRecording, startRecording, stopRecording } = useAudioRecorder();
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasShownUpdateLogRef = useRef(false);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, steps]);

  useEffect(() => {
    setMessages([{
      role: 'assistant',
      text: 'Hello! I\'m here to chat. Press the microphone to talk to me.',
      timestamp: Date.now(),
    }]);
  }, []);

  const updateStep = useCallback((id: string, status: TranscriptionStep['status'], detail?: string) => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, status, ...(detail !== undefined ? { detail } : {}) } : s));
  }, []);

  const handleRecordToggle = async () => {
    if (isRecording) {
      setSteps([
        { id: 'preprocess', label: 'Audio Preprocessing', status: 'active', detail: 'Gain boost + dynamic compression' },
        { id: 'stage1', label: 'Fast Transcription', status: 'pending', detail: 'Gemini 3.1 single-pass phonetic + meaning decode' },
      ]);
      setIsProcessing(true);

      const blob = await stopRecording();
      if (!blob) { setIsProcessing(false); setSteps([]); return; }

      updateStep('preprocess', 'done', `Preprocessed ${(blob.size / 1024).toFixed(0)}KB ${blob.type}`);
      updateStep('stage1', 'active');

      try {
        const signal = geminiService.createAbortSignal();
        const base64Audio = await blobToBase64(blob);

        const stage1 = await geminiService.transcribeStage1(base64Audio, blob.type, userId, undefined, 'fast', signal);
        updateStep('stage1', 'done', `"${stage1.primary_transcription}" — ${Math.round(stage1.confidence * 100)}%`);
        const userText = stage1.primary_transcription || '[voice message]';

        // Clear pipeline steps — transcription is done
        setSteps([]);

        // Save audio sample for learning
        if (userId) {
          geminiService.saveAudioSample({
            userId,
            base64Audio,
            mimeType: blob.type,
            transcript: userText,
            heard: stage1.primary_transcription,
            transcriptionLog: {
              phonetic: stage1.phonetic_transcription || undefined,
              stage1Thinking: (stage1 as any)._thinking || undefined,
              alternatives: stage1.alternative_interpretations || undefined,
              confidence: stage1.confidence,
            },
          }).catch(console.error);
        }

        // Show user message immediately
        setMessages(prev => [...prev, {
          role: 'user' as const,
          text: userText,
          timestamp: Date.now(),
        }]);

        // Step 2: Get AI reply (no pipeline UI — just wait)
        const chatHistory = messages
          .filter(m => m.role !== 'memory')
          .map(m => ({ role: m.role as 'user' | 'assistant', text: m.text }));
        chatHistory.push({ role: 'user', text: userText });

        if (assistantMode === 'pt') {
          setSteps([
            { id: 'pt-compare', label: 'PT Compare', status: 'active', detail: 'Comparing the speech attempt against the exercise' },
            { id: 'pt-coach', label: 'PT Coach', status: 'pending', detail: 'Preparing tip, encouragement, and next exercise' },
          ]);
        }

        const response = await geminiService.chatWithText(
          userText,
          userId,
          chatHistory,
          sessionId,
          assistantMode
        );

        if (assistantMode === 'pt') {
          setSteps([
            { id: 'pt-compare', label: 'PT Compare', status: 'done', detail: 'Speech compared against the current exercise context' },
            { id: 'pt-coach', label: 'PT Coach', status: 'done', detail: 'PT feedback and next exercise ready' },
          ]);
        }

        // Add memory action bubbles + assistant reply
        const newMessages: ChatMessage[] = [];

        if (response.memoryActions && response.memoryActions.length > 0) {
          for (const action of response.memoryActions) {
            newMessages.push({
              role: 'memory',
              text: action.label,
              timestamp: Date.now(),
              memoryAction: action,
            });
          }
        }

        newMessages.push({
          role: 'assistant',
          text: response.reply_text,
          timestamp: Date.now(),
        });

        setMessages(prev => [...prev, ...newMessages]);

        if (assistantMode !== 'pt') {
          setSteps([]);
        }

      } catch (err) {
        if ((err as any)?.name === 'AbortError') {
          console.log('Chat transcription aborted');
          setSteps([]);
          setIsProcessing(false);
          return;
        }
        console.error("Chat error:", err);
        setSteps([]);
        setMessages(prev => [
          ...prev,
          { role: 'assistant' as const, text: 'Sorry, I had trouble understanding. Could you try again?', timestamp: Date.now() },
        ]);
      }
      setIsProcessing(false);
    } else {
      await startRecording();
    }
  };

  const activateAssistantMode = (nextMode: AssistantMode) => {
    if (nextMode === assistantMode) {
      return;
    }

    setAssistantMode(nextMode);

    if (nextMode === 'pt') {
      setMessages(prev => {
        const nextMessages = [
          ...prev,
          {
            role: 'memory' as const,
            text: 'Personal PT Trainer Activated',
            timestamp: Date.now(),
            memoryAction: { type: 'pt_status', label: 'Personal PT Trainer Activated', tool: 'pt_status' },
          },
        ];

        if (!hasShownUpdateLogRef.current) {
          nextMessages.push({
            role: 'assistant',
            text: `Recent update log:\n${LATEST_UPDATE_LOG}`,
            timestamp: Date.now(),
          });
          hasShownUpdateLogRef.current = true;
        }

        return nextMessages;
      });
      return;
    }

    setMessages(prev => [
      ...prev,
      {
        role: 'assistant',
        text: 'Personal AI is back on. PT Trainer is off until you reactivate it.',
        timestamp: Date.now(),
      },
    ]);
  };

  const renderMessage = (msg: ChatMessage, i: number) => {
    if (msg.role === 'memory' && msg.memoryAction) {
      const bubbleType = getMemoryBubbleType(msg.memoryAction);
      const style = MEMORY_BUBBLE_STYLES[bubbleType] || DEFAULT_STYLE;
      const bubbleShape = bubbleType === 'pt_status' ? 'rounded-2xl' : 'rounded-full';
      return (
        <div key={i} className="flex justify-center my-2">
          <div className="relative">
            {/* Glow layer: solid color behind with high blur */}
            <div className={`absolute inset-0 ${style.glow} ${bubbleShape} blur-xl opacity-60`} />
            {/* Actual bubble */}
            <div className={`relative ${style.bg} ${style.text} px-6 py-3 sm:px-8 sm:py-4 ${bubbleShape} text-lg sm:text-xl font-bold shadow-lg`}>
              {msg.text}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
        <div className={`
          max-w-[85%] px-6 py-5 sm:px-8 sm:py-6 rounded-3xl text-2xl sm:text-3xl leading-relaxed
          ${msg.role === 'user'
            ? 'bg-blue-500 text-white rounded-br-lg'
            : 'bg-white text-slate-800 shadow-md border-2 border-slate-100 rounded-bl-lg'}
        `}>
          {msg.text}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 border-b-2 border-slate-100 bg-white px-5 py-4 sm:px-8 sm:py-5">
        <div className="flex items-center justify-center gap-3 rounded-2xl bg-slate-100 p-2">
          <button
            onClick={() => activateAssistantMode('personal')}
            className={`rounded-xl px-5 py-3 text-xl sm:text-2xl font-bold transition-colors ${assistantMode === 'personal' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Personal AI
          </button>
          <button
            onClick={() => activateAssistantMode('pt')}
            className={`rounded-xl px-5 py-3 text-xl sm:text-2xl font-bold transition-colors ${assistantMode === 'pt' ? 'bg-blue-950 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            PT Trainer
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 sm:p-8 space-y-5 sm:space-y-8 min-h-0">
        {messages.map((msg, i) => renderMessage(msg, i))}
        {steps.length > 0 && (isProcessing || assistantMode === 'pt') && (
          <div className="flex justify-center py-6">
            <StepBubbles steps={steps} />
          </div>
        )}
      </div>

      <div className="shrink-0 p-5 sm:p-8 border-t-2 border-slate-100 bg-white flex justify-center">
        <button
          onClick={handleRecordToggle}
          disabled={isProcessing}
          className={`
            flex items-center justify-center gap-4 sm:gap-5 px-12 py-6 sm:px-16 sm:py-8 rounded-full text-2xl sm:text-3xl font-bold shadow-xl transition-all transform active:scale-95
            ${isRecording
              ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse'
              : isProcessing
                ? 'bg-slate-300 text-slate-500 cursor-wait'
                : 'bg-blue-600 hover:bg-blue-700 text-white'}
            disabled:opacity-50
          `}
        >
          {isRecording ? (
            <><Square className="w-9 h-9 sm:w-11 sm:h-11" /> Stop</>
          ) : isProcessing ? (
            <><Loader2 className="w-9 h-9 sm:w-11 sm:h-11 animate-spin" /> Processing...</>
          ) : (
            <><Mic className="w-9 h-9 sm:w-11 sm:h-11" /> Hold to Talk</>
          )}
        </button>
      </div>
    </div>
  );
};
