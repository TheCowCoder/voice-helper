--- START OF FILE utils__audioUtils.ts ---

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
 * Creates a standard WAV header for the raw PCM data.
 * Gemini 2.0 Flash Exp defaults to: 24000Hz, 1 Channel, 16-bit PCM.
 */
function createWavHeader(dataLength: number, sampleRate: number = 24000): Uint8Array {
  const numChannels = 1;
  const bitsPerSample = 16;
  
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const headerSize = 44;
  const wavLength = headerSize + dataLength;

  const buffer = new ArrayBuffer(headerSize);
  const view = new DataView(buffer);

  // RIFF identifier
  writeString(view, 0, 'RIFF');
  // RIFF chunk length
  view.setUint32(4, 36 + dataLength, true);
  // RIFF type
  writeString(view, 8, 'WAVE');
  // format chunk identifier
  writeString(view, 12, 'fmt ');
  // format chunk length
  view.setUint32(16, 16, true);
  // sample format (raw)
  view.setUint16(20, 1, true);
  // channel count
  view.setUint16(22, numChannels, true);
  // sample rate
  view.setUint32(24, sampleRate, true);
  // byte rate (sample rate * block align)
  view.setUint32(28, byteRate, true);
  // block align (channel count * bytes per sample)
  view.setUint16(32, blockAlign, true);
  // bits per sample
  view.setUint16(34, bitsPerSample, true);
  // data chunk identifier
  writeString(view, 36, 'data');
  // data chunk length
  view.setUint32(40, dataLength, true);

  return new Uint8Array(buffer);
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Plays Audio.
 * Converts Raw PCM -> WAV -> Blob -> HTML5 Audio Element.
 * This ensures iOS plays it on the Loudspeaker (Media Volume) instead of the Earpiece.
 */
export const playAudioFromBase64 = (base64Audio: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    try {
      // 1. Decode the Raw PCM data
      const pcmData = decodeBase64(base64Audio);

      // 2. Add a WAV header so the browser treats it as a media file
      const wavHeader = createWavHeader(pcmData.length, 24000); // Gemini is 24kHz
      
      // 3. Combine header and data into a Blob
      const wavBlob = new Blob([wavHeader, pcmData], { type: 'audio/wav' });
      const audioUrl = URL.createObjectURL(wavBlob);

      // 4. Play using standard HTML5 Audio (Routes to Loudspeaker)
      const audio = new Audio(audioUrl);
      
      // Safety: iOS requires volume to be set, though usually it's read-only on hardware
      audio.volume = 1.0; 

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl); // Cleanup memory
        resolve();
      };

      audio.onerror = (e) => {
        console.error("Audio playback error", e);
        URL.revokeObjectURL(audioUrl);
        reject(new Error("Playback failed"));
      };

      audio.play().catch(err => {
        console.error("Play prevented by browser:", err);
        reject(err);
      });

    } catch (error) {
      console.error("Error preparing audio:", error);
      reject(error);
    }
  });
};