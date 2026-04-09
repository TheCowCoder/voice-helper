import React from 'react';
import { Mic, MessageCircle, Settings2, User } from 'lucide-react';
import { AppMode } from '../types';

interface ModeSelectorProps {
  mode: AppMode;
  onChange: (mode: AppMode) => void;
  onProfileClick: () => void;
}

const modes: { key: AppMode; label: string; icon: React.ReactNode }[] = [
  { key: 'transcribe', label: 'Transcribe', icon: <Mic className="w-8 h-8 sm:w-9 sm:h-9" /> },
  { key: 'chat', label: 'Chat AI', icon: <MessageCircle className="w-8 h-8 sm:w-9 sm:h-9" /> },
  { key: 'calibrate', label: 'Train', icon: <Settings2 className="w-8 h-8 sm:w-9 sm:h-9" /> },
];

export const ModeSelector: React.FC<ModeSelectorProps> = ({ mode, onChange, onProfileClick }) => {
  return (
    <div className="flex items-center gap-2 sm:gap-3 bg-slate-100 rounded-2xl p-2 sm:p-3">
      {modes.map(m => (
        <button
          key={m.key}
          onClick={() => onChange(m.key)}
          className={`
            flex items-center gap-2 sm:gap-3 px-4 py-3 sm:px-6 sm:py-4 rounded-xl text-base sm:text-xl font-bold transition-all
            ${mode === m.key
              ? 'bg-white text-blue-600 shadow-md'
              : 'text-slate-500 hover:text-slate-700'}
          `}
        >
          {m.icon}
          <span>{m.label}</span>
        </button>
      ))}
      <button
        onClick={onProfileClick}
        className="ml-auto flex items-center gap-2 sm:gap-3 px-4 py-3 sm:px-6 sm:py-4 rounded-xl text-base sm:text-xl font-bold text-slate-500 hover:text-slate-700 transition-all"
      >
        <User className="w-8 h-8 sm:w-9 sm:h-9" />
        <span>Profile</span>
      </button>
    </div>
  );
};
