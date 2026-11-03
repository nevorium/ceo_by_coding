import test from 'node:test';
import assert from 'node:assert/strict';
import UniversalEventEmitter from '../src/utils/EventEmitter.js';
import NavigationSystem, { formatCoord, isZoneRevealed } from '../src/systems/NavigationSystem.js';
import { ZONE_LABELS, UNKNOWN_ZONE_LABEL, GATES } from '../src/config/constants.js';

function createMockNavScene(overrides = {}) {
  const events = new UniversalEventEmitter();
  const buildingEvents = new UniversalEventEmitter();
  const wildlifeEvents = new UniversalEventEmitter();

  const scene = {
    events,
    player: { tileX: 5, tileY: 5 },
    unlockedZones: {
      zone2: false,
      zone3: false,
      zone4: false,
      zone5: false,
    },
    warehouse: { tileX: 10, tileY: 2, tileW: 2, tileH: 2 },
    marketZone: { x: 17, y: 1, w: 3, h: 2 },
    deviceManager: {
      getAll: () => [
        { id: 'drone-001', tileX: 6, tileY: 6 },
        { id: 'drone-002', tileX: 7, tileY: 8 },
      ],
    },
    buildingSystem: {
      events: buildingEvents,
      buildings: new Map([
        ['b1', { id: 'b1', type: 'warehouse', x: 22, y: 12 }],
        ['b2', { id: 'b2', type: 'teleporter', x: 5, y: 8, name: 'TP-Farm' }],
        ['b3', { id: 'b3', type: 'crafting_table', x: 7, y: 7 }],
      ]),
    },
    wildlifeSystem: {
      events: wildlifeEvents,
      caches: [
        { id: 'cache_pioneer', x: 10, y: 45, opened: false },
        { id: 'cache_builder', x: 15, y: 50, opened: true },
      ],
    },
    gridManager: {
      getTile: (x, y) => {
        // Mock gate locks
        if (x === 19 && y === 10) return { isLocked: true };
        if (x === 10 && y === 19) return { isLocked: true };
        return { isLocked: false };
      },
    },
    ...overrides,
  };

  return scene;
}

test('Navigation: formatCoord formats 0-based integer coordinates with 2-digit zero-padding', () => {
  assert.equal(formatCoord(0), '00');
  assert.equal(formatCoord(5), '05');
  assert.equal(formatCoord(12), '12');
  assert.equal(formatCoord(59), '59');
  assert.equal(formatCoord(-5), '00', 'Negative coords clamped to 00');
  assert.equal(formatCoord(7.8), '07', 'Truncates fractional parts');
});

test('Navigation: isZoneRevealed handles zone1 and unlockedZones correctly', () => {
  assert.equal(isZoneRevealed(null, 'zone1'), true, 'Zone 1 is always unlocked by default');
  assert.equal(isZoneRevealed({}, 'zone1'), true);
  assert.equal(isZoneRevealed(null, null), false, 'Null zone is never revealed');
  assert.equal(isZoneRevealed({ zone2: false }, 'zone2'), false);
  assert.equal(isZoneRevealed({ zone2: true }, 'zone2'), true);
  assert.equal(isZoneRevealed({ zone5: true }, 'zone5'), true);
});

test('Navigation: getPlayerPosition returns accurate zone and handles unknown quadrant', () => {
  const scene = createMockNavScene();
  const nav = new NavigationSystem(scene);

  // Initial check (before first tick, pos is -1, -1)
  assert.equal(nav.getPlayerPosition().zoneLabel, UNKNOWN_ZONE_LABEL);

  // Tick with player at (5, 5) -> Zone 1
  nav.tick();
  const pos1 = nav.getPlayerPosition();
  assert.equal(pos1.x, 5);
  assert.equal(pos1.y, 5);
  assert.equal(pos1.zoneKey, 'zone1');
  assert.equal(pos1.zoneLabel, ZONE_LABELS.zone1);

  // Player in Zone 2 (25, 10)
  scene.player.tileX = 25;
  scene.player.tileY = 10;
  nav.tick();
  const pos2 = nav.getPlayerPosition();
  assert.equal(pos2.zoneKey, 'zone2');
  assert.equal(pos2.zoneLabel, ZONE_LABELS.zone2);

  // Player in Zone 3 (10, 25)
  scene.player.tileX = 10;
  scene.player.tileY = 25;
  nav.tick();
  const pos3 = nav.getPlayerPosition();
  assert.equal(pos3.zoneKey, 'zone3');
  assert.equal(pos3.zoneLabel, ZONE_LABELS.zone3);

  // Player in Zone 4 (45, 10)
  scene.player.tileX = 45;
  scene.player.tileY = 10;
  nav.tick();
  const pos4 = nav.getPlayerPosition();
  assert.equal(pos4.zoneKey, 'zone4');
  assert.equal(pos4.zoneLabel, ZONE_LABELS.zone4);

  // Player in Zone 5 (10, 45)
  scene.player.tileX = 10;
  scene.player.tileY = 45;
  nav.tick();
  const pos5 = nav.getPlayerPosition();
  assert.equal(pos5.zoneKey, 'zone5');
  assert.equal(pos5.zoneLabel, ZONE_LABELS.zone5);

  // Player in Unknown bottom-right quadrant (45, 45) -> Q1 Decision: Wilayah Tak Dikenal
  scene.player.tileX = 45;
  scene.player.tileY = 45;
  nav.tick();
  const posUnknown = nav.getPlayerPosition();
  assert.equal(posUnknown.zoneKey, null);
  assert.equal(posUnknown.zoneLabel, UNKNOWN_ZONE_LABEL);
});

test('Navigation: tick emits position-changed only when coordinates change', () => {
  const scene = createMockNavScene();
  const nav = new NavigationSystem(scene);

  const posEvents = [];
  nav.events.on('position-changed', pos => posEvents.push(pos));

  // Frame 1: player initialized at (5, 5)
  nav.tick();
  assert.equal(posEvents.length, 1);
  assert.equal(posEvents[0].x, 5);
  assert.equal(posEvents[0].y, 5);

  // Frame 2: player hasn't moved -> no event emitted
  nav.tick();
  assert.equal(posEvents.length, 1, 'Should not emit when player did not move');

  // Frame 3: player moves to (6, 5)
  scene.player.tileX = 6;
  nav.tick();
  assert.equal(posEvents.length, 2);
  assert.equal(posEvents[1].x, 6);
  assert.equal(posEvents[1].y, 5);
});

test('Navigation: tick emits reveal-changed when unlocked zones change', () => {
  const scene = createMockNavScene();
  const nav = new NavigationSystem(scene);

  let revealEmitted = 0;
  nav.events.on('reveal-changed', () => revealEmitted++);

  // Initial tick records signature 0000 -> emits initial reveal-changed
  nav.tick();
  assert.equal(revealEmitted, 1);

  // Frame 2: no changes to zones
  nav.tick();
  assert.equal(revealEmitted, 1);

  // Unlock zone 2
  scene.unlockedZones.zone2 = true;
  nav.tick();
  assert.equal(revealEmitted, 2, 'Should emit reveal-changed when zone2 is unlocked');

  // No change
  nav.tick();
  assert.equal(revealEmitted, 2);

  // Unlock zone 5
  scene.unlockedZones.zone5 = true;
  nav.tick();
  assert.equal(revealEmitted, 3, 'Should emit reveal-changed when zone5 is unlocked');
});

test('Navigation: getMarkers aggregates player, drones, hq, market, depots, teleporters, caches, and gates', () => {
  const scene = createMockNavScene();
  scene.unlockedZones.zone5 = true; // Reveal zone 5 so caches appear
  const nav = new NavigationSystem(scene);

  const markers = nav.getMarkers();
  assert.ok(Array.isArray(markers));

  // Player marker
  const playerMarker = markers.find(m => m.kind === 'player');
  assert.ok(playerMarker);
  assert.equal(playerMarker.x, 5);
  assert.equal(playerMarker.y, 5);

  // Drone markers
  const droneMarkers = markers.filter(m => m.kind === 'drone');
  assert.equal(droneMarkers.length, 2);
  assert.equal(droneMarkers[0].id, 'drone-001');

  // Central Warehouse (HQ)
  const hqMarker = markers.find(m => m.kind === 'hq');
  assert.ok(hqMarker);
  assert.equal(hqMarker.x, 10);
  assert.equal(hqMarker.y, 2);

  // Market
  const marketMarker = markers.find(m => m.kind === 'market');
  assert.ok(marketMarker);
  assert.equal(marketMarker.x, 17);

  // Satellite Depot & Teleporter
  const depotMarker = markers.find(m => m.kind === 'depot');
  assert.ok(depotMarker);
  assert.equal(depotMarker.x, 22);

  const teleporterMarker = markers.find(m => m.kind === 'teleporter');
  assert.ok(teleporterMarker);
  assert.equal(teleporterMarker.label, 'TP-Farm');

  // Ancient Cache (only un-opened caches)
  const cacheMarkers = markers.filter(m => m.kind === 'cache');
  assert.equal(cacheMarkers.length, 1);
  assert.equal(cacheMarkers[0].id, 'cache_pioneer');

  // Gates from GATES constant
  const gateMarkers = markers.filter(m => m.kind === 'gate');
  assert.equal(gateMarkers.length, Object.keys(GATES).length);
  const gate2 = gateMarkers.find(m => m.id === 'gate2');
  assert.ok(gate2);
  assert.equal(gate2.x, 19);
  assert.equal(gate2.y, 10);
});

test('Navigation: relay events propagate markers-changed from BuildingSystem and WildlifeSystem', () => {
  const scene = createMockNavScene();
  const nav = new NavigationSystem(scene);

  let markersChangedCount = 0;
  nav.events.on('markers-changed', () => markersChangedCount++);

  // 1. BuildingSystem changes (placed, dismantled)
  scene.buildingSystem.events.emit('changed');
  assert.equal(markersChangedCount, 1);

  // 2. Wildlife cache opened
  scene.wildlifeSystem.events.emit('cache-opened');
  assert.equal(markersChangedCount, 2);
});
