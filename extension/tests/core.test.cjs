const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");

const corePath = path.join(__dirname, "..", "core.js");
vm.runInThisContext(fs.readFileSync(corePath, "utf8"), {
  filename: corePath,
});

const core = globalThis.ShotdownCore;
assert.ok(core, "ShotdownCore should be exposed");
assert.equal(core.version, "0.4.0");

assert.deepEqual(
  core.splitRanges([9, 1, 1, 9, 1, 1], 2),
  [[0, 3], [3, 6]],
  "partitioning should minimize the largest part",
);

function makeImage(width, height, offsetY = 0) {
  const data = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceY = y + offsetY;
      const i = (y * width + x) * 4;
      data[i] = (x * 17 + sourceY * 7 + ((sourceY >> 3) * 23)) & 255;
      data[i + 1] = (x * 5 + sourceY * 13 + ((x >> 2) * 11)) & 255;
      data[i + 2] = (x * 3 + sourceY * 19 + ((sourceY >> 2) * 29)) & 255;
      data[i + 3] = 255;
    }
  }

  return { width, height, data };
}

const prev = makeImage(120, 300, 0);
const current = makeImage(120, 300, 210);
const overlap = core.findOverlapFromImageData(prev, current, 92);
assert.ok(overlap.confident, "synthetic seam should be confident");
assert.ok(
  Math.abs(overlap.overlap - 90) <= 4,
  `expected overlap near 90, got ${overlap.overlap}`,
);

const staticA = makeImage(100, 220, 0);
const staticB = makeImage(100, 220, 80);
for (let y = 0; y < 24; y += 1) {
  const row = staticA.data.slice(y * 100 * 4, (y + 1) * 100 * 4);
  staticB.data.set(row, y * 100 * 4);
}
for (let y = 192; y < 220; y += 1) {
  const row = staticA.data.slice(y * 100 * 4, (y + 1) * 100 * 4);
  staticB.data.set(row, y * 100 * 4);
}
const bands = core.detectStaticBands(staticA, staticB);
assert.ok(bands.top >= 18 && bands.top <= 34, `top band: ${bands.top}`);
assert.ok(bands.bottom >= 20 && bands.bottom <= 38, `bottom band: ${bands.bottom}`);

const fakeJpeg = {
  bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
  width: 100,
  height: 140,
};
const pdf = core.buildPdf([fakeJpeg, fakeJpeg], 0, 2, {
  title: "Smoke test",
  source: "example.test",
});
const text = Buffer.from(pdf).toString("latin1");
assert.ok(text.startsWith("%PDF-1.4"));
assert.ok(text.includes("/Info"));
assert.ok(text.includes("Shotdown"));
const startXrefMatch = text.match(/startxref\n(\d+)\n%%EOF$/);
assert.ok(startXrefMatch, "PDF should contain startxref");
const xrefOffset = Number(startXrefMatch[1]);
assert.equal(text.slice(xrefOffset, xrefOffset + 4), "xref");

console.log("Shotdown core tests passed.");
