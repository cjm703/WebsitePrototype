import { useState } from "react";
import { useDebouncedJsonStorage } from "./use-debounced-storage";
import { safeGetJson } from "./safe-storage";

export interface EntityManager<T> {
  items: T[];
  setItems: React.Dispatch<React.SetStateAction<T[]>>;
  editing: T | null;
  setEditing: React.Dispatch<React.SetStateAction<T | null>>;
  isAdding: boolean;
  setIsAdding: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useEntityManager<T>(
  key: string,
  initial: T[],
  opts?: { transform?: (data: T[]) => T[]; delay?: number },
): EntityManager<T> {
  const [items, setItems] = useState<T[]>(() => {
    const raw = safeGetJson(key, initial);
    return opts?.transform ? opts.transform(raw) : raw;
  });
  const [editing, setEditing] = useState<T | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  useDebouncedJsonStorage(key, items, opts?.delay ?? 400);
  return { items, setItems, editing, setEditing, isAdding, setIsAdding };
}