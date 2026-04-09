import React from 'react';
import { Mic, Square } from 'lucide-react';

interface RecordButtonProps {
  isRecording: boolean;
  onClick: () => void;
  disabled?: boolean;
}

export const RecordButton: React.FC<RecordButtonProps> = ({ isRecording, onClick, disabled }) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        relative group flex items-center justify-center
        w-56 h-56 sm:w-72 sm:h-72 rounded-full shadow-2xl transition-all duration-300 transform active:scale-95
        ${disabled ? 'opacity-50 cursor-not-allowed bg-gray-200' : ''}
        ${isRecording 
          ? 'bg-red-500 hover:bg-red-600 animate-pulse' 
          : 'bg-blue-600 hover:bg-blue-700'}
      `}
      aria-label={isRecording ? "Stop Recording" : "Start Recording"}
    >
      {/* Outer Ring for visibility */}
      <div className={`absolute -inset-5 rounded-full border-4 ${isRecording ? 'border-red-200' : 'border-blue-100'} opacity-50`}></div>
      
      <div className="flex flex-col items-center text-white">
        {isRecording ? (
          <>
            <Square className="w-24 h-24 sm:w-28 sm:h-28" fill="currentColor" />
            <span className="mt-3 text-4xl sm:text-5xl font-bold uppercase tracking-widest">Stop</span>
          </>
        ) : (
          <>
            <Mic className="w-24 h-24 sm:w-28 sm:h-28" />
            <span className="mt-3 text-4xl sm:text-5xl font-bold uppercase tracking-widest">Record</span>
          </>
        )}
      </div>
    </button>
  );
};
