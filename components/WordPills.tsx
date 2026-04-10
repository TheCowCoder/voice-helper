import React, { useState, useRef, useEffect } from 'react';

interface WordPillsProps {
  text: string;
  alternatives?: string[];
  onCorrection: (original: string, corrected: string, wordIndex?: number) => void;
  onTextChange?: (text: string) => void;
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

export const WordPills: React.FC<WordPillsProps> = ({ text, alternatives = [], onCorrection, onTextChange }) => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [sentenceValue, setSentenceValue] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isSentenceEditing, setIsSentenceEditing] = useState(false);
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
    onCorrection(original, replacement, selectedIndex ?? undefined);
    setSelectedIndex(null);
    setIsEditing(false);
  };

  const handleEditConfirm = () => {
    if (selectedIndex === null) return;
    const original = words[selectedIndex];
    const corrected = editValue.trim();
    if (corrected && corrected !== original) {
      onCorrection(original, corrected, selectedIndex);
    }
    setSelectedIndex(null);
    setIsEditing(false);
    setEditValue('');
  };

  const handleSentenceConfirm = () => {
    const nextText = sentenceValue.trim().replace(/\s+/g, ' ');
    if (nextText && nextText !== text) {
      onTextChange?.(nextText);
    }
    setIsSentenceEditing(false);
    setSentenceValue('');
    setSelectedIndex(null);
    setIsEditing(false);
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
    <div className="p-5 sm:p-6 space-y-5 sm:space-y-6">
      <div className="rounded-[28px] border border-slate-200 bg-slate-50 px-4 py-5 sm:px-6 sm:py-6">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-3">
          {words.map((word, i) => (
            <button
              key={i}
              onClick={() => handleTap(i)}
              className={`
                rounded-xl px-2 py-1 text-3xl sm:text-4xl font-semibold leading-none transition-colors
                ${selectedIndex === i
                  ? 'bg-yellow-200 text-yellow-950 shadow-sm'
                  : 'text-slate-800 hover:bg-yellow-50'}
              `}
            >
              {word}
            </button>
          ))}
        </div>
      </div>

      {selectedIndex !== null && !isEditing && (
        <div className="space-y-3">
          <div className="text-lg sm:text-xl font-semibold uppercase tracking-wide text-slate-400">
            Replace word
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {wordSuggestions.map((sug, i) => (
              <button
                key={i}
                onClick={() => handleSwap(words[selectedIndex], sug)}
                className="rounded-xl bg-blue-100 px-3 py-2 text-2xl sm:text-3xl font-semibold text-blue-800 transition-colors hover:bg-blue-200"
              >
                {sug}
              </button>
            ))}
            <button
              onClick={() => { setIsEditing(true); setEditValue(words[selectedIndex]); }}
              className="rounded-xl border border-dashed border-slate-300 bg-white px-3 py-2 text-2xl sm:text-3xl font-semibold text-slate-500 transition-colors hover:bg-slate-50"
            >
              Type custom
            </button>
          </div>
        </div>
      )}

      {selectedIndex !== null && isEditing && (
        <div className="flex items-center gap-3 sm:gap-4">
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleEditConfirm}
            onKeyDown={handleKeyDown}
            className="min-w-0 flex-1 rounded-2xl border-2 border-blue-400 bg-blue-50 px-4 py-3 text-2xl sm:text-3xl font-semibold outline-none"
          />
          <button
            onClick={handleEditConfirm}
            className="shrink-0 rounded-2xl bg-green-500 px-4 py-3 text-2xl sm:text-3xl font-bold text-white transition-colors hover:bg-green-600"
          >
            Save
          </button>
        </div>
      )}

      {onTextChange && !isSentenceEditing && (
        <button
          onClick={() => {
            setSentenceValue(text);
            setIsSentenceEditing(true);
            setSelectedIndex(null);
            setIsEditing(false);
          }}
          className="text-xl sm:text-2xl font-semibold text-slate-500 transition-colors hover:text-slate-700"
        >
          Edit sentence
        </button>
      )}

      {onTextChange && isSentenceEditing && (
        <div className="space-y-3">
          <textarea
            value={sentenceValue}
            onChange={(e) => setSentenceValue(e.target.value)}
            rows={3}
            className="w-full resize-none rounded-3xl border-2 border-slate-200 bg-white px-5 py-4 text-2xl sm:text-3xl font-medium text-slate-900 outline-none focus:border-blue-300"
          />
          <div className="flex items-center gap-3">
            <button
              onClick={handleSentenceConfirm}
              className="rounded-2xl bg-slate-900 px-4 py-3 text-xl sm:text-2xl font-semibold text-white transition-colors hover:bg-slate-700"
            >
              Save sentence
            </button>
            <button
              onClick={() => {
                setIsSentenceEditing(false);
                setSentenceValue('');
              }}
              className="rounded-2xl bg-slate-200 px-4 py-3 text-xl sm:text-2xl font-semibold text-slate-700 transition-colors hover:bg-slate-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
