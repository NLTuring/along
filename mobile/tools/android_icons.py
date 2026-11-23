"""Patch only the verified launcher background entry in Android resources.arsc."""
import struct


def patch_launcher_background(data, expected=0xFFEEF3EF, replacement=0xFFF7F2E8):
    if len(data) < 12 or struct.unpack_from('<H', data)[0] != 0x0002 or struct.unpack_from('<I', data, 4)[0] != len(data):
        raise ValueError('Invalid resources table')
    result = bytearray(data)
    changed = []
    offset = struct.unpack_from('<H', data, 2)[0]
    while offset < len(data):
        kind, head, size = struct.unpack_from('<HHI', data, offset)
        if head < 8 or size < head or offset + size > len(data):
            raise ValueError('Invalid resources chunk')
        if kind == 0x0200 and struct.unpack_from('<I', data, offset + 8)[0] == 0x7F:
            child = offset + head
            while child < offset + size:
                ck, ch, cs = struct.unpack_from('<HHI', data, child)
                if ch < 8 or cs < ch or child + cs > offset + size:
                    raise ValueError('Invalid package resource chunk')
                if ck == 0x0201 and data[child + 8] == 0x04:
                    flags = data[child + 9]
                    count, entries = struct.unpack_from('<II', data, child + 12)
                    if flags != 0 or ch + count * 4 > entries or entries > cs:
                        raise ValueError('Unsupported color resource offset table')
                    if count > 0x34:
                        relative = struct.unpack_from('<I', data, child + ch + 0x34 * 4)[0]
                        if relative != 0xFFFFFFFF:
                            at = child + entries + relative
                            if at + 16 > child + cs:
                                raise ValueError('Color entry is truncated')
                            entry_size, entry_flags = struct.unpack_from('<HH', data, at)
                            value = at + entry_size
                            if entry_size < 8 or entry_flags & 1 or value + 8 > child + cs:
                                raise ValueError('Unsupported color resource entry')
                            value_size, reserved, value_type, colour = struct.unpack_from('<HBBI', data, value)
                            if value_size != 8 or reserved != 0 or value_type not in [0x1C, 0x1D] or colour != expected:
                                raise ValueError('Unexpected launcher background value')
                            struct.pack_into('<I', result, value + 4, replacement)
                            changed.append(value + 4)
                child += cs
        offset += size
    if len(changed) != 1:
        raise ValueError('Expected exactly one launcher background resource')
    return bytes(result)
