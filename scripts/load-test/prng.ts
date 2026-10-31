// PRNG determinístico (mulberry32) — mesma seed sempre gera o mesmo banco, útil pra reproduzir
// um teste de carga (comparar resultados antes/depois de uma otimização, por exemplo).
export function createPrng(seed: number) {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (min: number, max: number): number => Math.floor(next() * (max - min + 1)) + min;

  const pick = <T>(arr: readonly T[]): T => arr[int(0, arr.length - 1)];

  const weighted = <T>(items: readonly { weight: number; value: T }[]): T => {
    const total = items.reduce((sum, i) => sum + i.weight, 0);
    let roll = next() * total;
    for (const item of items) {
      roll -= item.weight;
      if (roll <= 0) return item.value;
    }
    return items[items.length - 1].value;
  };

  const bool = (probabilityTrue: number): boolean => next() < probabilityTrue;

  const hex = (length: number): string => {
    let out = '';
    for (let i = 0; i < length; i++) out += int(0, 15).toString(16);
    return out;
  };

  return { next, int, pick, weighted, bool, hex };
}

export type Prng = ReturnType<typeof createPrng>;
