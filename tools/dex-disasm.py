"""Read-only: print raw Dalvik instructions (offset, opcode, operands) of one method.
Usage: python -I tools/dex-disasm.py <classes.dex> <class descriptor> <method name> [from_offset] [count]
Only the few formats needed to follow registers are decoded; everything else prints as raw units.
"""
import runpy
import struct
import sys
from pathlib import Path

inspector = runpy.run_path(str(Path(__file__).with_name('inspect-native-bridge.py')))
Dex, LENGTHS = inspector['Dex'], inspector['LENGTHS']

NAMES = {0x01: 'move', 0x07: 'move-object', 0x0a: 'move-result', 0x0b: 'move-result-wide', 0x0c: 'move-result-object',
         0x0e: 'return-void', 0x12: 'const/4', 0x13: 'const/16', 0x14: 'const', 0x15: 'const/high16', 0x1a: 'const-string',
         0x1c: 'const-class', 0x22: 'new-instance', 0x28: 'goto', 0x32: 'if-eq', 0x33: 'if-ne', 0x38: 'if-eqz', 0x39: 'if-nez',
         0x52: 'iget', 0x54: 'iget-object', 0x55: 'iget-boolean', 0x59: 'iput', 0x5b: 'iput-object', 0x5c: 'iput-boolean',
         0x60: 'sget', 0x62: 'sget-object', 0x6e: 'invoke-virtual', 0x6f: 'invoke-super', 0x70: 'invoke-direct', 0x71: 'invoke-static', 0x72: 'invoke-interface'}

def main():
    path, owner, name = sys.argv[1:4]
    start = int(sys.argv[4]) if len(sys.argv) > 4 else 0
    count = int(sys.argv[5]) if len(sys.argv) > 5 else 400
    data = Path(path).read_bytes()
    dex = Dex(data)
    for klass, class_data in dex.classes():
        if klass != owner:
            continue
        for index, code in dex.methods(class_data):
            if dex.method(index).split('->')[1] != name:
                continue
            registers, = struct.unpack_from('<H', data, code)
            units, = struct.unpack_from('<I', data, code + 12)
            base = code + 16
            print(f'{dex.method(index)} registers={registers} units={units} code_at=0x{base:x}')
            position, shown = 0, 0
            while position < units:
                unit = struct.unpack_from('<H', data, base + position * 2)[0]
                op = unit & 0xff
                if op == 0 and unit in (0x0100, 0x0200, 0x0300):
                    break  # payload tables follow the code
                size = LENGTHS[op]
                raw = [struct.unpack_from('<H', data, base + (position + i) * 2)[0] for i in range(size)]
                text = NAMES.get(op, f'op_{op:02x}')
                if op == 0x12:
                    lit = unit >> 12
                    text += f' v{(unit >> 8) & 0xf}, {lit - 16 if lit > 7 else lit}'
                elif op in (0x0a, 0x0b, 0x0c):
                    text += f' v{unit >> 8}'
                elif op in (0x01, 0x07):
                    text += f' v{(unit >> 8) & 0xf}, v{unit >> 12}'
                elif op in (0x6e, 0x6f, 0x70, 0x71, 0x72):
                    count_regs, regs = unit >> 12, raw[2]
                    regs = [(regs >> (4 * i)) & 0xf for i in range(4)] + [(unit >> 8) & 0xf]
                    text += ' {' + ', '.join(f'v{r}' for r in regs[:count_regs]) + '} ' + dex.method(raw[1])
                elif op in (0x52, 0x54, 0x55, 0x59, 0x5b, 0x5c):
                    text += f' v{(unit >> 8) & 0xf}, v{unit >> 12}, field@{raw[1]}'
                elif op in (0x38, 0x39):
                    target = struct.unpack('<h', struct.pack('<H', raw[1]))[0]
                    text += f' v{unit >> 8}, -> {position + target}'
                elif op == 0x28:
                    target = struct.unpack('<b', bytes([unit >> 8]))[0]
                    text += f' -> {position + target}'
                elif op in (0x32, 0x33):
                    target = struct.unpack('<h', struct.pack('<H', raw[1]))[0]
                    text += f' v{(unit >> 8) & 0xf}, v{unit >> 12}, -> {position + target}'
                if position >= start and shown < count:
                    print(f'{position:5d} @0x{base + position * 2:07x}  ' + ' '.join(f'{u:04x}' for u in raw).ljust(20) + text)
                    shown += 1
                position += size
            return
    raise SystemExit('method not found')

if __name__ == '__main__':
    main()
