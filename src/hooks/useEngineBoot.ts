import { useEffect } from 'react';
import { useGameStore } from '../store/gameStore';

/**
 * Starts Stockfish once, on mount.
 *
 * The engine is a module-level singleton, so this only kicks off the WASM
 * download and handshake; React Strict Mode's double-invoked effect is a no-op
 * because `bootEngine` returns early unless the status is still `idle`.
 */
export function useEngineBoot(): void {
  const bootEngine = useGameStore((state) => state.bootEngine);

  useEffect(() => {
    void bootEngine();
  }, [bootEngine]);
}
