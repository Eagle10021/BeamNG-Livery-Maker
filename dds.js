// Minimal DDS Decoder for DXT1, DXT3, DXT5, BC4, BC5 and BC7
// Supports legacy DXTn FourCC and DX10 Header (BC1, BC2, BC3, BC4, BC5, BC7)

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

// BC7 partition tables (2 and 3 subsets, 64 shapes of 16 texels each): one hex digit per texel, the subset in the
// low two bits and 8 added on the subset's anchor ("fix-up") texel, whose index is stored with one bit less.
// From bcdec by Sergii Kudlai (https://github.com/iOrange/bcdec), MIT / Unlicense.
const BC7_P2 = "8011001100110019800100010001000981110111011101198001001100110119800000010001001980110111011111198001001101111119800000010011011980000000000100198011011111111119800000010111111980000000000101198001011111111119800000001111111980001111111111198000000000001119800010001110111981910001000000008000000090001110819100110001000080910001000000008000100091001110800000009000110081110011001100098091000100010000800010009000110081900110011001108091011001101100800101119110100080001111911100008191000110001110809110011001110081010101010101098000111100001119810110900101101080110011910011008091110000111100810101019010101081101001011010098101101010100109819100111100111080010011910010008091001001001100809110111101110081901001100101108011110011000019811001101001100980000190011000008100119001000000809001110010000080000090011100108000010091100100811011001001001980110110110010098190001110011100809110011100011081101100110010098110001100111009811111101000000980011000111001198000111100110019809100111111000080900010111011108100010001110119";
const BC7_P3 = "801900110221222a80090011a211222180002001a2112219822a002200110119800000009122112a801900110022002a802a00221111111980110011a2112219800000009111222a800011119111222a800011912222222a801200920012001a811201920112011a812209220122012a801901121122122a80192001a2002220800900110112112a81190011a0012200800011229122112a802a002200221119811901110222022a80090001a2212221800000910122012a80001100a2902210812a092200110000801200129122222a811012a1922101108000019012a11221802211029102002a811009102002222a8011012201a2001980002000a2112229800000029122122a822a002200120019801900120022022a8120092001a001208000119122a2000081201201a0920120812020129a0101208011220011a20019801111a222000019810901012222222a80000000a1212129802219220022112a802a001100220019822012a102201229810122a22222010980002121a1212129810901010101222a822a011102220119800219120002111a800029122112211a822209110111022a800211129112000a811009100110222a800000002192211a811009102222222a802200110091002a802211229122002a800000000000291a800a000100020009822212220222922a810922222222222a81192011a2012220";
const BC7_TABLES = [BC7_P2, BC7_P3].map(t => Uint8Array.from(t, c => parseInt(c, 16)));

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
            else if (dxgiFormat === DXGI_FORMAT_BC7_UNORM || dxgiFormat === DXGI_FORMAT_BC7_UNORM_SRGB) format = 'BC7';
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
        } else if (header.format === 'BC7') {
            byteArray = this.decodeBC7(new Uint8Array(buffer, header.dataOffset), header.width, header.height);
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

    // BC7 Decompression (all 8 modes), following the BPTC specification / bcdec
    static decodeBC7(bytes, width, height) {
        const rgba = new Uint8ClampedArray(width * height * 4);
        const bitsRGB = [4, 6, 5, 7, 5, 7, 7, 5];   // endpoint bits per mode, colour
        const bitsA = [0, 0, 0, 0, 6, 8, 7, 5];     // ...and alpha
        const hasPBits = 0b11001011;                // modes 0, 1, 3, 6, 7
        const W2 = [0, 21, 43, 64], W3 = [0, 9, 18, 27, 37, 46, 55, 64];
        const W4 = [0, 4, 9, 13, 17, 21, 26, 30, 34, 38, 43, 47, 51, 55, 60, 64];
        const lerp = (a, b, w, i) => ((64 - w[i]) * a + w[i] * b + 32) >> 6;
        const words = new Uint32Array(4);
        const ep = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
        const idx = new Uint8Array(16);
        let pos = 0;
        const read = n => {                         // n <= 8 bits, least significant first
            const i = pos >> 5, o = pos & 31;
            let v = words[i] >>> o;
            if (o + n > 32) v |= words[i + 1] << (32 - o);
            pos += n;
            return v & ((1 << n) - 1);
        };
        let off = 0;
        for (let by = 0; by < height; by += 4) {
            for (let bx = 0; bx < width; bx += 4, off += 16) {
                for (let k = 0; k < 4; k++)
                    words[k] = (bytes[off + 4 * k] | (bytes[off + 4 * k + 1] << 8) | (bytes[off + 4 * k + 2] << 16) | (bytes[off + 4 * k + 3] << 24)) >>> 0;
                pos = 0;
                let mode = 0;
                while (mode < 8 && read(1) === 0) mode++;
                if (mode >= 8) continue;            // reserved: transparent black (the array is already 0)

                let parts = 1, partition = 0, rotation = 0, isb = 0;
                if (mode === 0 || mode === 1 || mode === 2 || mode === 3 || mode === 7) {
                    parts = (mode === 0 || mode === 2) ? 3 : 2;
                    partition = read(mode === 0 ? 4 : 6);
                }
                const nEp = parts * 2;
                if (mode === 4 || mode === 5) {
                    rotation = read(2);
                    if (mode === 4) isb = read(1);
                }
                for (let c = 0; c < 3; c++) for (let e = 0; e < nEp; e++) ep[e][c] = read(bitsRGB[mode]);
                if (bitsA[mode]) for (let e = 0; e < nEp; e++) ep[e][3] = read(bitsA[mode]);
                else for (let e = 0; e < nEp; e++) ep[e][3] = 0;

                const pb = (hasPBits >> mode) & 1;
                if (pb) {
                    for (let e = 0; e < nEp; e++) for (let c = 0; c < 4; c++) ep[e][c] <<= 1;
                    if (mode === 1) {               // one P-bit shared by each subset's two endpoints
                        const p0 = read(1), p1 = read(1);
                        for (let c = 0; c < 3; c++) { ep[0][c] |= p0; ep[1][c] |= p0; ep[2][c] |= p1; ep[3][c] |= p1; }
                    } else {
                        for (let e = 0; e < nEp; e++) { const p = read(1); for (let c = 0; c < 4; c++) ep[e][c] |= p; }
                    }
                }
                const nc = bitsRGB[mode] + pb, na = bitsA[mode] + pb;
                for (let e = 0; e < nEp; e++) {
                    for (let c = 0; c < 3; c++) { const v = ep[e][c] << (8 - nc); ep[e][c] = (v | (v >> nc)) & 255; }
                    if (bitsA[mode]) { const v = ep[e][3] << (8 - na); ep[e][3] = (v | (v >> na)) & 255; }
                    else ep[e][3] = 255;
                }

                const ib = (mode === 0 || mode === 1) ? 3 : (mode === 6 ? 4 : 2);
                const ib2 = mode === 4 ? 3 : (mode === 5 ? 2 : 0);
                const w1 = ib === 2 ? W2 : (ib === 3 ? W3 : W4), w2 = ib2 === 2 ? W2 : W3;
                const table = parts > 1 ? BC7_TABLES[parts - 2] : null;
                const base = partition * 16;
                for (let t = 0; t < 16; t++) {
                    const s = table ? table[base + t] : (t ? 0 : 8);
                    idx[t] = read((s & 8) ? ib - 1 : ib);
                }
                for (let t = 0; t < 16; t++) {
                    const s = (table ? table[base + t] : 0) & 3;
                    const a0 = ep[2 * s], a1 = ep[2 * s + 1];
                    const i1 = idx[t];
                    let r, g, b, a;
                    if (!ib2) {
                        r = lerp(a0[0], a1[0], w1, i1); g = lerp(a0[1], a1[1], w1, i1);
                        b = lerp(a0[2], a1[2], w1, i1); a = lerp(a0[3], a1[3], w1, i1);
                    } else {
                        const i2 = read(t ? ib2 : ib2 - 1);
                        if (!isb) {
                            r = lerp(a0[0], a1[0], w1, i1); g = lerp(a0[1], a1[1], w1, i1);
                            b = lerp(a0[2], a1[2], w1, i1); a = lerp(a0[3], a1[3], w2, i2);
                        } else {
                            r = lerp(a0[0], a1[0], w2, i2); g = lerp(a0[1], a1[1], w2, i2);
                            b = lerp(a0[2], a1[2], w2, i2); a = lerp(a0[3], a1[3], w1, i1);
                        }
                    }
                    if (rotation === 1) { const x = a; a = r; r = x; }
                    else if (rotation === 2) { const x = a; a = g; g = x; }
                    else if (rotation === 3) { const x = a; a = b; b = x; }
                    const px = bx + (t & 3), py = by + (t >> 2);
                    if (px >= width || py >= height) continue;
                    const o = (py * width + px) * 4;
                    rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = a;
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
