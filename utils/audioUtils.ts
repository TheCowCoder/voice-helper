
/**
 * Converts a Blob to a Base64 string.
 */
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

// Helper to force iOS audio routing to the main speaker
const wakeUpAudioContext = () => {
  const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
  if (AudioContext) {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    // Completely silent
    gain.gain.value = 0;
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start(0);
    osc.stop(0.1);
    
    // Allow the context to close to free resources
    setTimeout(() => {
        ctx.close();
    }, 200);
  }
};

/**
 * Uses the Web Speech API to speak text.
 */
export const speakText = (text: string): void => {
  if (!('speechSynthesis' in window)) {
    alert("Text-to-speech is not supported in this browser.");
    return;
  }

  // 1. Force Audio Output to Main Speaker (Fixes "Muffled" sound)
  wakeUpAudioContext();

  // 2. Cancel existing speech
  window.speechSynthesis.cancel();

  // 3. Wait for voices to load (iOS loads them asynchronously)
  const speak = () => {
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();

    // Priority list for clearer voices on iOS/Mac
    // "Daniel" is usually the best installed English voice on iOS.
    // "Ava" is the new premium one.
    // "Samantha" is the default.
    const preferredVoices = ['Daniel', 'Ava', 'Arthur', 'Gordon', 'Samantha'];
    
    let selectedVoice = null;

    // Try to find a preferred voice
    for (const name of preferredVoices) {
      selectedVoice = voices.find(v => v.name.includes(name) && v.lang.startsWith('en'));
      if (selectedVoice) break;
    }

    // Fallback to any high-quality English voice
    if (!selectedVoice) {
      selectedVoice = voices.find(v => v.lang.startsWith('en') && v.localService === true); 
    }
    
    // Ultimate fallback
    if (!selectedVoice) {
      selectedVoice = voices.find(v => v.lang.startsWith('en'));
    }

    if (selectedVoice) {
      utterance.voice = selectedVoice;
      // iOS voices sometimes sound better slightly slower
      utterance.rate = 0.9; 
      utterance.pitch = 1.0;
    }

    window.speechSynthesis.speak(utterance);
  };

  // iOS Safari sometimes returns empty voices list initially.
  if (window.speechSynthesis.getVoices().length === 0) {
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.onvoiceschanged = null; // Run once
      speak();
    };
  } else {
    speak();
  }
};