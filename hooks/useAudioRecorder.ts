
import { useState, useRef, useCallback } from 'react';

export const useAudioRecorder = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [permissionError, setPermissionError] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const startRecording = useCallback(async () => {
    try {
      // Disable browser audio processing — Gemini handles it better with raw audio
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        }
      });

      // Web Audio preprocessing chain for dysarthric speech
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);

      // Boost quiet speech by +6dB
      const gainNode = audioCtx.createGain();
      gainNode.gain.value = 2.0; // ~+6dB

      // Compress dynamic range — dysarthric speech has dramatic volume variation
      const compressor = audioCtx.createDynamicsCompressor();
      compressor.threshold.value = -30;
      compressor.ratio.value = 4;
      compressor.knee.value = 10;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;

      // Route: source → gain → compressor → destination
      const destination = audioCtx.createMediaStreamDestination();
      source.connect(gainNode);
      gainNode.connect(compressor);
      compressor.connect(destination);

      streamRef.current = stream; // Keep original stream ref to release mic

      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const mediaRecorder = new MediaRecorder(destination.stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mediaRecorder.start();
      setIsRecording(true);
      setPermissionError(false);
    } catch (err) {
      setPermissionError(true);
    }
  }, []);

  const stopRecording = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const mediaRecorder = mediaRecorderRef.current;
      if (!mediaRecorder || mediaRecorder.state === 'inactive') return resolve(null);

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType });
        
        // RELEASE THE MIC: This allows iOS to return to loud "Playback Mode"
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }

        // Close AudioContext
        if (audioCtxRef.current) {
          audioCtxRef.current.close().catch(() => {});
          audioCtxRef.current = null;
        }
        
        setIsRecording(false);
        resolve(blob);
      };
      mediaRecorder.stop();
    });
  }, []);

  return { isRecording, startRecording, stopRecording, permissionError };
};