import React, { useRef, useEffect } from 'react';

interface TranscriptionDisplayProps {
  text: string;
  onChange: (text: string) => void;
}

export const TranscriptionDisplay: React.FC<TranscriptionDisplayProps> = ({ text, onChange }) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize text area to fit content and avoid internal scrollbars
  useEffect(() => {
    if (!textareaRef.current) return;
    const ta = textareaRef.current;
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
  }, [text]);

  useEffect(() => {
    if (textareaRef.current) textareaRef.current.focus();
  }, []);

  return (
    <div className="w-full flex-1 flex flex-col bg-white rounded-3xl shadow-lg border-4 border-slate-200 overflow-visible">
        <div className="bg-slate-100 px-6 py-4 border-b-2 border-slate-200">
             <label htmlFor="transcription" className="text-xl font-semibold text-slate-500 uppercase tracking-wider">
                Message to Speak:
             </label>
        </div>
      <textarea
        id="transcription"
        ref={textareaRef}
        value={text}
        onChange={(e) => {
          onChange(e.target.value);
          // Adjust height immediately on change so there is no internal scrollbar
          const ta = textareaRef.current;
          if (ta) {
            ta.style.height = 'auto';
            ta.style.height = ta.scrollHeight + 'px';
          }
        }}
        className="w-full p-6 text-4xl sm:text-5xl leading-tight text-slate-900 resize-none outline-none focus:bg-yellow-50 transition-colors font-medium"
        placeholder="Transcription will appear here..."
        style={{ overflow: 'hidden' }}
      />
      <div className="bg-slate-50 px-6 py-3 border-t border-slate-100 text-slate-400 text-lg text-right">
        Tap text to edit
      </div>
    </div>
  );
};
