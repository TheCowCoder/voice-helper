
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

        // Strong American male preference list
        const preferredUSMaleVoices = [
            'Alex',
            'Tom',
            'Aaron',
            'Eddy',
            'Fred',
        ];

        // 1. Try exact American male voices
        let selectedVoice =
            voices.find(v =>
                preferredUSMaleVoices.some(name => v.name.includes(name)) &&
                v.lang === 'en-US'
            ) ||

            // 2. Any en-US local (usually higher quality)
            voices.find(v =>
                v.lang === 'en-US' && v.localService === true
            ) ||

            // 3. Any en-US at all
            voices.find(v =>
                v.lang === 'en-US'
            );

        // Final fallback (should rarely happen)
        if (!selectedVoice) {
            selectedVoice = voices.find(v => v.lang.startsWith('en'));
        }

        if (selectedVoice) {
            utterance.voice = selectedVoice;
            utterance.rate = 0.95;
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