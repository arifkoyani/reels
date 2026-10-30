// Minimal PNG decode/encode on Node's built-in zlib — no image dependency.
import { inflateSync, deflateSync } from "zlib";

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const crcTable = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const paeth = (a, b, c) => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

// Returns { width, height, rgba } with rgba always 4 channels.
export const decodePNG = (buf) => {
  if (!buf.subarray(0, 8).equals(SIGNATURE)) throw new Error("Not a PNG");

  let pos = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  let palette = null;
  const idat = [];

  while (pos < buf.length) {
    const length = buf.readUInt32BE(pos);
    const type = buf.toString("latin1", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + length);
    pos += 12 + length;

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "PLTE") {
      palette = Buffer.from(data);
    } else if (type === "IDAT") {
      idat.push(Buffer.from(data));
    } else if (type === "IEND") {
      break;
    }
  }

  if (bitDepth !== 8) throw new Error(`Unsupported bit depth ${bitDepth}`);
  if (interlace !== 0) throw new Error("Interlaced PNG not supported");

  const srcChannels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!srcChannels) throw new Error(`Unsupported color type ${colorType}`);

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * srcChannels;
  const pixels = Buffer.alloc(height * stride);

  // Reverse the per-scanline filters
  let offset = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[offset++];
    const line = raw.subarray(offset, offset + stride);
    offset += stride;
    const out = pixels.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null;

    for (let i = 0; i < stride; i++) {
      const a = i >= srcChannels ? out[i - srcChannels] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= srcChannels ? prev[i - srcChannels] : 0;
      let value = line[i];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) value += paeth(a, b, c);
      out[i] = value & 0xff;
    }
  }

  // Normalise everything to RGBA
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0, n = width * height; i < n; i++) {
    const s = i * srcChannels;
    const d = i * 4;
    if (colorType === 2) {
      rgba[d] = pixels[s];
      rgba[d + 1] = pixels[s + 1];
      rgba[d + 2] = pixels[s + 2];
      rgba[d + 3] = 255;
    } else if (colorType === 6) {
      rgba[d] = pixels[s];
      rgba[d + 1] = pixels[s + 1];
      rgba[d + 2] = pixels[s + 2];
      rgba[d + 3] = pixels[s + 3];
    } else if (colorType === 0) {
      rgba[d] = rgba[d + 1] = rgba[d + 2] = pixels[s];
      rgba[d + 3] = 255;
    } else if (colorType === 4) {
      rgba[d] = rgba[d + 1] = rgba[d + 2] = pixels[s];
      rgba[d + 3] = pixels[s + 1];
    } else if (colorType === 3) {
      const p = pixels[s] * 3;
      rgba[d] = palette[p];
      rgba[d + 1] = palette[p + 1];
      rgba[d + 2] = palette[p + 2];
      rgba[d + 3] = 255;
    }
  }

  return { width, height, rgba };
};

const chunk = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
};

export const encodePNG = ({ width, height, rgba }) => {
  const stride = width * 4;
  // Filter 0 (None) on every scanline keeps this simple and still compresses well
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
};
