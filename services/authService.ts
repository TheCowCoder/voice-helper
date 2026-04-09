import { UserInfo } from "../types";

export const authService = {
  async register(name: string, pin: string, role?: string): Promise<UserInfo> {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, pin, role }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Registration failed: ${response.statusText}`);
    }
    return response.json();
  },

  async login(name: string, pin: string): Promise<UserInfo> {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, pin }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Login failed: ${response.statusText}`);
    }
    return response.json();
  },
};
