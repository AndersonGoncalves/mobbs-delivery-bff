import { findDeliveryFeeZone } from './find-delivery-fee-zone';

const zones = [
  { neighborhood: 'Centro', feeCents: 500 },
  { neighborhood: 'Presidente Kennedy', feeCents: 800 },
];

describe('findDeliveryFeeZone', () => {
  it('acha a zona ignorando caixa e espaços nas pontas', () => {
    expect(findDeliveryFeeZone(zones, '  centro ')?.feeCents).toBe(500);
    expect(findDeliveryFeeZone(zones, 'PRESIDENTE KENNEDY')?.feeCents).toBe(800);
  });

  it('bairro sem zona cadastrada, vazio ou ausente devolve undefined', () => {
    expect(findDeliveryFeeZone(zones, 'Aldeota')).toBeUndefined();
    expect(findDeliveryFeeZone(zones, '   ')).toBeUndefined();
    expect(findDeliveryFeeZone(zones, undefined)).toBeUndefined();
  });
});
