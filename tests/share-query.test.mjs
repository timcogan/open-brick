import test from "node:test";
import assert from "node:assert/strict";

import { buildShareQuery, getCanonicalQueryName, parseShareQuery } from "../src/share-query.mjs";

const CLASSIC_TEMPLATE = {
  id: "classic_brick",
  params: [
    { key: "X", min: 1, max: 10, defaultValue: 4 },
    { key: "Y", min: 1, max: 12, defaultValue: 2 },
    { key: "Z", min: 1, max: 9, defaultValue: 3 },
    { key: "scale_percent", min: 95, max: 105, defaultValue: 100 },
  ],
};

const TILE_TEMPLATE = {
  id: "classic_tile",
  params: [
    { key: "X", min: 1, max: 16, defaultValue: 2 },
    { key: "Y", min: 1, max: 16, defaultValue: 4 },
    { key: "scale_percent", min: 95, max: 105, defaultValue: 100 },
  ],
};

test("buildShareQuery writes canonical query params", () => {
  const query = buildShareQuery(CLASSIC_TEMPLATE, {
    X: 6,
    Y: 4,
    Z: 2,
    scale_percent: 101,
  });

  assert.equal(query, "?template=classic_brick&width=6&length=4&height=2&scale=101");
});

test("buildShareQuery omits height for templates that do not define Z", () => {
  const query = buildShareQuery(TILE_TEMPLATE, {
    X: 3,
    Y: 6,
    scale_percent: 99,
  });

  assert.equal(query, "?template=classic_tile&width=3&length=6&scale=99");
});

test("parseShareQuery reads canonical query params", () => {
  const parsed = parseShareQuery("?template=classic_brick&width=4&length=2&height=3&scale=101", [CLASSIC_TEMPLATE]);

  assert.ok(parsed);
  assert.equal(parsed.templateId, "classic_brick");
  assert.deepEqual({ ...parsed.params }, {
    X: 4,
    Y: 2,
    Z: 3,
    scale_percent: 101,
  });
});

test("parseShareQuery supports aliases and clamps values", () => {
  const parsed = parseShareQuery("?template=classic-brick&x=100&y=1&z=9&scale_percent=999", [CLASSIC_TEMPLATE]);

  assert.ok(parsed);
  assert.equal(parsed.templateId, "classic_brick");
  assert.deepEqual({ ...parsed.params }, {
    X: 10,
    Y: 1,
    Z: 9,
    scale_percent: 105,
  });
});

test("parseShareQuery falls back to first template when template is missing", () => {
  const parsed = parseShareQuery("?width=5&length=3&height=4&scale=100", [CLASSIC_TEMPLATE]);

  assert.ok(parsed);
  assert.equal(parsed.templateId, "classic_brick");
  assert.deepEqual({ ...parsed.params }, {
    X: 5,
    Y: 3,
    Z: 4,
    scale_percent: 100,
  });
});

test("parseShareQuery supports templates without height parameter", () => {
  const parsed = parseShareQuery("?template=classic_tile&width=7&length=2&scale=102", [
    CLASSIC_TEMPLATE,
    TILE_TEMPLATE,
  ]);

  assert.ok(parsed);
  assert.equal(parsed.templateId, "classic_tile");
  assert.deepEqual({ ...parsed.params }, {
    X: 7,
    Y: 2,
    scale_percent: 102,
  });
});

test("parseShareQuery returns null when there are no relevant query params", () => {
  const parsed = parseShareQuery("?foo=bar", [CLASSIC_TEMPLATE]);
  assert.equal(parsed, null);
});

test("getCanonicalQueryName maps known keys", () => {
  assert.equal(getCanonicalQueryName("X"), "width");
  assert.equal(getCanonicalQueryName("Y"), "length");
  assert.equal(getCanonicalQueryName("Z"), "height");
  assert.equal(getCanonicalQueryName("scale_percent"), "scale");
  assert.equal(getCanonicalQueryName("custom_param"), "custom_param");
});
