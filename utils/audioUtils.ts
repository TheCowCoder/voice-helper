
/**
 * Converts a Blob to a Base64 string.
 */
export const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Remove the Data URL prefix (e.g., "data:audio/webm;base64,")
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

/**
 * Uses the Web Speech API to speak text.
 * This is free, zero-latency, and runs entirely in the browser.
 */
export const speakText = (text: string): void => {
  if (!('speechSynthesis' in window)) {
    alert("Text-to-speech is not supported in this browser.");
    return;
  }

  // Cancel any ongoing speech
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  
  // iOS/Safari usually has good default voices. 
  // We can try to select a specific English voice if available, 
  // otherwise let the OS pick the default.
  const voices = window.speechSynthesis.getVoices();
  const englishVoice = voices.find(v => v.lang.startsWith('en-US') && !v.name.includes('Google')) || 
                       voices.find(v => v.lang.startsWith('en')); // Fallback to any English

  if (englishVoice) {
    utterance.voice = englishVoice;
  }

  // Adjust rate/pitch for clarity if needed
  utterance.rate = 0.9; // Slightly slower is usually clearer
  utterance.pitch = 1.0;

  window.speechSynthesis.speak(utterance);
};