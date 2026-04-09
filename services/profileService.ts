import { UserProfile } from "../types";

export const profileService = {
  async getProfile(userId: string): Promise<UserProfile> {
    const response = await fetch(`/api/profile/${encodeURIComponent(userId)}`);
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Failed to get profile: ${response.statusText}`);
    }
    return response.json();
  },

  async updateProfile(userId: string, contextDocument: string): Promise<{ success: boolean }> {
    const response = await fetch(`/api/profile/${encodeURIComponent(userId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contextDocument }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Failed to update profile: ${response.statusText}`);
    }
    return response.json();
  },
};
