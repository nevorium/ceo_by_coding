/**
 * @fileoverview inventorySort — Pure sorting and compaction logic for slot containers.
 */
import { getItem } from '../data/items.js';

/**
 * Compacts slots by merging partial stacks of the same item up to stackMax.
 * Does not reorder items unnecessarily, but condenses them.
 * @param {Array<{ id: string, count: number }|null>} slots
 * @param {boolean} [isWarehouse=false]
 * @returns {Array<{ id: string, count: number }|null>} A fresh compacted array of slots
 */
export function compactSlots(slots, isWarehouse = false) {
  const result = slots.map(s => (s ? { ...s } : null));

  for (let i = 0; i < result.length; i++) {
    const slot = result[i];
    if (!slot) continue;

    const meta = getItem(slot.id);
    const stackMax = isWarehouse ? (meta.stackMaxWarehouse || 999) : (meta.stackMax || 99);

    if (slot.count < stackMax) {
      // Look ahead for same item to merge into slot i
      for (let j = i + 1; j < result.length; j++) {
        const other = result[j];
        if (other && other.id === slot.id) {
          const space = stackMax - slot.count;
          const transfer = Math.min(space, other.count);
          slot.count += transfer;
          other.count -= transfer;
          if (other.count <= 0) {
            result[j] = null;
          }
          if (slot.count >= stackMax) break;
        }
      }
    }
  }

  return result;
}

/**
 * Sorts slots based on a criterion, compacting them first.
 * Empty/null slots always go to the end.
 *
 * @param {Array<{ id: string, count: number }|null>} slots
 * @param {'category'|'name'|'quantity'|'id'} [criterion='category']
 * @param {'asc'|'desc'} [dir='asc']
 * @param {boolean} [isWarehouse=false]
 * @returns {Array<{ id: string, count: number }|null>} Fresh sorted slots array with same length
 */
export function sortSlots(slots, criterion = 'category', dir = 'asc', isWarehouse = false) {
  // 1. Compact first
  const compacted = compactSlots(slots, isWarehouse);
  const totalSlots = slots.length;

  // Separate filled slots from empty slots
  const filled = compacted.filter(s => s && s.count > 0);

  const CATEGORY_ORDER = [
    'Peralatan',
    'Pertanian',
    'Tambang',
    'Artisan Refineri',
    'Komponen',
    'Upgrade',
    'Bangunan',
    'Bahan Baku',
    'Umum',
  ];

  filled.sort((a, b) => {
    const metaA = getItem(a.id);
    const metaB = getItem(b.id);

    let cmp = 0;
    if (criterion === 'category') {
      const catIdxA = CATEGORY_ORDER.indexOf(metaA.category);
      const catIdxB = CATEGORY_ORDER.indexOf(metaB.category);
      const orderA = catIdxA !== -1 ? catIdxA : 999;
      const orderB = catIdxB !== -1 ? catIdxB : 999;
      cmp = orderA - orderB;
      if (cmp === 0) cmp = metaA.name.localeCompare(metaB.name);
      if (cmp === 0) cmp = b.count - a.count; // highest stack first
    } else if (criterion === 'name') {
      cmp = metaA.name.localeCompare(metaB.name);
      if (cmp === 0) cmp = b.count - a.count;
    } else if (criterion === 'quantity') {
      cmp = b.count - a.count;
      if (cmp === 0) cmp = metaA.name.localeCompare(metaB.name);
    } else if (criterion === 'id') {
      cmp = a.id.localeCompare(b.id);
      if (cmp === 0) cmp = b.count - a.count;
    }

    return dir === 'desc' ? -cmp : cmp;
  });

  // Re-pad with nulls up to totalSlots
  const sorted = [...filled];
  while (sorted.length < totalSlots) {
    sorted.push(null);
  }

  return sorted;
}
