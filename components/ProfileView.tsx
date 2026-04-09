import React, { useState, useEffect } from 'react';
import { Save, Loader2, LogOut, ChevronDown, ChevronUp } from 'lucide-react';
import { profileService } from '../services/profileService';
import { UserInfo, WhoIAm } from '../types';

interface ProfileViewProps {
  user: UserInfo;
  onClose: () => void;
  onLogout: () => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({ user, onClose, onLogout }) => {
  const [contextDocument, setContextDocument] = useState('');
  const [correctionCount, setCorrectionCount] = useState(0);
  const [whoIAm, setWhoIAm] = useState<WhoIAm | null>(null);
  const [showWhoIAm, setShowWhoIAm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const profile = await profileService.getProfile(user._id);
        setContextDocument(profile.contextDocument);
        setCorrectionCount(profile.correctionCount);
        setWhoIAm(profile.whoIAm || null);
      } catch (err) {
        console.error("Failed to load profile:", err);
      }
      setLoading(false);
    };
    load();
  }, [user._id]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await profileService.updateProfile(user._id, contextDocument);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("Failed to save profile:", err);
    }
    setSaving(false);
  };

  const renderWhoIAmSection = (title: string, content?: string) => {
    if (!content) return null;
    return (
      <div className="mb-4">
        <h4 className="text-lg sm:text-xl font-bold text-slate-600 mb-1">{title}</h4>
        <pre className="text-base sm:text-lg text-slate-700 whitespace-pre-wrap font-sans leading-relaxed bg-slate-50 rounded-xl p-3 sm:p-4 border border-slate-200">{content}</pre>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full p-5 sm:p-8 gap-5 sm:gap-8">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between">
        <div>
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-800">{user.name}</h2>
          <button
            onClick={() => setShowWhoIAm(prev => !prev)}
            className="text-xl sm:text-2xl text-slate-500 hover:text-slate-700 transition-colors flex items-center gap-1"
          >
            {correctionCount} correction{correctionCount !== 1 ? 's' : ''} saved
            {whoIAm && (showWhoIAm ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />)}
          </button>
        </div>
        <div className="flex gap-3 sm:gap-4">
          <button
            onClick={onLogout}
            className="flex items-center gap-2 sm:gap-3 px-5 py-3 sm:px-7 sm:py-4 rounded-2xl text-xl sm:text-2xl font-bold text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors"
          >
            <LogOut className="w-7 h-7 sm:w-8 sm:h-8" /> Sign Out
          </button>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-700 text-2xl sm:text-3xl font-bold px-3"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Who-I-Am viewer (hidden behind corrections count tap) */}
      {showWhoIAm && whoIAm && (
        <div className="shrink-0 bg-white rounded-2xl border-2 border-purple-200 p-5 sm:p-6 max-h-72 overflow-y-auto">
          <h3 className="text-2xl sm:text-3xl font-bold text-purple-700 mb-4">AI Memory</h3>
          {renderWhoIAmSection('Personality', whoIAm.personality)}
          {renderWhoIAmSection('Interests', whoIAm.interests)}
          {renderWhoIAmSection('Personal Connections', whoIAm.personalConnections)}
          {renderWhoIAmSection('Memories', whoIAm.memories)}
          {!whoIAm.personality && !whoIAm.interests && !whoIAm.personalConnections && !whoIAm.memories && (
            <p className="text-lg sm:text-xl text-slate-400 italic">No memories yet. Chat with the AI to build them!</p>
          )}
        </div>
      )}

      {/* Context document editor */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <label className="text-xl sm:text-2xl font-bold text-slate-600">
            Context Document
          </label>
          <span className="text-lg sm:text-xl text-slate-400">
            This info helps the AI understand {user.name.split(' ')[0]}
          </span>
        </div>
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-12 h-12 text-slate-400 animate-spin" />
          </div>
        ) : (
          <textarea
            value={contextDocument}
            onChange={(e) => setContextDocument(e.target.value)}
            className="flex-1 w-full p-5 sm:p-6 text-lg sm:text-xl font-mono leading-relaxed rounded-2xl border-2 border-slate-200 focus:border-blue-400 outline-none resize-none bg-white"
            placeholder="Context about the user (Markdown format)..."
          />
        )}
      </div>

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={saving || loading}
        className={`
          shrink-0 flex items-center justify-center gap-3 sm:gap-4 w-full py-5 sm:py-7 rounded-2xl font-bold text-2xl sm:text-3xl transition-all
          ${saved
            ? 'bg-green-500 text-white'
            : 'bg-blue-600 hover:bg-blue-700 text-white'}
          disabled:opacity-50
        `}
      >
        {saving ? (
          <><Loader2 className="w-8 h-8 sm:w-9 sm:h-9 animate-spin" /> Saving...</>
        ) : saved ? (
          <><Save className="w-8 h-8 sm:w-9 sm:h-9" /> Saved!</>
        ) : (
          <><Save className="w-8 h-8 sm:w-9 sm:h-9" /> Save Changes</>
        )}
      </button>
    </div>
  );
};
