import React from 'react';
import { X } from 'lucide-react';

interface DebugEntry {
  stage: string;
  systemInstruction?: string;
  prompt?: string;
  audioReferences?: {
    transcript: string;
    heard: string | null;
    mimeType: string;
    audioSizeKB: number;
    transcriptionLog?: {
      phonetic?: string | null;
      stage1Thinking?: string | null;
      stage2Thinking?: string | null;
      alternatives?: string[];
      confidence?: number | null;
    } | null;
  }[];
  audioRefCount?: number;
  rawResponse?: string;
  thinking?: string;
}

interface DebugModalProps {
  entries: DebugEntry[];
  onClose: () => void;
}

export const DebugModal: React.FC<DebugModalProps> = ({ entries, onClose }) => {
  if (entries.length === 0) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-3xl shadow-2xl max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <h2 className="text-2xl font-bold text-slate-800">Debug: Transcription Pipeline</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X className="w-6 h-6 text-slate-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {entries.map((entry, i) => (
            <div key={i} className="space-y-3">
              <h3 className="text-xl font-bold text-blue-600 uppercase tracking-wider">{entry.stage}</h3>

              {entry.audioRefCount !== undefined && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <p className="text-sm font-bold text-amber-700 mb-2">
                    Audio References: {entry.audioRefCount} recordings included
                  </p>
                  {entry.audioReferences && entry.audioReferences.length > 0 && (
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {entry.audioReferences.map((ref, j) => (
                        <div key={j} className="text-xs text-amber-800 font-mono bg-amber-100 rounded px-2 py-1">
                          [{ref.audioSizeKB}KB {ref.mimeType}] transcript=&quot;{ref.transcript}&quot;
                          {ref.heard && <> heard=&quot;{ref.heard}&quot;</>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {entry.audioReferences?.some(ref => ref.transcriptionLog) && (
                <details>
                  <summary className="cursor-pointer text-sm font-bold text-amber-700 hover:text-amber-900">
                    Reference Transcription Logs / Thoughts
                  </summary>
                  <div className="mt-2 space-y-3 max-h-72 overflow-y-auto rounded-xl bg-amber-50 p-4">
                    {entry.audioReferences
                      .filter(ref => ref.transcriptionLog)
                      .map((ref, j) => (
                        <div key={j} className="rounded-xl border border-amber-200 bg-white p-3">
                          <div className="text-xs font-bold text-amber-700">
                            Reference {j + 1}: transcript=&quot;{ref.transcript}&quot;
                          </div>
                          {ref.transcriptionLog?.phonetic && (
                            <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-700 font-mono">
                              Phonetic\n{ref.transcriptionLog.phonetic}
                            </pre>
                          )}
                          {ref.transcriptionLog?.stage1Thinking && (
                            <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-purple-50 p-3 text-xs text-slate-700 font-mono">
                              Stage 1 Reasoning\n{ref.transcriptionLog.stage1Thinking}
                            </pre>
                          )}
                          {ref.transcriptionLog?.stage2Thinking && (
                            <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-indigo-50 p-3 text-xs text-slate-700 font-mono">
                              Stage 2 Reasoning\n{ref.transcriptionLog.stage2Thinking}
                            </pre>
                          )}
                          {ref.transcriptionLog?.alternatives && ref.transcriptionLog.alternatives.length > 0 && (
                            <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-blue-50 p-3 text-xs text-slate-700 font-mono">
                              Alternatives\n{JSON.stringify(ref.transcriptionLog.alternatives, null, 2)}
                            </pre>
                          )}
                          {ref.transcriptionLog?.confidence !== null && ref.transcriptionLog?.confidence !== undefined && (
                            <div className="mt-2 text-xs font-semibold text-slate-500">
                              Stored confidence: {Math.round(ref.transcriptionLog.confidence * 100)}%
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                </details>
              )}

              {entry.systemInstruction && (
                <details>
                  <summary className="cursor-pointer text-sm font-bold text-slate-500 hover:text-slate-700">
                    System Instruction
                  </summary>
                  <pre className="mt-2 bg-slate-50 rounded-xl p-4 text-xs text-slate-700 overflow-x-auto whitespace-pre-wrap max-h-60 overflow-y-auto font-mono">
                    {entry.systemInstruction}
                  </pre>
                </details>
              )}

              {entry.prompt && (
                <details open>
                  <summary className="cursor-pointer text-sm font-bold text-slate-500 hover:text-slate-700">
                    Prompt
                  </summary>
                  <pre className="mt-2 bg-blue-50 rounded-xl p-4 text-xs text-slate-700 overflow-x-auto whitespace-pre-wrap max-h-60 overflow-y-auto font-mono">
                    {entry.prompt}
                  </pre>
                </details>
              )}

              {entry.thinking && (
                <details open>
                  <summary className="cursor-pointer text-sm font-bold text-purple-600 hover:text-purple-800">
                    🧠 Thinking / Reasoning
                  </summary>
                  <pre className="mt-2 bg-purple-50 rounded-xl p-4 text-xs text-slate-700 overflow-x-auto whitespace-pre-wrap max-h-60 overflow-y-auto font-mono">
                    {entry.thinking}
                  </pre>
                </details>
              )}

              {entry.rawResponse && (
                <details open>
                  <summary className="cursor-pointer text-sm font-bold text-slate-500 hover:text-slate-700">
                    Raw Response
                  </summary>
                  <pre className="mt-2 bg-green-50 rounded-xl p-4 text-xs text-slate-700 overflow-x-auto whitespace-pre-wrap max-h-60 overflow-y-auto font-mono">
                    {entry.rawResponse}
                  </pre>
                </details>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
