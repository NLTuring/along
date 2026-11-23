"""Read-only inspection of the original APK's dex: which JSON keys the native shell reads/writes.

Usage: python -I tools/inspect-native-bridge.py <classes.dex> [anchor ...]

For every anchor string, prints each method whose code references it, with that method's
string constants and invoked methods in code order. Nothing is written or modified.
"""
import struct
import sys
from pathlib import Path

# Code-unit length per Dalvik opcode (dex 035-039). Unused opcodes are one unit.
LENGTHS = [1] * 256
for op, size in {
    0x02: 2, 0x03: 3, 0x05: 2, 0x06: 3, 0x08: 2, 0x09: 3, 0x13: 2, 0x14: 3, 0x15: 2, 0x16: 2,
    0x17: 3, 0x18: 5, 0x19: 2, 0x1a: 2, 0x1b: 3, 0x1c: 2, 0x1f: 2, 0x20: 2, 0x22: 2, 0x23: 2,
    0x24: 3, 0x25: 3, 0x26: 3, 0x29: 2, 0x2a: 3, 0x2b: 3, 0x2c: 3, 0xfa: 4, 0xfb: 4, 0xfc: 3,
    0xfd: 3, 0xfe: 2, 0xff: 2,
}.items():
    LENGTHS[op] = size
for op in [*range(0x2d, 0x3e), *range(0x44, 0x6e), *range(0x90, 0xb0), *range(0xd0, 0xe3)]:
    LENGTHS[op] = 2
for op in [*range(0x6e, 0x73), *range(0x74, 0x79)]:
    LENGTHS[op] = 3
INVOKES = {*range(0x6e, 0x73), *range(0x74, 0x79)}


def uleb(data, offset):
    result = shift = 0
    while True:
        byte = data[offset]
        offset += 1
        result |= (byte & 0x7f) << shift
        if not byte & 0x80:
            return result, offset
        shift += 7


def mutf8(data, offset):
    _, offset = uleb(data, offset)
    end = data.index(b'\x00', offset)
    return data[offset:end].decode('utf-8', errors='replace')


class Dex:
    def __init__(self, data):
        self.data = data
        if data[:4] != b'dex\n':
            raise SystemExit('Not a dex file')
        (self.string_n, self.string_off, self.type_n, self.type_off, self.proto_n, self.proto_off,
         self.field_n, self.field_off, self.method_n, self.method_off, self.class_n, self.class_off) = struct.unpack_from('<12I', data, 0x38)
        self._strings = {}

    def string(self, index):
        if index not in self._strings:
            (offset,) = struct.unpack_from('<I', self.data, self.string_off + index * 4)
            self._strings[index] = mutf8(self.data, offset)
        return self._strings[index]

    def type(self, index):
        (descriptor,) = struct.unpack_from('<I', self.data, self.type_off + index * 4)
        return self.string(descriptor)

    def method(self, index):
        owner, _proto, name = struct.unpack_from('<HHI', self.data, self.method_off + index * 8)
        return f'{self.type(owner)}->{self.string(name)}'

    def classes(self):
        for i in range(self.class_n):
            fields = struct.unpack_from('<8I', self.data, self.class_off + i * 32)
            if fields[6]:
                yield self.type(fields[0]), fields[6]

    def methods(self, class_data):
        data, offset = self.data, class_data
        counts = []
        for _ in range(4):
            value, offset = uleb(data, offset)
            counts.append(value)
        for _ in range(counts[0] + counts[1]):
            _, offset = uleb(data, offset)
            _, offset = uleb(data, offset)
        for group in counts[2:]:
            index = 0
            for _ in range(group):
                delta, offset = uleb(data, offset)
                _, offset = uleb(data, offset)
                code, offset = uleb(data, offset)
                index += delta
                if code:
                    yield index, code

    def walk(self, code_off):
        """Ordered ('s', text) / ('m', method) references of one method body."""
        (units,) = struct.unpack_from('<I', self.data, code_off + 12)
        base, position, refs = code_off + 16, 0, []
        while position < units:
            unit = struct.unpack_from('<H', self.data, base + position * 2)[0]
            op = unit & 0xff
            if op == 0 and unit in (0x0100, 0x0200, 0x0300):
                size = struct.unpack_from('<H', self.data, base + position * 2 + 2)[0]
                if unit == 0x0100:
                    position += size * 2 + 4
                elif unit == 0x0200:
                    position += size * 4 + 2
                else:
                    (count,) = struct.unpack_from('<I', self.data, base + position * 2 + 4)
                    position += (count * size + 1) // 2 + 4
                continue
            if op == 0x1a:
                refs.append(('s', self.string(struct.unpack_from('<H', self.data, base + position * 2 + 2)[0])))
            elif op == 0x1b:
                refs.append(('s', self.string(struct.unpack_from('<I', self.data, base + position * 2 + 2)[0])))
            elif op in INVOKES:
                name = self.method(struct.unpack_from('<H', self.data, base + position * 2 + 2)[0])
                if op < 0x74:
                    # 35c: count in the high nibble, registers C D E F in unit 2 and G in bits 8-11.
                    count, regs_word = unit >> 12, struct.unpack_from('<H', self.data, base + position * 2 + 4)[0]
                    regs = [(regs_word >> (4 * i)) & 0xf for i in range(4)] + [(unit >> 8) & 0xf]
                    name += ' (' + ', '.join(f'v{r}' for r in regs[:count]) + ')'
                refs.append(('m', name))
            elif op == 0x12:
                nibble = unit >> 12
                refs.append(('n', nibble - 16 if nibble > 7 else nibble, (unit >> 8) & 0xf))
            elif op == 0x13:
                refs.append(('n', struct.unpack_from('<h', self.data, base + position * 2 + 2)[0]))
            elif op == 0x14:
                refs.append(('n', struct.unpack_from('<i', self.data, base + position * 2 + 2)[0]))
            elif op == 0x15:
                refs.append(('n', struct.unpack_from('<h', self.data, base + position * 2 + 2)[0] << 16))
            position += LENGTHS[op]
        return refs


def main():
    dex = Dex(Path(sys.argv[1]).read_bytes())
    anchors = sys.argv[2:]
    show_calls = '--calls' in anchors
    # --class=<descriptor prefix> lists that class's methods; --method=<name> narrows to one method body.
    prefixes = [a.split('=', 1)[1] for a in anchors if a.startswith('--class=')]
    names = [a.split('=', 1)[1] for a in anchors if a.startswith('--method=')]
    outline = '--outline' in anchors
    show_consts = '--consts' in anchors
    limit = None if '--full' in anchors else 160
    anchors = [a for a in anchors if not a.startswith('--')]
    for owner, class_data in dex.classes():
        selected = any(owner.startswith(prefix) for prefix in prefixes)
        if outline and selected:
            print(f'\n{owner}')
            for index, _code in dex.methods(class_data):
                print('   ' + dex.method(index).split('->')[1])
            continue
        for index, code in dex.methods(class_data):
            try:
                refs = dex.walk(code)
            except (struct.error, IndexError, ValueError):
                continue
            texts = [ref[1] for ref in refs if ref[0] == 's']
            hit = [a for a in anchors if a in texts]
            if selected and (not names or dex.method(index).split('->')[1] in names):
                hit = hit or ['class']
            if not hit:
                continue
            print(f'\n=== {dex.method(index)}   [anchors: {", ".join(hit)}]')
            for kind, value, *extra in refs:
                if kind == 's':
                    print('   "' + value.replace('\n', '\\n')[:limit] + '"')
                elif kind == 'n':
                    # Integer limits (payload sizes, list caps). Floats show as raw IEEE bits.
                    if show_consts:
                        print(f'      const {value}' + (f'  (float {struct.unpack("<f", struct.pack("<i", value))[0]:g})' if abs(value) > 1 << 20 else '') + (f' -> v{extra[0]}' if extra else ''))
                elif show_calls:
                    print('      call ' + value)


if __name__ == '__main__':
    main()
