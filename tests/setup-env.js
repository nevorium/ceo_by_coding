// Polyfill minimal browser globals for Phaser & DOM testing in Node.js
if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    addEventListener: () => {},
    removeEventListener: () => {},
    matchMedia: () => ({ matches: false }),
    location: { href: '' },
    document: {},
  };
}
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    createElement: () => ({
      getContext: () => ({
        fillRect: () => {},
        getImageData: () => ({ data: new Uint8ClampedArray(4) }),
        putImageData: () => {},
        drawImage: () => {},
        clearRect: () => {},
        beginPath: () => {},
        arc: () => {},
        fill: () => {},
        createImageData: () => ({ data: new Uint8ClampedArray(4) }),
      }),
      style: {},
      width: 1,
      height: 1,
    }),
    documentElement: { style: { setProperty: () => {} } },
  };
}
if (typeof globalThis.navigator === 'undefined') {
  globalThis.navigator = { userAgent: 'node' };
}
if (typeof globalThis.HTMLCanvasElement === 'undefined') {
  globalThis.HTMLCanvasElement = class HTMLCanvasElement {};
}
if (typeof globalThis.HTMLVideoElement === 'undefined') {
  globalThis.HTMLVideoElement = class HTMLVideoElement {};
}
if (typeof globalThis.HTMLImageElement === 'undefined') {
  globalThis.HTMLImageElement = class HTMLImageElement {};
}
if (typeof globalThis.Image === 'undefined') {
  globalThis.Image = class MockImage {
    constructor() {
      this.src = '';
      this.width = 1;
      this.height = 1;
    }
  };
}
