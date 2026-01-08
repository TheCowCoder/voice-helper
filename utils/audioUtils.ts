
export const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

function decodeBase64(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function createWavHeader(dataLength: number): Uint8Array {
  const sampleRate = 24000;
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const writeString = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataLength, true);
  return new Uint8Array(header);
}

export const playAudioFromBase64 = async (base64Audio: string): Promise<void> => {
  // Force iOS to use the 'playback' category (Loudspeaker) instead of 'communication' (Earpiece)
  if ('audioSession' in navigator) {
    try {
      // @ts-ignore
      await (navigator as any).audioSession.setCategory('playback');
    } catch (e) {
      console.warn(e);
    }
  }

  return new Promise((resolve, reject) => {
    try {
      const pcmData = decodeBase64(base64Audio);
      const wavHeader = createWavHeader(pcmData.length);
      const wavBlob = new Blob([wavHeader, pcmData], { type: 'audio/wav' });
      const audioUrl = URL.createObjectURL(wavBlob);
      const audio = new Audio(audioUrl);
      
      audio.volume = 1.0;
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        resolve();
      };
      audio.onerror = reject;
      audio.play().catch(reject);
    } catch (error) {
      reject(error);
    }
  });
};