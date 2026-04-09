
import React, { useRef, useEffect } from 'react';
import { WordPills } from './WordPills';
import { StructuredTranscription } from '../types';

interface TranscriptionDisplayProps {
  text: string;
  onChange: (text: string) => void;
  structured?: StructuredTranscription;
  onWordCorrection?: (original: string, corrected: string) => void;
}

export const TranscriptionDisplay: React.FC<TranscriptionDisplayProps> = ({
  text,
  onChange,
  structured,
  onWordCorrection,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  return (
    <div className="w-full flex-1 flex flex-col bg-white rounded-3xl shadow-lg border-4 border-slate-200 min-h-0 overflow-y-auto">
      <div className="bg-slate-100 px-5 py-4 sm:px-6 sm:py-5 border-b-2 border-slate-200 shrink-0 flex items-center justify-between flex-wrap gap-2">
        <label htmlFor="transcription" className="text-xl sm:text-2xl font-bold text-slate-500 uppercase tracking-wider">
          Message to Speak:
        </label>
        {structured && (
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Confidence bar */}
            <div className="flex items-center gap-2">
              <div className="w-20 sm:w-28 h-4 sm:h-5 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    structured.confidence >= 0.8 ? 'bg-green-500' :
                    structured.confidence >= 0.6 ? 'bg-yellow-500' :
                    structured.confidence >= 0.4 ? 'bg-orange-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${Math.round(structured.confidence * 100)}%` }}
                />
              </div>
              <span className="text-lg sm:text-xl font-bold text-slate-500">
                {Math.round(structured.confidence * 100)}%
              </span>
            </div>
            <span className="px-4 py-1.5 rounded-full bg-slate-200 text-slate-600 capitalize font-bold text-lg sm:text-xl">
              {structured.language_detected}
            </span>
            {structured.detected_emotion !== 'neutral' && (
              <span className="px-4 py-1.5 rounded-full bg-purple-100 text-purple-700 capitalize font-bold text-lg sm:text-xl">
                {structured.detected_emotion}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Tap-to-correct word pills (shown above textarea) */}
      {onWordCorrection && text && (
        <div className="border-b-2 border-slate-100 bg-slate-50">
          <WordPills
            text={text}
            alternatives={structured?.alternative_interpretations}
            onCorrection={onWordCorrection}
          />
          <p className="text-lg sm:text-xl text-slate-400 px-5 pb-3 font-medium">Tap a word to highlight it — then pick a suggestion or type your own</p>
        </div>
      )}

      <textarea
        id="transcription"
        ref={textareaRef}
        value={text}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 w-full p-4 sm:p-8 text-3xl sm:text-4xl leading-tight text-slate-900 resize-none outline-none focus:bg-yellow-50 transition-colors font-medium"
        placeholder="Transcription will appear here..."
      />

      <div className="bg-slate-50 px-5 py-3 sm:px-6 sm:py-4 border-t border-slate-100 text-slate-400 text-lg sm:text-xl text-right shrink-0 font-medium">
        {structured?.phonetic_transcription
          ? `Phonetic: "${structured.phonetic_transcription}"`
          : 'Tap text to edit'}
      </div>
    </div>
  );
};