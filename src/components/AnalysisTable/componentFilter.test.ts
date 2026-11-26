import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JETBOT_COMPONENTS } from '../../data/componentsData';
import { filterComponents, normalizeSearchText } from './componentFilter';

describe('componentFilter search & type filtering', () => {
  it('normalizes Vietnamese diacritics including đ/Đ', () => {
    assert.equal(normalizeSearchText('Động cơ giảm tốc'), 'dong co giam toc');
    assert.equal(normalizeSearchText('Cảm biến Laser 360°'), 'cam bien laser 360°');
  });

  it('filters by component name with or without accents', () => {
    const res1 = filterComponents(JETBOT_COMPONENTS, 'Jetson', 'all');
    assert.ok(res1.some((c) => c.id === 'jetson-nano'));

    const res2 = filterComponents(JETBOT_COMPONENTS, 'dong co', 'all');
    assert.ok(res2.some((c) => c.id === 'dc-motors'));
    assert.ok(res2.some((c) => c.id === 'motor-driver'));
  });

  it('filters by component category / type keyword and category chip', () => {
    const sensorsByWord = filterComponents(JETBOT_COMPONENTS, 'cam bien', 'all');
    assert.ok(sensorsByWord.some((c) => c.id === 'rplidar'));
    assert.ok(sensorsByWord.some((c) => c.id === 'camera-csi'));

    const powerOnly = filterComponents(JETBOT_COMPONENTS, '', 'power');
    assert.equal(powerOnly.length, 2);
    assert.ok(powerOnly.every((c) => c.category === 'power'));
  });

  it('supports multi-token search across interface, specs, and working steps', () => {
    const i2cOled = filterComponents(JETBOT_COMPONENTS, 'i2c ssd1306', 'all');
    assert.deepEqual(
      i2cOled.map((c) => c.id),
      ['oled-display']
    );

    const empty = filterComponents(JETBOT_COMPONENTS, 'linh kien khong ton tai xyz', 'all');
    assert.equal(empty.length, 0);
  });
});
