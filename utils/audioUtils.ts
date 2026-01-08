
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

/**
 * Decodes a base64 string into a Uint8Array.
 */
function decodeBase64(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Plays PCM or WAV audio data from a base64 string.
 * This handles the raw 24kHz PCM data that Gemini returns.
 */
export const playAudioFromBase64 = async (base64Audio: string): Promise<void> => {
  try {
    // 1. Initialize Audio Context (Standard or Webkit for iOS)
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const audioContext = new AudioContextClass({ sampleRate: 24000 }); // Gemini defaults to 24kHz
    
    // 2. Decode Base64
    const byteData = decodeBase64(base64Audio);

    // 3. Helper to decode raw PCM if standard decoding fails
    // Gemini often sends raw PCM without WAV headers
    const decodePCM = (data: Uint8Array, ctx: AudioContext) => {
        const dataInt16 = new Int16Array(data.buffer, data.byteOffset, data.byteLength / 2);
        const frameCount = dataInt16.length;
        const buffer = ctx.createBuffer(1, frameCount, 24000);
        const channelData = buffer.getChannelData(0);
        
        for (let i = 0; i < frameCount; i++) {
            // Convert Int16 to Float32
            channelData[i] = dataInt16[i] / 32768.0;
        }
        return buffer;
    };

    let audioBuffer: AudioBuffer;

    try {
        // Try standard decoding (works if Gemini sends WAV header)
        // Copy buffer to avoid detached array issues
        const bufferCopy = byteData.buffer.slice(byteData.byteOffset, byteData.byteOffset + byteData.byteLength);
        audioBuffer = await audioContext.decodeAudioData(bufferCopy);
    } catch (e) {
        console.log("Standard decode failed, assuming raw PCM...");
        audioBuffer = decodePCM(byteData, audioContext);
    }

    // 4. Play
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    source.start(0);

    return new Promise((resolve) => {
      source.onended = () => {
        source.disconnect();
        audioContext.close(); // Clean up to save memory/battery
        resolve();
      };
    });

  } catch (error) {
    console.error("Error playing audio:", error);
    throw error;
  }
};