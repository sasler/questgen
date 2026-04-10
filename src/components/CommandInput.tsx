"use client";

import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from "react";

interface CommandInputProps {
  onSubmit: (command: string) => void;
  disabled?: boolean;
  placeholder?: string;
  commandHistory?: string[];
}

export function CommandInput({
  onSubmit,
  disabled = false,
  placeholder = "What do you do?",
  commandHistory = [],
}: CommandInputProps) {
  const [value, setValue] = useState("");
  const [historyIndex, setHistoryIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus on mount and when re-enabled
  useEffect(() => {
    if (!disabled) {
      inputRef.current?.focus();
    }
  }, [disabled]);

  const resetHistoryIndex = useCallback(() => {
    setHistoryIndex(-1);
  }, []);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const trimmed = value.trim();
      if (trimmed) {
        onSubmit(trimmed);
        setValue("");
        resetHistoryIndex();
      }
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (commandHistory.length === 0) return;
      const nextIndex = historyIndex + 1;
      if (nextIndex < commandHistory.length) {
        setHistoryIndex(nextIndex);
        setValue(commandHistory[commandHistory.length - 1 - nextIndex]);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex <= 0) {
        setHistoryIndex(-1);
        setValue("");
        return;
      }
      const nextIndex = historyIndex - 1;
      setHistoryIndex(nextIndex);
      setValue(commandHistory[commandHistory.length - 1 - nextIndex]);
      return;
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
    resetHistoryIndex();
  };

  return (
    <div className="flex w-full items-center gap-2 border-t border-green-900/50 bg-gray-950 px-4 py-3 font-mono">
      <span
        className={`select-none text-lg font-bold ${disabled ? "text-green-800" : "text-green-400"}`}
        aria-hidden="true"
      >
        &gt;
      </span>
      <input
        ref={inputRef}
        type="text"
        disabled={disabled}
        className={`flex-1 border-none bg-transparent font-mono outline-none focus:ring-0 ${
          disabled
            ? "text-green-800 placeholder-green-900"
            : "caret-green-400 text-green-300 placeholder-green-700"
        }`}
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        aria-label="Command input"
      />
      {disabled && (
        <span className="animate-pulse text-sm text-green-700">
          Processing...
        </span>
      )}
    </div>
  );
}
