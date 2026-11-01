/**
 * @fileoverview Drone inventory fill color calculation.
 * Interpolates color via HSL (from yellow hue ~50 to red hue ~0)
 * avoiding muddy brown/gray midtones.
 */

/**
 * Converts HSL to RGB hex number (0xRRGGBB).
 * @param {number} h Hue in degrees [0, 360]
 * @param {number} s Saturation [0, 1]
 * @param {number} l Lightness [0, 1]
 * @returns {number} Hex number
 */
export function hslToHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (h % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp >= 0 && hp < 1) { r = c; g = x; b = 0; }
  else if (hp >= 1 && hp < 2) { r = x; g = c; b = 0; }
  else if (hp >= 2 && hp < 3) { r = 0; g = c; b = x; }
  else if (hp >= 3 && hp < 4) { r = 0; g = x; b = c; }
  else if (hp >= 4 && hp < 5) { r = x; g = 0; b = c; }
  else if (hp >= 5 && hp < 6) { r = c; g = 0; b = x; }
  const m = l - c / 2;
  const red = Math.round((r + m) * 255);
  const green = Math.round((g + m) * 255);
  const blue = Math.round((b + m) * 255);
  return (red << 16) | (green << 8) | blue;
}

/**
 * Returns fill color as a Phaser hex number based on fill ratio [0, 1].
 * 0.0 -> Yellow (#FFD84A)
 * 0.5 -> Orange (#FF9A2E)
 * 1.0 -> Red (#E53935)
 * @param {number} ratio
 * @returns {number}
 */
export function fillColor(ratio) {
  const t = Math.max(0, Math.min(1, Number(ratio) || 0));
  // Hue smoothly decreases from 50 (yellow) to 0 (red)
  const h = 50 * (1 - t);
  // Saturation: 1.0 at yellow/orange, ~0.8 at red
  const s = 1.0 - 0.2 * t;
  // Lightness: 0.65 at yellow, ~0.55 at red
  const l = 0.65 - 0.10 * t;
  return hslToHex(h, s, l);
}

/**
 * Returns fill color as a CSS hex string (e.g. '#ffd84a').
 * @param {number} ratio
 * @returns {string}
 */
export function fillColorCSS(ratio) {
  const hex = fillColor(ratio).toString(16).padStart(6, '0');
  return `#${hex}`;
}

export default fillColor;
