import React, { useRef, useEffect } from 'react';

interface TranscriptionDisplayProps {
  text: string;
  onChange: (text: string) => void;
}

export const TranscriptionDisplay: React.FC<TranscriptionDisplayProps> = ({ text, onChange }) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize text area (optional, but keeping it fixed height is better for consistency on iPad)
  useEffect(() => {
    if (textareaRef.current) {
        // Focus on mount for easy editing
        textareaRef.current.focus();
    }
  }, []);

  return (
    <div className="w-full flex-1 flex flex-col bg-white rounded-3xl shadow-lg border-4 border-slate-200 overflow-hidden">
        <div className="bg-slate-100 px-4 py-3 border-b-2 border-slate-200">
             <label htmlFor="transcription" className="text-lg font-semibold text-slate-500 uppercase tracking-wider">
                Message to Speak:
             </label>
        </div>
      <textarea
        id="transcription"
        ref={textareaRef}
        value={text}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 w-full p-4 sm:p-6 text-2xl sm:text-4xl leading-tight text-slate-900 resize-none outline-none focus:bg-yellow-50 transition-colors font-medium"
        placeholder="Transcription will appear here..."
      />
      <div className="bg-slate-50 px-4 py-2 border-t border-slate-100 text-slate-400 text-sm sm:text-lg text-right">
        Tap text to edit
      </div>
    </div>
  );
};
