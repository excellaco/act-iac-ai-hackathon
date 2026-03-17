// Mock CSS Modules — returns class names as-is for testing
export default new Proxy({}, { get: (_target, key) => key });
