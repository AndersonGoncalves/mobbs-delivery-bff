export interface DeliveryFeeZoneLike {
  neighborhood: string;
  feeCents: number;
}

/**
 * Zona de entrega do bairro informado (comparação sem diferença de caixa nem espaços nas pontas). `undefined`
 * quando o bairro não tem taxa cadastrada — o pedido nesse caso não pode ser fechado no modo por bairro.
 */
export function findDeliveryFeeZone<Zone extends DeliveryFeeZoneLike>(zones: Zone[], neighborhood: string | undefined): Zone | undefined {
  const wanted = normalizeNeighborhood(neighborhood);
  if (!wanted) return undefined;
  return zones.find((zone) => normalizeNeighborhood(zone.neighborhood) === wanted);
}

function normalizeNeighborhood(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}
