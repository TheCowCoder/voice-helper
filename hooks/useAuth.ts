import { useState, useCallback, useEffect } from 'react';
import { UserInfo } from '../types';
import { authService } from '../services/authService';

const USER_KEY = 'voicehelper_user';

export const useAuth = () => {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore session from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(USER_KEY);
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch {
        localStorage.removeItem(USER_KEY);
      }
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (name: string, pin: string) => {
    const userInfo = await authService.login(name, pin);
    setUser(userInfo);
    localStorage.setItem(USER_KEY, JSON.stringify(userInfo));
    return userInfo;
  }, []);

  const register = useCallback(async (name: string, pin: string, role?: string) => {
    const userInfo = await authService.register(name, pin, role);
    setUser(userInfo);
    localStorage.setItem(USER_KEY, JSON.stringify(userInfo));
    return userInfo;
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem(USER_KEY);
  }, []);

  return { user, loading, login, register, logout };
};
