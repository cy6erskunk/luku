import { useState, useCallback, useEffect } from "react";
import { DEFAULT_MODELS, isModelId, isTaskId, resolveModels } from "@/lib/shared/models.js";

/**
 * Which model each task uses, remembered per account.
 *
 * Scoped by user id like the API key beside it, though for a different reason:
 * this is a preference, not a credential, and nothing leaks if it is read by
 * the wrong person. But it decides what the next scan costs whoever is signed
 * in, and on a shared browser that is not the person who chose it.
 *
 * A stored choice is filtered through the catalogue on every read, so a model
 * dropped from MODELS degrades to the default instead of being sent to
 * Anthropic under a name it no longer answers to.
 */
const STORAGE_PREFIX = "luku_models";

export const modelsStorageKey = (userId) => `${STORAGE_PREFIX}:${userId}`;

function readModels(userId) {
  if (!userId) return { ...DEFAULT_MODELS };
  try {
    const raw = localStorage.getItem(modelsStorageKey(userId));
    // A hand-edited or half-written value is a corrupt preference, not a
    // reason to fail the app: resolveModels keeps whatever still parses.
    return resolveModels(raw ? JSON.parse(raw) : null);
  } catch { return { ...DEFAULT_MODELS }; }
}

export function useModels(userId) {
  const [models, _setModels] = useState(() => readModels(userId));

  // Persisting follows the rendered state rather than the call that asked for
  // it, as useSession does — and for the same underlying reason. A state
  // updater has to be pure: React may run one twice, or run it for a render it
  // then discards, so a write made inside one can put a choice into storage
  // that the reader never ended up with on screen.
  useEffect(() => {
    if (!userId) return;
    try { localStorage.setItem(modelsStorageKey(userId), JSON.stringify(models)); } catch {}
  }, [userId, models]);

  const setModel = useCallback((task, model) => {
    if (!isTaskId(task) || !isModelId(model)) return;
    // Returning `prev` unchanged for a pick that changes nothing keeps the
    // effect above from firing on it.
    _setModels((prev) => (prev[task] === model ? prev : { ...prev, [task]: model }));
  }, []);

  return { models, setModel };
}
