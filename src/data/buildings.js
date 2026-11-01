/**
 * Player-placeable construction definitions. A kit is a normal inventory item
 * until it is placed through Build Mode.
 */
export const BUILDING_DEFINITIONS = Object.freeze({
  crafting_table: {
    kitId: 'crafting_table_kit',
    label: 'Crafting Table',
    width: 1,
    height: 1,
    machineType: 'crafting_table',
    description: 'Merakit kit bangunan dari hasil tambang.',
  },
  warehouse_depot: {
    kitId: 'warehouse_depot_kit',
    label: 'Warehouse Depot',
    width: 2,
    height: 2,
    storage: true,
    description: 'Akses tambahan ke stok gudang pusat.',
  },
  warehouse: {
    kitId: 'warehouse_kit',
    label: 'Warehouse',
    width: 2,
    height: 2,
    storage: true,
    description: 'Gudang satelit penyimpanan multi-lokasi.',
  },
  smelter: {
    kitId: 'smelter_kit',
    label: 'Smelter',
    width: 1,
    height: 1,
    machineType: 'smelter',
    description: 'Melebur bijih tembaga, besi, dan emas menjadi batangan.',
  },
  mill: {
    kitId: 'mill_kit',
    label: 'Grain Mill',
    width: 1,
    height: 1,
    machineType: 'mill',
    description: 'Menggiling gandum menjadi tepung.',
  },
  assembler: {
    kitId: 'assembler_kit',
    label: 'Assembler',
    width: 1,
    height: 1,
    machineType: 'assembler',
    description: 'Merakit komponen kabel tembaga, roda gigi, dan mikrochip.',
  },
  press: {
    kitId: 'press_kit',
    label: 'Juice Press',
    width: 1,
    height: 1,
    machineType: 'press',
    description: 'Memeras hasil buah menjadi jus segar.',
  },
  boiler: {
    kitId: 'boiler_kit',
    label: 'Syrup Boiler',
    width: 1,
    height: 1,
    machineType: 'boiler',
    description: 'Merebus jus buah menjadi selai kental.',
  },
  conveyor: {
    kitId: 'conveyor_kit',
    label: 'Conveyor',
    width: 1,
    height: 1,
    conveyor: true,
    description: 'Memindahkan satu item per detik.',
  },
});

export const BUILDING_KIT_IDS = Object.freeze(Object.fromEntries(
  Object.entries(BUILDING_DEFINITIONS).map(([type, definition]) => [definition.kitId, type]),
));

export const BUILDING_KITS = Object.freeze(Object.entries(BUILDING_DEFINITIONS).map(([type, definition]) => ({
  type,
  ...definition,
})));

export function buildingTypeFromKit(itemId) {
  return BUILDING_KIT_IDS[itemId] || null;
}

export function isWarehouseStorable(itemId) {
  return itemId !== 'plow' && itemId !== 'watering_can' && itemId !== 'pickaxe' && !itemId.startsWith('key_');
}
