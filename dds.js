// Minimal DDS Decoder for DXT1, DXT3, DXT5
// Supports legacy DXTn FourCC and DX10 Header (BC1, BC2, BC3)

const DDS_MAGIC = 0x20534444;       // "DDS "
const DDSD_MIPMAPCOUNT = 0x20000;
const DDPF_FOURCC = 0x4;

const FOURCC_DXT1 = 0x31545844; // "DXT1"
const FOURCC_DXT3 = 0x33545844; // "DXT3"
const FOURCC_DXT5 = 0x35545844; // "DXT5"
const FOURCC_DX10 = 0x30315844; // "DX10"

// DXGI Formats for DX10 Header
const DXGI_FORMAT_BC1_UNORM = 71;
const DXGI_FORMAT_BC1_UNORM_SRGB = 72;
const DXGI_FORMAT_BC2_UNORM = 74;
const DXGI_FORMAT_BC2_UNORM_SRGB = 75;
const DXGI_FORMAT_BC3_UNORM = 77;
const DXGI_FORMAT_BC3_UNORM_SRGB = 78;
const DXGI_FORMAT_BC4_UNORM = 80;
const DXGI_FORMAT_BC5_UNORM = 83;
const DXGI_FORMAT_BC7_UNORM = 98;
const DXGI_FORMAT_BC7_UNORM_SRGB = 99;

class DDSDecoder {
    static parseHeader(buffer) {
        const view = new DataView(buffer);
        if (view.getUint32(0, true) !== DDS_MAGIC) {
            throw new Error("Invalid DDS magic");
        }

        const height = view.getUint32(12, true);
        const width = view.getUint32(16, true);
        const mipmapCount = (view.getUint32(20, true) & DDSD_MIPMAPCOUNT) ? Math.max(1, view.getUint32(28, true)) : 1;

        const pfFlags = view.getUint32(80, true);
        if (!(pfFlags & DDPF_FOURCC)) {
            throw new Error("Only Compressed DDS (FourCC) supported");
        }

        const fourCC = view.getUint32(84, true);
        let format = null;
        let dataOffset = 128; // Standard Header size

        // Check for Standard FourCC
        if (fourCC === FOURCC_DXT1) format = 'DXT1';
        else if (fourCC === FOURCC_DXT3) format = 'DXT3';
        else if (fourCC === FOURCC_DXT5) format = 'DXT5';
        else if (fourCC === FOURCC_DX10) {
            // Handle DX10 Header
            const dxgiFormat = view.getUint32(128, true);

            // Map DXGI formats to DXT
            if (dxgiFormat === DXGI_FORMAT_BC1_UNORM || dxgiFormat === DXGI_FORMAT_BC1_UNORM_SRGB) format = 'DXT1';
            else if (dxgiFormat === DXGI_FORMAT_BC2_UNORM || dxgiFormat === DXGI_FORMAT_BC2_UNORM_SRGB) format = 'DXT3';
            else if (dxgiFormat === DXGI_FORMAT_BC3_UNORM || dxgiFormat === DXGI_FORMAT_BC3_UNORM_SRGB) format = 'DXT5';
            else if (dxgiFormat === DXGI_FORMAT_BC4_UNORM) format = 'BC4';
            else if (dxgiFormat === DXGI_FORMAT_BC5_UNORM) format = 'BC5';
            else if (dxgiFormat === DXGI_FORMAT_BC7_UNORM || dxgiFormat === DXGI_FORMAT_BC7_UNORM_SRGB) {
                throw new Error("Unsupported Texture Format.\n\nThe file uses BC7 compression, which browsers cannot read.\n\nPlease convert this skin to DXT5 (BC3) format using Paint.NET or Photoshop and upload it manually.\n\nSee the guide for more information.");
            }
            else {
                throw new Error(`Unsupported DXGI Format: ${dxgiFormat}`);
            }

            dataOffset = 148; // 128 (standard) + 20 (DX10)
        } else {
            throw new Error("Unsupported FourCC: " + fourCC.toString(16));
        }

        return { width, height, format, mipmapCount, dataOffset };
    }

    static decode(buffer) {
        const header = this.parseHeader(buffer);
        const dataView = new DataView(buffer, header.dataOffset);

        let byteArray;

        if (header.format === 'DXT1') {
            byteArray = this.decodeDXT1(dataView, header.width, header.height);
        } else if (header.format === 'DXT3') {
            byteArray = this.decodeDXT3(dataView, header.width, header.height);
        } else if (header.format === 'DXT5') {
            byteArray = this.decodeDXT5(dataView, header.width, header.height);
        } else if (header.format === 'BC4') {
            byteArray = this.decodeBC4(dataView, header.width, header.height);
        } else if (header.format === 'BC5') {
            byteArray = this.decodeBC5(dataView, header.width, header.height);
        }

        return {
            width: header.width,
            height: header.height,
            data: byteArray // Uint8ClampedArray (RGBA)
        };
    }

    // DXT1 Decompression
    static decodeDXT1(view, width, height) {
        const rgba = new Uint8ClampedArray(width * height * 4);
        let offset = 0;

        for (let y = 0; y < height; y += 4) {
            for (let x = 0; x < width; x += 4) {
                const c0 = view.getUint16(offset, true);
                const c1 = view.getUint16(offset + 2, true);
                const code = view.getUint32(offset + 4, true);
                offset += 8;

                const r0 = (c0 & 0xF800) >> 8;
                const g0 = (c0 & 0x07E0) >> 3;
                const b0 = (c0 & 0x001F) << 3;

                const r1 = (c1 & 0xF800) >> 8;
                const g1 = (c1 & 0x07E0) >> 3;
                const b1 = (c1 & 0x001F) << 3;

                for (let py = 0; py < 4; py++) {
                    if (y + py >= height) continue;
                    for (let px = 0; px < 4; px++) {
                        if (x + px >= width) continue;

                        const shift = 2 * (py * 4 + px);
                        const bits = (code >> shift) & 3;

                        let r, g, b, a = 255;

                        if (c0 > c1) {
                            if (bits === 0) { r = r0; g = g0; b = b0; }
                            else if (bits === 1) { r = r1; g = g1; b = b1; }
                            else if (bits === 2) { r = (2 * r0 + r1) / 3; g = (2 * g0 + g1) / 3; b = (2 * b0 + b1) / 3; }
                            else { r = (r0 + 2 * r1) / 3; g = (g0 + 2 * g1) / 3; b = (b0 + 2 * b1) / 3; }
                        } else {
                            if (bits === 0) { r = r0; g = g0; b = b0; }
                            else if (bits === 1) { r = r1; g = g1; b = b1; }
                            else if (bits === 2) { r = (r0 + r1) / 2; g = (g0 + g1) / 2; b = (b0 + b1) / 2; }
                            else { r = 0; g = 0; b = 0; a = 0; }
                        }

                        const idx = 4 * ((y + py) * width + (x + px));
                        rgba[idx] = r;
                        rgba[idx + 1] = g;
                        rgba[idx + 2] = b;
                        rgba[idx + 3] = a;
                    }
                }
            }
        }
        return rgba;
    }

    // DXT3 Decompression (Explicit Alpha)
    static decodeDXT3(view, width, height) {
        const rgba = new Uint8ClampedArray(width * height * 4);
        let offset = 0;

        for (let y = 0; y < height; y += 4) {
            for (let x = 0; x < width; x += 4) {
                // Read 64-bit alpha block
                const alphaData = [
                    view.getUint16(offset, true),
                    view.getUint16(offset + 2, true),
                    view.getUint16(offset + 4, true),
                    view.getUint16(offset + 6, true),
                ];
                offset += 8;

                const c0 = view.getUint16(offset, true);
                const c1 = view.getUint16(offset + 2, true);
                const code = view.getUint32(offset + 4, true);
                offset += 8;

                const r0 = (c0 & 0xF800) >> 8;
                const g0 = (c0 & 0x07E0) >> 3;
                const b0 = (c0 & 0x001F) << 3;

                const r1 = (c1 & 0xF800) >> 8;
                const g1 = (c1 & 0x07E0) >> 3;
                const b1 = (c1 & 0x001F) << 3;

                for (let py = 0; py < 4; py++) {
                    if (y + py >= height) continue;
                    for (let px = 0; px < 4; px++) {
                        if (x + px >= width) continue;

                        // Alpha
                        const alphaWord = alphaData[py];
                        const alphaBits = (alphaWord >> (px * 4)) & 0xF;
                        const a = (alphaBits * 17); // Expand 4-bit to 8-bit

                        // Color (same as DXT1)
                        const shift = 2 * (py * 4 + px);
                        const bits = (code >> shift) & 3;
                        let r, g, b;

                        if (bits === 0) { r = r0; g = g0; b = b0; }
                        else if (bits === 1) { r = r1; g = g1; b = b1; }
                        else if (bits === 2) { r = (2 * r0 + r1) / 3; g = (2 * g0 + g1) / 3; b = (2 * b0 + b1) / 3; }
                        else { r = (r0 + 2 * r1) / 3; g = (g0 + 2 * g1) / 3; b = (b0 + 2 * b1) / 3; }

                        const idx = 4 * ((y + py) * width + (x + px));
                        rgba[idx] = r;
                        rgba[idx + 1] = g;
                        rgba[idx + 2] = b;
                        rgba[idx + 3] = a;
                    }
                }
            }
        }
        return rgba;
    }

    // DXT5 Decompression (Interpolated Alpha)
    static decodeDXT5(view, width, height) {
        const rgba = new Uint8ClampedArray(width * height * 4);
        let offset = 0;

        for (let y = 0; y < height; y += 4) {
            for (let x = 0; x < width; x += 4) {
                // Alpha Block
                const a0 = view.getUint8(offset);
                const a1 = view.getUint8(offset + 1);
                // 48 bits of indices (6 bytes)
                const alphaBits1 = view.getUint16(offset + 2, true);
                const alphaBits2 = view.getUint16(offset + 4, true);
                const alphaBits3 = view.getUint16(offset + 6, true);
                // Combine to easier read 
                let alphaCode = BigInt(alphaBits1) | (BigInt(alphaBits2) << 16n) | (BigInt(alphaBits3) << 32n);

                offset += 8;

                // Color Block
                const c0 = view.getUint16(offset, true);
                const c1 = view.getUint16(offset + 2, true);
                const code = view.getUint32(offset + 4, true);
                offset += 8;

                const r0 = (c0 & 0xF800) >> 8;
                const g0 = (c0 & 0x07E0) >> 3;
                const b0 = (c0 & 0x001F) << 3;

                const r1 = (c1 & 0xF800) >> 8;
                const g1 = (c1 & 0x07E0) >> 3;
                const b1 = (c1 & 0x001F) << 3;

                // Precompute alphas
                const alphas = new Float32Array(8);
                alphas[0] = a0;
                alphas[1] = a1;
                if (a0 > a1) {
                    for (let i = 2; i < 8; i++) alphas[i] = ((8 - i) * a0 + (i - 1) * a1) / 7;
                } else {
                    for (let i = 2; i < 6; i++) alphas[i] = ((6 - i) * a0 + (i - 1) * a1) / 5;
                    alphas[6] = 0;
                    alphas[7] = 255;
                }

                for (let py = 0; py < 4; py++) {
                    if (y + py >= height) continue;
                    for (let px = 0; px < 4; px++) {
                        if (x + px >= width) continue;

                        // Alpha index
                        const alphaIdx = Number(alphaCode & 7n);
                        alphaCode >>= 3n;
                        const a = Math.floor(alphas[alphaIdx]);

                        // Color
                        const shift = 2 * (py * 4 + px);
                        const bits = (code >> shift) & 3;
                        let r, g, b;

                        if (bits === 0) { r = r0; g = g0; b = b0; }
                        else if (bits === 1) { r = r1; g = g1; b = b1; }
                        else if (bits === 2) { r = (2 * r0 + r1) / 3; g = (2 * g0 + g1) / 3; b = (2 * b0 + b1) / 3; }
                        else { r = (r0 + 2 * r1) / 3; g = (g0 + 2 * g1) / 3; b = (b0 + 2 * b1) / 3; }

                        const idx = 4 * ((y + py) * width + (x + px));
                        rgba[idx] = r;
                        rgba[idx + 1] = g;
                        rgba[idx + 2] = b;
                        rgba[idx + 3] = a;
                    }
                }
            }
        }
        return rgba;
    }

    static decodeBC4(view, width, height) {
        const rgba = new Uint8ClampedArray(width * height * 4);
        let offset = 0;
        for (let y = 0; y < height; y += 4) {
            for (let x = 0; x < width; x += 4) {
                const a0 = view.getUint8(offset);
                const a1 = view.getUint8(offset + 1);
                const aBits1 = view.getUint16(offset + 2, true);
                const aBits2 = view.getUint16(offset + 4, true);
                const aBits3 = view.getUint16(offset + 6, true);
                let aCode = BigInt(aBits1) | (BigInt(aBits2) << 16n) | (BigInt(aBits3) << 32n);
                offset += 8;

                const alphas = new Float32Array(8);
                alphas[0] = a0; alphas[1] = a1;
                if (a0 > a1) for (let i = 2; i < 8; i++) alphas[i] = ((8 - i) * a0 + (i - 1) * a1) / 7;
                else { for (let i = 2; i < 6; i++) alphas[i] = ((6 - i) * a0 + (i - 1) * a1) / 5; alphas[6] = 0; alphas[7] = 255; }

                for (let py = 0; py < 4; py++) {
                    if (y + py >= height) continue;
                    for (let px = 0; px < 4; px++) {
                        if (x + px >= width) continue;
                        const val = Math.floor(alphas[Number(aCode & 7n)]);
                        aCode >>= 3n;
                        const idx = 4 * ((y + py) * width + (x + px));
                        rgba[idx] = val; rgba[idx + 1] = val; rgba[idx + 2] = val; rgba[idx + 3] = 255;
                    }
                }
            }
        }
        return rgba;
    }

    static decodeBC5(view, width, height) {
        const rgba = new Uint8ClampedArray(width * height * 4);
        let offset = 0;
        for (let y = 0; y < height; y += 4) {
            for (let x = 0; x < width; x += 4) {
                // Red Channel
                const r0 = view.getUint8(offset);
                const r1 = view.getUint8(offset + 1);
                const rBits = BigInt(view.getUint16(offset + 2, true)) | (BigInt(view.getUint16(offset + 4, true)) << 16n) | (BigInt(view.getUint16(offset + 6, true)) << 32n);
                offset += 8;
                // Green Channel
                const g0 = view.getUint8(offset);
                const g1 = view.getUint8(offset + 1);
                const gBits = BigInt(view.getUint16(offset + 2, true)) | (BigInt(view.getUint16(offset + 4, true)) << 16n) | (BigInt(view.getUint16(offset + 6, true)) << 32n);
                offset += 8;

                const rs = new Float32Array(8); rs[0] = r0; rs[1] = r1;
                if (r0 > r1) for (let i = 2; i < 8; i++) rs[i] = ((8 - i) * r0 + (i - 1) * r1) / 7;
                else { for (let i = 2; i < 6; i++) rs[i] = ((6 - i) * r0 + (i - 1) * r1) / 5; rs[6] = 0; rs[7] = 255; }

                const gs = new Float32Array(8); gs[0] = g0; gs[1] = g1;
                if (g0 > g1) for (let i = 2; i < 8; i++) gs[i] = ((8 - i) * g0 + (i - 1) * g1) / 7;
                else { for (let i = 2; i < 6; i++) gs[i] = ((6 - i) * g0 + (i - 1) * g1) / 5; gs[6] = 0; gs[7] = 255; }

                let rb = rBits, gb = gBits;
                for (let py = 0; py < 4; py++) {
                    if (y + py >= height) continue;
                    for (let px = 0; px < 4; px++) {
                        if (x + px >= width) continue;
                        const rV = Math.floor(rs[Number(rb & 7n)]); rb >>= 3n;
                        const gV = Math.floor(gs[Number(gb & 7n)]); gb >>= 3n;
                        const idx = 4 * ((y + py) * width + (x + px));
                        rgba[idx] = rV; rgba[idx + 1] = gV; rgba[idx + 2] = 0; rgba[idx + 3] = 255;
                    }
                }
            }
        }
        return rgba;
    }
}

class DDSEncoder {
    static encode(imageData) {
        // Create an uncompressed RGBA (A8R8G8B8) DDS
        // Header: 128 bytes
        const height = imageData.height;
        const width = imageData.width;
        const data = imageData.data; // RGBA Uint8ClampedArray

        const headerSize = 128;
        const bufferSize = headerSize + (width * height * 4);
        const buffer = new ArrayBuffer(bufferSize);
        const view = new DataView(buffer);

        // --- Header Write ---
        // Magic 'DDS '
        view.setUint32(0, 0x20534444, true);

        // dwSize (124)
        view.setUint32(4, 124, true);

        // dwFlags (CAPS | HEIGHT | WIDTH | PIXELFORMAT)
        // DDSD_CAPS=0x1, DDSD_HEIGHT=0x2, DDSD_WIDTH=0x4, DDSD_PIXELFORMAT=0x1000
        view.setUint32(8, 0x1 | 0x2 | 0x4 | 0x1000, true);

        // dwHeight, dwWidth
        view.setUint32(12, height, true);
        view.setUint32(16, width, true);

        // dwPitchOrLinearSize (Width * 4 for uncompressed)
        view.setUint32(20, width * 4, true);

        // dwPixelFormat (offset 76)
        // dwSize (32)
        view.setUint32(76, 32, true);
        // dwFlags (DDPF_RGB | DDPF_ALPHAPIXELS) -> 0x40 | 0x1
        view.setUint32(80, 0x41, true);
        // dwFourCC (0)
        view.setUint32(84, 0, true);
        // dwRGBBitCount (32)
        view.setUint32(88, 32, true);
        // dwRBitMask (0x00FF0000 - BGRA format for DirectX/DDS standard usually, let's stick to standard map)
        // Actually simplest uncompressed for compat is usually BGRA (A8R8G8B8)
        view.setUint32(92, 0x00FF0000, true); // Red
        view.setUint32(96, 0x0000FF00, true); // Green
        view.setUint32(100, 0x000000FF, true); // Blue
        view.setUint32(104, 0xFF000000, true); // Alpha

        // dwCaps (DDSCAPS_TEXTURE)
        view.setUint32(108, 0x1000, true);

        // --- Data Write ---
        // Convert RGBA to BGRA (Standard DDS uncompressed)
        let offset = 128;
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];

            // BGRA
            view.setUint8(offset, b);
            view.setUint8(offset + 1, g);
            view.setUint8(offset + 2, r);
            view.setUint8(offset + 3, a);

            offset += 4;
        }

        return buffer;
    }
}
