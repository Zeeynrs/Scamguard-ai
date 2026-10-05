"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { ACCESS_CODE_STORAGE_KEY } from "@/lib/api";

export interface AccessCodeContextValue {
  accessCode: string | null;
  setAccessCode: (code: string) => void;
  isAuthenticated: boolean;
  showGate: () => void;
  gateOpen: boolean;
  closeGate: () => void;
  gateError: boolean;
}

const AccessCodeContext = createContext<AccessCodeContextValue>({
  accessCode: null,
  setAccessCode: () => {},
  isAuthenticated: true,
  showGate: () => {},
  gateOpen: false,
  closeGate: () => {},
  gateError: false,
});

export function AccessCodeProvider({ children }: { children: ReactNode }) {
  const [accessCode, setAccessCodeState] = useState<string | null>(null);
  const [gateOpen, setGateOpen] = useState(false);
  const [gateError, setGateError] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(ACCESS_CODE_STORAGE_KEY);
    if (stored) setAccessCodeState(stored);
  }, []);

  const setAccessCode = useCallback((code: string) => {
    window.localStorage.setItem(ACCESS_CODE_STORAGE_KEY, code);
    setAccessCodeState(code);
    setGateOpen(false);
    setGateError(false);
  }, []);

  const showGate = useCallback(() => setGateOpen(true), []);
  const closeGate = useCallback(() => setGateOpen(false), []);

  useEffect(() => {
    const handler = () => {
      // A 401 arrived: previously stored code (if any) was rejected.
      setGateError((prev) => prev || !!window.localStorage.getItem(ACCESS_CODE_STORAGE_KEY));
      setGateOpen(true);
    };
    window.addEventListener("access-code-required", handler);
    return () => window.removeEventListener("access-code-required", handler);
  }, []);

  return (
    <AccessCodeContext.Provider
      value={{ accessCode, setAccessCode, isAuthenticated: true, showGate, gateOpen, closeGate, gateError }}
    >
      {children}
    </AccessCodeContext.Provider>
  );
}

export function useAccessCode() {
  return useContext(AccessCodeContext);
}
