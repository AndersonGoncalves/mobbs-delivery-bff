/**
 * Achado de auditoria pré-produção (31/10/2026) — "workers periódicos sem guarda contra
 * execução concorrente": `setInterval` cru dispara o próximo tick mesmo se o anterior do MESMO
 * worker ainda estiver em voo — uma chamada externa lenta (iFood/Instagram/Asaas) deixa ticks se
 * empilharem sem limite, cada um abrindo sua própria chamada em paralelo com a anterior.
 * `startPeriodicWorker` ignora (loga e pula, nunca enfileira) qualquer tick que chegue enquanto
 * o anterior ainda não terminou.
 */
export function startPeriodicWorker(name: string, intervalMs: number, run: () => Promise<void>): NodeJS.Timeout {
  let inFlight = false;
  return setInterval(() => {
    if (inFlight) {
      // eslint-disable-next-line no-console
      console.warn(`[${name}] tick ignorado — execução anterior ainda em andamento`);
      return;
    }
    inFlight = true;
    run()
      .catch((error) => {
        // eslint-disable-next-line no-console
        console.error(`[${name}] erro inesperado:`, error);
      })
      .finally(() => {
        inFlight = false;
      });
  }, intervalMs);
}
