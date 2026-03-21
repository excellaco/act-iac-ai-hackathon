import '@testing-library/jest-dom';

// Polyfill fetch for jsdom — used by ChoroplethMap to load /geo/us-states.json
global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  json: jest.fn().mockResolvedValue({ type: 'FeatureCollection', features: [] }),
} as unknown as Response);

// Polyfill scrollIntoView for jsdom — used by ChatPanel auto-scroll
if (typeof Element !== 'undefined') {
  Element.prototype.scrollIntoView = jest.fn();
}
