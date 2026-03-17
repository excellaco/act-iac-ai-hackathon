import { computeRIS } from '../lib/scoring';

describe('computeRIS', () => {
  it('computes weighted sum correctly', () => {
    expect(computeRIS({ dci: 100, dcoi: 100, pci: 100, crp: 100 })).toBe(100);
    expect(computeRIS({ dci: 0, dcoi: 0, pci: 0, crp: 0 })).toBe(0);
  });

  it('applies correct weights: 0.30 DCI + 0.25 DCOI + 0.20 PCI + 0.25 CRP', () => {
    // Only DCI set: 0.30 * 100 = 30
    expect(computeRIS({ dci: 100, dcoi: 0, pci: 0, crp: 0 })).toBe(30);
    // Only DCOI set: 0.25 * 100 = 25
    expect(computeRIS({ dci: 0, dcoi: 100, pci: 0, crp: 0 })).toBe(25);
    // Only PCI set: 0.20 * 100 = 20
    expect(computeRIS({ dci: 0, dcoi: 0, pci: 100, crp: 0 })).toBe(20);
    // Only CRP set: 0.25 * 100 = 25
    expect(computeRIS({ dci: 0, dcoi: 0, pci: 0, crp: 100 })).toBe(25);
  });

  it('rounds to nearest integer', () => {
    // 0.30*1 + 0.25*1 + 0.20*1 + 0.25*1 = 1.00
    expect(computeRIS({ dci: 1, dcoi: 1, pci: 1, crp: 1 })).toBe(1);
    // 0.30*75 + 0.25*70 + 0.20*65 + 0.25*80 = 22.5+17.5+13+20 = 73
    expect(computeRIS({ dci: 75, dcoi: 70, pci: 65, crp: 80 })).toBe(73);
  });

  it('matches expected scores for demo jurisdictions', () => {
    // Fairfax: high restrictiveness
    expect(computeRIS({ dci: 75, dcoi: 70, pci: 65, crp: 80 })).toBe(73);
    // Arlington: lower restrictiveness
    expect(computeRIS({ dci: 40, dcoi: 50, pci: 35, crp: 45 })).toBe(43);
    // Loudoun: moderate-high
    expect(computeRIS({ dci: 80, dcoi: 55, pci: 60, crp: 60 })).toBe(65);
  });
});
