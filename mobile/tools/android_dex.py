"""Two verified changes to the original shell's classes.dex.

1. Show Baidu's own map labels. EmbeddedMapController.create() calls BaiduMap.showMapPoi(v4)
with v4 = 0, which hides every built-in label (place names, POI icons, district names). At that
instruction v1 still holds the constant 1 set at the top of the method (offset 4,
"const/4 v1, 1"; v1 is next written at offset 225), so passing v1 instead of v4 turns the labels
on. Only the operand nibble changes.

2. Let a tel: link reach the phone's dialer. MainActivity.openExternal() refuses anything whose
URI has no host and whose scheme is not http/https, so "tel:110" is dropped and Help's two
emergency buttons do nothing. The method is:
    if (length > 8192) throw
    if (uri.getHost() == null) throw            <- 0x0012
    if (uri.getUserInfo() != null) throw
    if (!"https".equals(scheme) && !"http".equals(scheme)) throw   <- 0x0026
Two operands are changed: the host test at 0x0012 becomes two nops, and the "http" constant at
0x0026 becomes "tel". openExternal then accepts https and tel: the Intent(ACTION_VIEW, tel:110)
starts the dialer with the number typed in. http: links are no longer opened by the shell; the
web layer only ever hands it https: links. No registers, branches or types change.

The dex header checksum (Adler-32) and signature (SHA-1) are recomputed afterwards.

Usage: python -I mobile/tools/android_dex.py <classes.dex>   (prints what would change; writes nothing)
"""
import hashlib
import struct
import sys
import zlib

# invoke-virtual {v0, v4}, BaiduMap.showMapPoi  -> {v0, v1}
OFFSET = 0x399B36
CONTEXT = bytes.fromhex('5460f254')                # iget-object v0, v6, BaiduMap field (the line before)
ORIGINAL = bytes.fromhex('6e20cc7a4000')
PATCHED = bytes.fromhex('6e20cc7a1000')
SET_TRUE = (0x3999F8 + 4 * 2, bytes.fromhex('1211'))  # const/4 v1, 1 at method offset 4 (code unit 0x1112, little-endian)
# openExternal(): if-eqz v4, throw -> if-eqz v4, scheme test (a host-less URI is still scheme-checked)
HOST_BRANCH = (0x3A1640, bytes.fromhex('380437006e10'), bytes.fromhex('380408006e10'))
# openExternal(): the second scheme constant, "http" (string@a3aa) -> "tel" (string@ded4)
SCHEME = (0x3A1668, bytes.fromhex('1a04aaa3'), bytes.fromhex('1a04d4de'))
ORIGINAL_LENGTH = 8612476


def _header(dex):
    dex = bytearray(dex)
    dex[12:32] = hashlib.sha1(bytes(dex[32:])).digest()
    dex[8:12] = struct.pack('<I', zlib.adler32(bytes(dex[12:])) & 0xFFFFFFFF)
    return bytes(dex)


def header_valid(dex):
    return dex[12:32] == hashlib.sha1(dex[32:]).digest() and struct.unpack('<I', dex[8:12])[0] == zlib.adler32(dex[12:]) & 0xFFFFFFFF


def _verified(dex):
    if len(dex) != ORIGINAL_LENGTH or dex[:8] != b'dex\n035\x00' or not header_valid(dex):
        raise ValueError('classes.dex is not the verified original shell')


def patch_show_map_poi(dex):
    """Return the patched dex, refusing anything that is not the verified original shell."""
    _verified(dex)
    if dex[OFFSET - len(CONTEXT):OFFSET] != CONTEXT or dex[OFFSET:OFFSET + len(ORIGINAL)] != ORIGINAL:
        raise ValueError('showMapPoi call site does not match the verified original')
    if dex[SET_TRUE[0]:SET_TRUE[0] + 2] != SET_TRUE[1]:
        raise ValueError('register v1 is not the expected constant true')
    out = bytearray(dex)
    out[OFFSET:OFFSET + len(PATCHED)] = PATCHED
    return _header(bytes(out))


def patch_tel_links(dex):
    """Let openExternal() hand tel: links to the dialer, keeping the scheme check for the rest."""
    _verified(dex)
    for offset, before, _ in (HOST_BRANCH, SCHEME):
        if dex[offset:offset + len(before)] != before:
            raise ValueError('openExternal does not match the verified original')
    out = bytearray(dex)
    for offset, before, after in (HOST_BRANCH, SCHEME):
        out[offset:offset + len(after)] = after
    return _header(bytes(out))


def patch_shell(dex):
    """Both changes, as the packager builds it."""
    return patch_tel_links(patch_show_map_poi(dex))


def changed_ranges(before, after):
    """Byte ranges that differ, for the build report."""
    ranges, start = [], None
    for i, (a, b) in enumerate(zip(before, after)):
        if a != b and start is None:
            start = i
        elif a == b and start is not None:
            ranges.append((start, i)); start = None
    if start is not None:
        ranges.append((start, len(before)))
    return ranges


if __name__ == '__main__':
    source = open(sys.argv[1], 'rb').read()
    result = patch_shell(source)
    print('header valid after patch:', header_valid(result))
    print('changed byte ranges:', [(hex(a), hex(b)) for a, b in changed_ranges(source, result)])
