'use client';

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'ontologizer-api-keys';

export interface ApiKeys {
  openaiKey: string;
  googleKgKey: string;
  geminiKey: string;
}

const emptyKeys: ApiKeys = {
  openaiKey: '',
  googleKgKey: '',
  geminiKey: '',
};

export function useApiKeys() {
  const [keys, setKeys] = useState<ApiKeys>(emptyKeys);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setKeys(JSON.parse(stored));
      }
    } catch {
      // localStorage not available or corrupted
    }
    setLoaded(true);
  }, []);

  const saveKeys = useCallback((newKeys: ApiKeys) => {
    setKeys(newKeys);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newKeys));
    } catch {
      // localStorage not available
    }
  }, []);

  const clearKeys = useCallback(() => {
    setKeys(emptyKeys);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // localStorage not available
    }
  }, []);

  const hasAnyKey = keys.openaiKey || keys.googleKgKey || keys.geminiKey;

  // Headers to send with API requests
  const apiHeaders: Record<string, string> = {};
  if (keys.openaiKey) apiHeaders['X-OpenAI-Key'] = keys.openaiKey;
  if (keys.googleKgKey) apiHeaders['X-Google-KG-Key'] = keys.googleKgKey;
  if (keys.geminiKey) apiHeaders['X-Gemini-Key'] = keys.geminiKey;

  return { keys, saveKeys, clearKeys, hasAnyKey, apiHeaders, loaded };
}
