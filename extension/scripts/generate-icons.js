#!/usr/bin/env node
/**
 * Generate extension icons
 * Creates simple colored square icons with an "S" letter
 *
 * Usage: node scripts/generate-icons.js
 *
 * Note: This creates placeholder icons. For production,
 * replace with professionally designed icons.
 */

const fs = require('fs');
const path = require('path');

// Simple PNG encoder for solid color images with text
// This creates basic icons without external dependencies

const ICON_SIZES = [16, 32, 48, 128];
const ICON_DIR = path.join(__dirname, '..', 'public', 'icons');

// Brand color: Blue
const COLOR = { r: 74, g: 144, b: 217 }; // #4A90D9

// Create a simple PNG with a solid background
function createPNG(size) {
  const pixels = [];
  const centerX = size / 2;
  const centerY = size / 2;
  const radius = size * 0.4;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Create rounded rectangle background
      const cornerRadius = size * 0.2;
      let inShape = true;

      // Check corners
      if (x < cornerRadius && y < cornerRadius) {
        inShape = Math.sqrt((cornerRadius - x) ** 2 + (cornerRadius - y) ** 2) <= cornerRadius;
      } else if (x >= size - cornerRadius && y < cornerRadius) {
        inShape = Math.sqrt((x - (size - cornerRadius)) ** 2 + (cornerRadius - y) ** 2) <= cornerRadius;
      } else if (x < cornerRadius && y >= size - cornerRadius) {
        inShape = Math.sqrt((cornerRadius - x) ** 2 + (y - (size - cornerRadius)) ** 2) <= cornerRadius;
      } else if (x >= size - cornerRadius && y >= size - cornerRadius) {
        inShape = Math.sqrt((x - (size - cornerRadius)) ** 2 + (y - (size - cornerRadius)) ** 2) <= cornerRadius;
      }

      if (inShape) {
        // Check if we're drawing the "S" letter
        const relX = (x - centerX) / radius;
        const relY = (y - centerY) / radius;

        // Simple S shape detection (approximation)
        let isLetter = false;
        const letterThickness = 0.25;

        // Top curve of S
        if (relY >= -0.8 && relY <= -0.3) {
          const targetX = Math.cos((relY + 0.55) * Math.PI * 2) * 0.4;
          if (Math.abs(relX - targetX) < letterThickness) isLetter = true;
        }
        // Middle of S
        if (relY >= -0.3 && relY <= 0.3 && Math.abs(relX) < letterThickness) {
          isLetter = true;
        }
        // Bottom curve of S
        if (relY >= 0.3 && relY <= 0.8) {
          const targetX = -Math.cos((relY - 0.55) * Math.PI * 2) * 0.4;
          if (Math.abs(relX - targetX) < letterThickness) isLetter = true;
        }

        if (isLetter) {
          pixels.push(255, 255, 255, 255); // White letter
        } else {
          pixels.push(COLOR.r, COLOR.g, COLOR.b, 255); // Blue background
        }
      } else {
        pixels.push(0, 0, 0, 0); // Transparent
      }
    }
  }

  return encodePNG(size, size, pixels);
}

// Minimal PNG encoder
function encodePNG(width, height, pixels) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8);  // bit depth
  ihdr.writeUInt8(6, 9);  // color type (RGBA)
  ihdr.writeUInt8(0, 10); // compression
  ihdr.writeUInt8(0, 11); // filter
  ihdr.writeUInt8(0, 12); // interlace

  const ihdrChunk = createChunk('IHDR', ihdr);

  // IDAT chunk (image data)
  const rawData = [];
  for (let y = 0; y < height; y++) {
    rawData.push(0); // filter byte
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      rawData.push(pixels[idx], pixels[idx + 1], pixels[idx + 2], pixels[idx + 3]);
    }
  }

  const zlib = require('zlib');
  const compressed = zlib.deflateSync(Buffer.from(rawData), { level: 9 });
  const idatChunk = createChunk('IDAT', compressed);

  // IEND chunk
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBuffer = Buffer.from(type);
  const crcData = Buffer.concat([typeBuffer, data]);
  const crc = crc32(crcData);

  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc >>> 0, 0);

  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

// CRC32 implementation
function crc32(data) {
  let crc = 0xffffffff;
  const table = getCRC32Table();

  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }

  return crc ^ 0xffffffff;
}

let crc32Table = null;
function getCRC32Table() {
  if (crc32Table) return crc32Table;

  crc32Table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crc32Table[i] = c;
  }
  return crc32Table;
}

// Main
console.log('Generating extension icons...');

// Ensure directory exists
if (!fs.existsSync(ICON_DIR)) {
  fs.mkdirSync(ICON_DIR, { recursive: true });
}

for (const size of ICON_SIZES) {
  const png = createPNG(size);
  const filename = path.join(ICON_DIR, `icon${size}.png`);
  fs.writeFileSync(filename, png);
  console.log(`  Created: icon${size}.png`);
}

console.log('Done! Icons created in public/icons/');
