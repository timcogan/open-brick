import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeBounds, evaluateScad, parseScad, parseTemplateMetadata, toAsciiStl } from '../src/scad-engine.mjs';

const source = readFileSync(new URL('../scad/classic_brick.scad', import.meta.url), 'utf8');
const metadata = parseTemplateMetadata(source, 'classic_brick');
const ast = parseScad(source);

function defaultParams() {
  return Object.fromEntries(metadata.params.map((param) => [param.key, param.defaultValue]));
}

test('metadata exposes classic brick template and expected parameters', () => {
  assert.equal(metadata.id, 'classic_brick');
  assert.equal(metadata.name, 'Classic Brick');

  const keys = metadata.params.map((param) => param.key);
  assert.deepEqual(keys, ['X', 'Y', 'Z', 'scale_percent']);
});

test('default model generates non-empty geometry', () => {
  const triangles = evaluateScad(ast, defaultParams());
  assert.ok(triangles.length > 0);

  const bounds = computeBounds(triangles);
  assert.ok(bounds);
  assert.ok(bounds.size[0] > 0);
  assert.ok(bounds.size[1] > 0);
  assert.ok(bounds.size[2] > 0);
});

test('scaled model grows when scale_percent increases', () => {
  const baseParams = defaultParams();
  const largerParams = { ...baseParams, scale_percent: 105 };

  const baseBounds = computeBounds(evaluateScad(ast, baseParams));
  const largerBounds = computeBounds(evaluateScad(ast, largerParams));

  assert.ok(baseBounds && largerBounds);
  assert.ok(largerBounds.size[0] > baseBounds.size[0]);
  assert.ok(largerBounds.size[1] > baseBounds.size[1]);
  assert.ok(largerBounds.size[2] > baseBounds.size[2]);
});

test('1x1 brick configuration generates valid geometry', () => {
  const params = { ...defaultParams(), X: 1, Y: 1, Z: 3, scale_percent: 100 };
  const triangles = evaluateScad(ast, params);
  const bounds = computeBounds(triangles);

  assert.ok(triangles.length > 0);
  assert.ok(bounds);
  assert.ok(bounds.size[0] > 0);
  assert.ok(bounds.size[1] > 0);
  assert.ok(bounds.size[2] > 0);
});

test('STL export includes the expected solid header/footer', () => {
  const triangles = evaluateScad(ast, defaultParams());
  const stl = toAsciiStl(triangles, metadata.id);

  assert.ok(stl.startsWith('solid classic_brick'));
  assert.ok(stl.includes('\nendsolid classic_brick'));
});
