import React, { useState, useRef, useEffect } from 'react';

interface WordPillsProps {
  text: string;
  alternatives?: string[];
  onCorrection: (original: string, corrected: string) => void;
}

// Generate word-level swap suggestions from full-phrase alternatives
function getWordSuggestions(word: string, wordIndex: number, alternatives: string[]): string[] {
  const seen = new Set<string>([word.toLowerCase()]);
  const suggestions: string[] = [];
  for (const alt of alternatives) {
    const altWords = alt.split(/\s+/).filter(Boolean);
    if (altWords[wordIndex] && !seen.has(altWords[wordIndex].toLowerCase())) {
      seen.add(altWords[wordIndex].toLowerCase());
      suggestions.push(altWords[wordIndex]);
    }
  }
  return suggestions;
}

export const WordPills: React.FC<WordPillsProps> = ({ text, alternatives = [], onCorrection }) => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const words = text.split(/\s+/).filter(Boolean);

  const handleTap = (index: number) => {
    if (selectedIndex === index && !isEditing) {
      // Second tap = open edit mode
      setIsEditing(true);
      setEditValue(words[index]);
    } else {
      setSelectedIndex(index);
      setIsEditing(false);
      setEditValue('');
    }
  };

  const handleSwap = (original: string, replacement: string) => {
    onCorrection(original, replacement);
    setSelectedIndex(null);
    setIsEditing(false);
  };

  const handleEditConfirm = () => {
    if (selectedIndex === null) return;
    const original = words[selectedIndex];
    const corrected = editValue.trim();
    if (corrected && corrected !== original) {
      onCorrection(original, corrected);
    }
    setSelectedIndex(null);
    setIsEditing(false);
    setEditValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleEditConfirm();
    if (e.key === 'Escape') { setSelectedIndex(null); setIsEditing(false); setEditValue(''); }
  };

  // Select all text when edit mode activates
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.setSelectionRange(0, inputRef.current.value.length);
    }
  }, [isEditing]);

  const wordSuggestions = selectedIndex !== null
    ? getWordSuggestions(words[selectedIndex], selectedIndex, alternatives)
    : [];

  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-wrap gap-3 sm:gap-4">
        {words.map((word, i) => (
          <button
            key={i}
            onClick={() => handleTap(i)}
            className={`
              px-5 py-3 sm:px-7 sm:py-4 text-2xl sm:text-3xl rounded-2xl font-bold transition-all cursor-pointer
              ${selectedIndex === i
                ? 'bg-yellow-200 border-3 border-yellow-500 text-yellow-900 shadow-lg scale-105'
                : 'bg-slate-100 border-3 border-transparent hover:bg-yellow-50 hover:border-yellow-300 text-slate-700'}
            `}
          >
            {word}
          </button>
        ))}
      </div>

      {/* Inline swap suggestions for selected word */}
      {selectedIndex !== null && !isEditing && (
        <div className="mt-4 sm:mt-6 flex flex-wrap items-center gap-3 sm:gap-4">
          <span className="text-xl sm:text-2xl text-slate-500 font-semibold">Replace with:</span>
          {wordSuggestions.map((sug, i) => (
            <button
              key={i}
              onClick={() => handleSwap(words[selectedIndex], sug)}
              className="px-5 py-3 sm:px-7 sm:py-4 text-2xl sm:text-3xl rounded-2xl bg-blue-100 hover:bg-blue-200 border-3 border-blue-300 text-blue-800 font-bold transition-all"
            >
              {sug}
            </button>
          ))}
          <button
            onClick={() => { setIsEditing(true); setEditValue(words[selectedIndex]); }}
            className="px-5 py-3 sm:px-7 sm:py-4 text-2xl sm:text-3xl rounded-2xl bg-white hover:bg-slate-50 border-3 border-dashed border-slate-300 text-slate-500 font-bold transition-all"
          >
            Type custom...
          </button>
        </div>
      )}

      {/* Edit input */}
      {selectedIndex !== null && isEditing && (
        <div className="mt-4 sm:mt-6 flex items-center gap-3 sm:gap-4">
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleEditConfirm}
            onKeyDown={handleKeyDown}
            className="px-5 py-3 sm:px-7 sm:py-4 text-2xl sm:text-3xl rounded-2xl border-3 border-blue-400 bg-blue-50 outline-none font-bold flex-1 min-w-0"
          />
          <button
            onClick={handleEditConfirm}
            className="px-5 py-3 sm:px-7 sm:py-4 text-2xl sm:text-3xl rounded-2xl bg-green-500 hover:bg-green-600 text-white font-bold transition-colors shrink-0"
          >
            ✓
          </button>
        </div>
      )}
    </div>
  );
};
