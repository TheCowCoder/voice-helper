import { useState, useRef, useCallback, useEffect } from 'react';

interface UseAudioRecorderReturn {
  isRecording: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<Blob | null>;
  permissionError: boolean;
}

export const useAudioRecorder = (): UseAudioRecorderReturn => {
  const [isRecording, setIsRecording] = useState(false);
  const [permissionError, setPermissionError] = useState(false);
  const [permissionState, setPermissionState] = useState<'granted' | 'denied' | 'prompt' | 'unknown'>('unknown');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // On mount, query permission status if available and persist change
  useEffect(() => {
    let statusObj: PermissionStatus | null = null;
    const check = async () => {
      try {
        if ((navigator as any).permissions && (navigator as any).permissions.query) {
          statusObj = await (navigator as any).permissions.query({ name: 'microphone' });
          setPermissionState(statusObj.state ?? 'unknown');
          statusObj.onchange = () => setPermissionState(statusObj?.state ?? 'unknown');
        } else {
          const stored = localStorage.getItem('micPermission');
          if (stored === 'granted') setPermissionState('granted');
        }
      } catch (e) {
        // ignore - permissions API not supported
      }
    };
    check();
    return () => {
      if (statusObj) statusObj.onchange = null;
    };
  }, []);

  const startRecording = useCallback(async () => {
    try {
      // If known denied, short-circuit and show error instead of causing another prompt
      if (permissionState === 'denied') {
        setPermissionError(true);
        throw new Error('Microphone permission denied');
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Save that user granted permission so some browsers host UIs can be less aggressive
      try { localStorage.setItem('micPermission', 'granted'); } catch (e) {}
      setPermissionState('granted');
      setPermissionError(false);

      // Determine supported mime type
      let mimeType = 'audio/webm';
      if (MediaRecorder.isTypeSupported('audio/webm')) {
        mimeType = 'audio/webm';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4';
      }

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setPermissionError(false);
    } catch (err: any) {
      console.error("Error accessing microphone:", err);
      setPermissionError(true);
      if (err && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) {
        try { localStorage.setItem('micPermission', 'denied'); } catch (e) {}
        setPermissionState('denied');
      }
    }
  }, [permissionState]);

  const stopRecording = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const mediaRecorder = mediaRecorderRef.current;
      if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        resolve(null);
        return;
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType });
        // Stop all tracks to release microphone
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
        setIsRecording(false);
        resolve(blob);
      };

      mediaRecorder.stop();
    });
  }, []);

  return {
    isRecording,
    startRecording,
    stopRecording,
    permissionError,
  };
};
