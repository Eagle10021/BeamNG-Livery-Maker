// Minimal ZIP reader for BeamNG vehicle archives (content/vehicles/<id>.zip). Reads only the central directory,
// then decompresses single entries on demand (stored or deflate, ZIP64 aware) with DecompressionStream.

const u16 = (v, o) => v.getUint16(o, true);
const u32 = (v, o) => v.getUint32(o, true);
const u64 = (v, o) => Number(v.getBigUint64(o, true));

async function slice(file, start, end) {
    return new DataView(await file.slice(start, end).arrayBuffer());
}

export async function openZip(file) {
    const size = file.size;
    const tailLen = Math.min(size, 65557 + 20);
    const tail = await slice(file, size - tailLen, size);
    let eocd = -1;
    for (let i = tail.byteLength - 22; i >= 0; i--) {
        if (u32(tail, i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error("Not a zip file (no central directory found)");
    let count = u16(tail, eocd + 10);
    let cdSize = u32(tail, eocd + 12);
    let cdOffset = u32(tail, eocd + 16);
    // ZIP64: the real values sit in the ZIP64 end record, found through its locator just before the EOCD
    if (cdOffset === 0xffffffff || count === 0xffff || cdSize === 0xffffffff) {
        const loc = eocd - 20;
        if (loc >= 0 && u32(tail, loc) === 0x07064b50) {
            const z64Offset = u64(tail, loc + 8);
            const z = await slice(file, z64Offset, z64Offset + 56);
            if (u32(z, 0) === 0x06064b50) {
                count = u64(z, 32);
                cdSize = u64(z, 40);
                cdOffset = u64(z, 48);
            }
        }
    }
    const cd = await slice(file, cdOffset, cdOffset + cdSize);
    const dec = new TextDecoder();
    const entries = [];
    let p = 0;
    for (let n = 0; n < count && p + 46 <= cd.byteLength; n++) {
        if (u32(cd, p) !== 0x02014b50) break;
        const method = u16(cd, p + 10);
        let compSize = u32(cd, p + 20), uncompSize = u32(cd, p + 24);
        const nameLen = u16(cd, p + 28), extraLen = u16(cd, p + 30), commentLen = u16(cd, p + 32);
        let localOffset = u32(cd, p + 42);
        const name = dec.decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nameLen));
        // ZIP64 extra field (id 1) holds the sizes / offset that overflowed, in this order
        let e = p + 46 + nameLen;
        const eEnd = e + extraLen;
        while (e + 4 <= eEnd) {
            const id = u16(cd, e), len = u16(cd, e + 2);
            if (id === 1) {
                let q = e + 4;
                if (uncompSize === 0xffffffff) { uncompSize = u64(cd, q); q += 8; }
                if (compSize === 0xffffffff) { compSize = u64(cd, q); q += 8; }
                if (localOffset === 0xffffffff) { localOffset = u64(cd, q); q += 8; }
            }
            e += 4 + len;
        }
        if (!name.endsWith("/")) entries.push({ name, method, compSize, uncompSize, localOffset });
        p += 46 + nameLen + extraLen + commentLen;
    }
    return { file, entries, read: entry => readEntry(file, entry) };
}

async function readEntry(file, entry) {
    const h = await slice(file, entry.localOffset, entry.localOffset + 30);
    if (u32(h, 0) !== 0x04034b50) throw new Error("Broken zip entry: " + entry.name);
    const start = entry.localOffset + 30 + u16(h, 26) + u16(h, 28);
    const blob = file.slice(start, start + entry.compSize);
    if (entry.method === 0) return blob.arrayBuffer();
    if (entry.method === 8) {
        const stream = blob.stream().pipeThrough(new DecompressionStream("deflate-raw"));
        return new Response(stream).arrayBuffer();
    }
    throw new Error(`Unsupported zip compression (method ${entry.method}) for ${entry.name}`);
}

// The first `n` bytes of an entry (a texture's header) without inflating the whole file
export async function readHead(file, entry, n) {
    const h = await slice(file, entry.localOffset, entry.localOffset + 30);
    const start = entry.localOffset + 30 + u16(h, 26) + u16(h, 28);
    const blob = file.slice(start, start + entry.compSize);
    if (entry.method === 0) return new Uint8Array(await blob.slice(0, n).arrayBuffer());
    const reader = blob.stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
    const out = new Uint8Array(n);
    let got = 0;
    while (got < n) {
        const { value, done } = await reader.read();
        if (done) break;
        const take = Math.min(value.length, n - got);
        out.set(value.subarray(0, take), got);
        got += take;
    }
    reader.cancel().catch(() => {});
    return out.subarray(0, got);
}
