// Mock Leaflet for Jest/jsdom — Leaflet is a browser-only library and cannot
// run in Node.js test environments. This mock stubs out the parts used by
// ChoroplethMap.tsx so that page-level tests can render without crashing.

const mockHandler = { enable: jest.fn(), disable: jest.fn() };

const mockBounds = {
  getNorth: jest.fn().mockReturnValue(39),
  getSouth: jest.fn().mockReturnValue(38),
  getEast: jest.fn().mockReturnValue(-77),
  getWest: jest.fn().mockReturnValue(-78),
};

const mockLayer = {
  addTo: jest.fn().mockReturnThis(),
  remove: jest.fn().mockReturnThis(),
  setStyle: jest.fn().mockReturnThis(),
  bindPopup: jest.fn().mockReturnThis(),
  openPopup: jest.fn().mockReturnThis(),
  getBounds: jest.fn().mockReturnValue(mockBounds),
};

const mockMap = {
  remove: jest.fn(),
  fitBounds: jest.fn(),
  setView: jest.fn(),
  removeLayer: jest.fn(),
  dragging: mockHandler,
  scrollWheelZoom: mockHandler,
  doubleClickZoom: mockHandler,
  touchZoom: mockHandler,
  keyboard: mockHandler,
  boxZoom: mockHandler,
};

const L = {
  map: jest.fn().mockReturnValue(mockMap),
  tileLayer: jest.fn().mockReturnValue(mockLayer),
  geoJSON: jest.fn().mockReturnValue(mockLayer),
  polygon: jest.fn().mockReturnValue(mockLayer),
  Icon: {
    Default: {
      prototype: {},
      mergeOptions: jest.fn(),
    },
  },
};

export default L;
export const { map, tileLayer, geoJSON, polygon, Icon } = L;
