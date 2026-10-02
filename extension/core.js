(() => {
  "use strict";

  const encoder = new TextEncoder();

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function concatBytes(chunks) {
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  }

  function ascii(text) {
    return encoder.encode(text);
  }

  function splitRanges(sizes, requestedParts) {
    const n = sizes.length;
    if (!n) return [];

    const parts = Math.max(1, Math.min(requestedParts, n));
    const prefix = new Array(n + 1).fill(0);
    for (let i = 0; i < n; i += 1) prefix[i + 1] = prefix[i] + sizes[i];

    const inf = Number.POSITIVE_INFINITY;
    const dp = Array.from({ length: n + 1 }, () =>
      new Array(parts + 1).fill(inf),
    );
    const cut = Array.from({ length: n + 1 }, () =>
      new Array(parts + 1).fill(0),
    );

    dp[0][0] = 0;
    for (let i = 1; i <= n; i += 1) dp[i][1] = prefix[i];

    for (let p = 2; p <= parts; p += 1) {
      for (let i = p; i <= n; i += 1) {
        for (let j = p - 1; j < i; j += 1) {
          const right = prefix[i] - prefix[j];
          const cost = Math.max(dp[j][p - 1], right);
          if (cost < dp[i][p]) {
            dp[i][p] = cost;
            cut[i][p] = j;
          }
        }
      }
    }

    const ranges = [];
    let i = n;
    let p = parts;
    while (p > 1) {
      const j = cut[i][p];
      ranges.push([j, i]);
      i = j;
      p -= 1;
    }
    ranges.push([0, i]);
    ranges.reverse();
    return ranges;
  }

  function luminance(data, index) {
    return (
      data[index] * 0.2126 +
      data[index + 1] * 0.7152 +
      data[index + 2] * 0.0722
    );
  }

  function overlapScore(a, b, overlap) {
    const width = Math.min(a.width, b.width);
    const rows = 24;
    const cols = 36;
    let weighted = 0;
    let weights = 0;

    for (let ry = 0; ry < rows; ry += 1) {
      const relY = (ry + 0.5) / rows;
      const ay = clamp(
        Math.floor(a.height - overlap + relY * overlap),
        1,
        a.height - 2,
      );
      const by = clamp(
        Math.floor(relY * overlap),
        1,
        b.height - 2,
      );

      for (let rx = 0; rx < cols; rx += 1) {
        const relX = 0.06 + ((rx + 0.5) / cols) * 0.88;
        const x = clamp(Math.floor(relX * width), 2, width - 3);

        const ai = (ay * a.width + x) * 4;
        const bi = (by * b.width + x) * 4;

        const colorDiff =
          (Math.abs(a.data[ai] - b.data[bi]) +
            Math.abs(a.data[ai + 1] - b.data[bi + 1]) +
            Math.abs(a.data[ai + 2] - b.data[bi + 2])) /
          3;

        const aLeft = (ay * a.width + (x - 2)) * 4;
        const aRight = (ay * a.width + (x + 2)) * 4;
        const bLeft = (by * b.width + (x - 2)) * 4;
        const bRight = (by * b.width + (x + 2)) * 4;

        const gradA = luminance(a.data, aRight) - luminance(a.data, aLeft);
        const gradB = luminance(b.data, bRight) - luminance(b.data, bLeft);
        const edgeDiff = Math.abs(gradA - gradB);
        const detail = Math.max(Math.abs(gradA), Math.abs(gradB));
        const weight = detail >= 9 ? 1 : 0.22;

        weighted += weight * (colorDiff * 0.62 + edgeDiff * 0.38);
        weights += weight;
      }
    }

    return weights ? weighted / weights : 255;
  }

  function findOverlapFromImageData(a, b, expectedOverlap) {
    const h = Math.min(a.height, b.height);
    const maxOverlap = Math.max(9, Math.floor(h * 0.80));
    const expected = clamp(Math.round(expectedOverlap), 8, maxOverlap);
    const radius = Math.max(48, Math.min(220, Math.round(h * 0.24)));
    const min = Math.max(8, expected - radius);
    const max = Math.min(maxOverlap, expected + radius);

    const evaluated = new Map();

    function evaluate(overlap) {
      overlap = clamp(Math.round(overlap), min, max);
      if (evaluated.has(overlap)) return evaluated.get(overlap);

      const visual = overlapScore(a, b, overlap);
      const combined = visual + Math.abs(overlap - expected) * 0.016;
      const result = { overlap, visual, combined };
      evaluated.set(overlap, result);
      return result;
    }

    // The measured scroll delta is usually close to the correct seam, so always
    // search it densely. This avoids missing the true overlap because of coarse
    // step alignment.
    for (
      let overlap = Math.max(min, expected - 20);
      overlap <= Math.min(max, expected + 20);
      overlap += 1
    ) {
      evaluate(overlap);
    }

    // Also scan the wider window for cases where dynamic layout changes made the
    // measured scroll delta imperfect.
    for (let overlap = min; overlap <= max; overlap += 5) {
      evaluate(overlap);
    }
    evaluate(max);

    let ranked = [...evaluated.values()].sort(
      (x, y) => x.combined - y.combined,
    );

    // Refine several strong basins, not only the first coarse winner. Repetitive
    // wallpapers can otherwise create a false local minimum.
    const seeds = [];
    for (const candidate of ranked) {
      if (
        seeds.every(
          (seed) => Math.abs(seed.overlap - candidate.overlap) >= 10,
        )
      ) {
        seeds.push(candidate);
      }
      if (seeds.length >= 5) break;
    }

    for (const seed of seeds) {
      for (
        let overlap = Math.max(min, seed.overlap - 6);
        overlap <= Math.min(max, seed.overlap + 6);
        overlap += 1
      ) {
        evaluate(overlap);
      }
    }

    ranked = [...evaluated.values()].sort(
      (x, y) => x.combined - y.combined,
    );

    const best = ranked[0] || {
      overlap: expected,
      visual: 255,
      combined: 255,
    };

    let secondVisual = Number.POSITIVE_INFINITY;
    for (const candidate of ranked) {
      if (Math.abs(candidate.overlap - best.overlap) >= 12) {
        secondVisual = Math.min(secondVisual, candidate.visual);
      }
    }

    const separation = Number.isFinite(secondVisual)
      ? secondVisual - best.visual
      : 99;
    const closeToExpected = Math.abs(best.overlap - expected) <= 10;
    const confident =
      best.visual <= 21 &&
      (closeToExpected || separation >= 1.15);

    return {
      overlap: confident ? best.overlap : expected,
      confident,
      score: best.visual,
      expected,
      separation,
      candidate: best.overlap,
    };
  }

  function rowDifference(a, b, y) {
    const width = Math.min(a.width, b.width);
    const cols = 42;
    let total = 0;
    let count = 0;

    for (let i = 0; i < cols; i += 1) {
      const relX = 0.04 + ((i + 0.5) / cols) * 0.92;
      const x = clamp(Math.floor(relX * width), 0, width - 1);
      const ai = (y * a.width + x) * 4;
      const bi = (y * b.width + x) * 4;
      total +=
        Math.abs(a.data[ai] - b.data[bi]) +
        Math.abs(a.data[ai + 1] - b.data[bi + 1]) +
        Math.abs(a.data[ai + 2] - b.data[bi + 2]);
      count += 3;
    }
    return count ? total / count : 255;
  }

  function detectStaticBands(a, b) {
    const h = Math.min(a.height, b.height);
    const maxBand = Math.floor(h * 0.28);
    const step = 2;
    const threshold = 5.5;
    const toleratedBadRows = 4;

    function scan(fromTop) {
      let lastGood = 0;
      let bad = 0;

      for (let offset = 0; offset < maxBand; offset += step) {
        const y = fromTop ? offset : h - 1 - offset;
        const diff = rowDifference(a, b, clamp(y, 0, h - 1));

        if (diff <= threshold) {
          lastGood = offset + step;
          bad = 0;
        } else {
          bad += 1;
          if (bad >= toleratedBadRows) break;
        }
      }

      return lastGood >= 18 ? Math.min(lastGood, maxBand) : 0;
    }

    let top = scan(true);
    let bottom = scan(false);

    if (top + bottom > h * 0.44) {
      if (top >= bottom) top = 0;
      else bottom = 0;
    }

    return { top, bottom };
  }

  function escapePdfString(value) {
    return String(value || "")
      .replaceAll("\\", "\\\\")
      .replaceAll("(", "\\(")
      .replaceAll(")", "\\)");
  }

  function pdfDate(date = new Date()) {
    const pad = (value) => String(value).padStart(2, "0");
    return (
      "D:" +
      date.getUTCFullYear() +
      pad(date.getUTCMonth() + 1) +
      pad(date.getUTCDate()) +
      pad(date.getUTCHours()) +
      pad(date.getUTCMinutes()) +
      pad(date.getUTCSeconds()) +
      "Z"
    );
  }

  function buildPdf(jpegs, start, end, metadata = {}) {
    const pageCount = end - start;
    const infoObj = 3 + pageCount * 3;
    const objectCount = infoObj;
    const objects = new Array(objectCount + 1);

    objects[1] = ascii("<< /Type /Catalog /Pages 2 0 R >>");

    const kids = [];
    for (let i = 0; i < pageCount; i += 1) {
      kids.push(3 + i * 3 + " 0 R");
    }
    objects[2] = ascii(
      "<< /Type /Pages /Count " +
        pageCount +
        " /Kids [ " +
        kids.join(" ") +
        " ] >>",
    );

    const pageW = 595.28;
    const pageH = 841.89;

    for (let local = 0; local < pageCount; local += 1) {
      const jpeg = jpegs[start + local];
      const pageObj = 3 + local * 3;
      const imageObj = pageObj + 1;
      const contentObj = pageObj + 2;

      objects[pageObj] = ascii(
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " +
          pageW +
          " " +
          pageH +
          "] /Resources << /XObject << /Im" +
          local +
          " " +
          imageObj +
          " 0 R >> >> /Contents " +
          contentObj +
          " 0 R >>",
      );

      const imageHeader = ascii(
        "<< /Type /XObject /Subtype /Image /Width " +
          jpeg.width +
          " /Height " +
          jpeg.height +
          " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " +
          jpeg.bytes.length +
          " >>\nstream\n",
      );
      objects[imageObj] = concatBytes([
        imageHeader,
        jpeg.bytes,
        ascii("\nendstream"),
      ]);

      const command =
        "q\n" +
        pageW +
        " 0 0 " +
        pageH +
        " 0 0 cm\n/Im" +
        local +
        " Do\nQ\n";
      const commandBytes = ascii(command);
      objects[contentObj] = concatBytes([
        ascii("<< /Length " + commandBytes.length + " >>\nstream\n"),
        commandBytes,
        ascii("endstream"),
      ]);
    }

    const title = escapePdfString(metadata.title || "Shotdown capture");
    const source = escapePdfString(metadata.source || "");
    objects[infoObj] = ascii(
      "<< /Title (" +
        title +
        ") /Creator (Shotdown) /Producer (Shotdown browser extension)" +
        (source ? " /Subject (" + source + ")" : "") +
        " /CreationDate (" +
        pdfDate() +
        ") >>",
    );

    const chunks = [ascii("%PDF-1.4\n%Shotdown\n")];
    const offsets = new Array(objectCount + 1).fill(0);
    let position = chunks[0].length;

    for (let i = 1; i <= objectCount; i += 1) {
      offsets[i] = position;
      const head = ascii(i + " 0 obj\n");
      const tail = ascii("\nendobj\n");
      chunks.push(head, objects[i], tail);
      position += head.length + objects[i].length + tail.length;
    }

    const xrefOffset = position;
    let xref = "xref\n0 " + (objectCount + 1) + "\n";
    xref += "0000000000 65535 f \n";
    for (let i = 1; i <= objectCount; i += 1) {
      xref += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
    }
    xref +=
      "trailer\n<< /Size " +
      (objectCount + 1) +
      " /Root 1 0 R /Info " +
      infoObj +
      " 0 R >>\nstartxref\n" +
      xrefOffset +
      "\n%%EOF";

    chunks.push(ascii(xref));
    return concatBytes(chunks);
  }

  globalThis.ShotdownCore = Object.freeze({
    version: "0.4.0",
    clamp,
    splitRanges,
    overlapScore,
    findOverlapFromImageData,
    detectStaticBands,
    buildPdf,
  });
})();
