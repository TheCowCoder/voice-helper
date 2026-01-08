
export const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

/**
 * Plays a Base64 encoded MP3 string using HTML5 Audio.
 * This guarantees audio routes to the correct speaker on iOS.
 */
export const playAudioFromBase64 = (base64Audio: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    try {
      // Create an audio element
      const audio = new Audio(`data:audio/mp3;base64,${base64Audio}`);
      
      // iOS requires user interaction to play audio. 
      // Since this function is called inside a click handler (handlePlay), it will work.
      
      audio.onended = () => {
        resolve();
      };

      audio.onerror = (e) => {
        console.error("Audio playback error", e);
        reject(new Error("Playback failed"));
      };

      audio.play().catch(err => {
        console.error("Play prevented:", err);
        reject(err);
      });

    } catch (error) {
      reject(error);
    }
  });
};