import React, { useState } from 'react';
import { LogIn, UserPlus } from 'lucide-react';

interface LoginViewProps {
  onLogin: (name: string, pin: string) => Promise<unknown>;
  onRegister: (name: string, pin: string) => Promise<unknown>;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLogin, onRegister }) => {
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim() || !pin.trim()) {
      setError('Please enter your name and PIN.');
      return;
    }
    if (!/^\d{4}$/.test(pin)) {
      setError('PIN must be exactly 4 digits.');
      return;
    }
    setLoading(true);
    try {
      if (isRegistering) {
        await onRegister(name.trim(), pin);
      } else {
        await onLogin(name.trim(), pin);
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-slate-50 items-center justify-center p-6 sm:p-10">
      <div className="w-full max-w-xl bg-white rounded-3xl shadow-xl p-8 sm:p-12">
        <h1 className="text-4xl sm:text-5xl font-bold text-slate-800 text-center mb-3">Voice Helper</h1>
        <p className="text-slate-500 text-center mb-8 sm:mb-10 text-xl sm:text-2xl">
          {isRegistering ? 'Create your account' : 'Welcome back!'}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5 sm:gap-6">
          <div>
            <label className="block text-lg sm:text-xl font-bold text-slate-600 mb-2">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-5 py-4 sm:px-6 sm:py-5 text-2xl sm:text-3xl rounded-2xl border-2 border-slate-200 focus:border-blue-500 focus:outline-none transition-colors"
              placeholder="Satish Bhatt"
              autoComplete="name"
            />
          </div>

          <div>
            <label className="block text-lg sm:text-xl font-bold text-slate-600 mb-2">4-Digit PIN</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              className="w-full px-5 py-4 sm:px-6 sm:py-5 text-2xl sm:text-3xl tracking-[0.5em] text-center rounded-2xl border-2 border-slate-200 focus:border-blue-500 focus:outline-none transition-colors font-mono"
              placeholder="••••"
            />
          </div>

          {error && (
            <div className="text-red-600 text-lg sm:text-xl bg-red-50 rounded-2xl p-4 sm:p-5 border border-red-200 font-medium">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-3 flex items-center justify-center gap-3 sm:gap-4 w-full py-5 sm:py-7 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-2xl sm:text-3xl font-bold transition-colors disabled:opacity-50"
          >
            {loading ? (
              <div className="w-8 h-8 sm:w-9 sm:h-9 border-3 border-white border-t-transparent rounded-full animate-spin" />
            ) : isRegistering ? (
              <><UserPlus className="w-8 h-8 sm:w-9 sm:h-9" /> Create Account</>
            ) : (
              <><LogIn className="w-8 h-8 sm:w-9 sm:h-9" /> Sign In</>
            )}
          </button>
        </form>

        <button
          onClick={() => { setIsRegistering(!isRegistering); setError(''); }}
          className="mt-5 sm:mt-6 w-full text-center text-blue-600 hover:text-blue-800 text-xl sm:text-2xl font-bold"
        >
          {isRegistering ? 'Already have an account? Sign in' : "New user? Create account"}
        </button>
      </div>
    </div>
  );
};
