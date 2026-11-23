"""Bounded Android binary-XML editing for one Baidu manifest metadata value.

Only the string pool and the exact android:value attribute are changed. Existing
string indices, resource IDs, namespaces and all other chunks remain unchanged.
"""
import struct

XML = 0x0003
STRING_POOL = 0x0001
START_ELEMENT = 0x0102
END_ELEMENT = 0x0103
UTF8 = 0x100
TYPE_STRING = 0x03
NONE = 0xFFFFFFFF
ANDROID_NS = 'http://schemas.android.com/apk/res/android'
BAIDU_KEY = 'com.baidu.lbsapi.API_KEY'


def chunks(data):
    if len(data) < 8:
        raise ValueError('Manifest header is truncated')
    kind, header, size = struct.unpack_from('<HHI', data)
    if kind != XML or header != 8 or size != len(data):
        raise ValueError('Invalid Android binary XML header')
    offset = header
    result = []
    while offset < size:
        if offset + 8 > size:
            raise ValueError('Manifest chunk is truncated')
        kind, head, length = struct.unpack_from('<HHI', data, offset)
        if head < 8 or length < head or offset + length > size or length % 4:
            raise ValueError('Invalid manifest chunk bounds')
        result.append((kind, bytes(data[offset:offset + length])))
        offset += length
    return result


def _length(data, offset, utf8):
    width = 1 if utf8 else 2
    if offset + width > len(data):
        raise ValueError('String length is truncated')
    first = data[offset] if utf8 else struct.unpack_from('<H', data, offset)[0]
    high = 0x80 if utf8 else 0x8000
    if first & high:
        if offset + width * 2 > len(data):
            raise ValueError('Extended string length is truncated')
        second = data[offset + 1] if utf8 else struct.unpack_from('<H', data, offset + 2)[0]
        return ((first & (high - 1)) << (8 if utf8 else 16)) | second, offset + width * 2
    return first, offset + width


class Pool:
    def __init__(self, chunk):
        if len(chunk) < 28:
            raise ValueError('String pool is truncated')
        kind, self.header, size, self.count, self.styles, self.flags, self.start, self.style_start = struct.unpack_from('<HHIIIIII', chunk)
        if kind != STRING_POOL or size != len(chunk) or self.header < 28 or self.count > 100000:
            raise ValueError('Invalid string pool')
        offsets_end = self.header + (self.count + self.styles) * 4
        if offsets_end > self.start or self.start > size:
            raise ValueError('Invalid string offsets')
        self.end = self.style_start or size
        if self.end < self.start or self.end > size or (self.styles and not self.style_start):
            raise ValueError('Invalid style bounds')
        self.chunk = chunk
        self.utf8 = bool(self.flags & UTF8)
        self.values = [self._decode(i) for i in range(self.count)]

    def _decode(self, index):
        relative = struct.unpack_from('<I', self.chunk, self.header + index * 4)[0]
        at = self.start + relative
        if at >= self.end:
            raise ValueError('String offset outside pool')
        part = self.chunk[:self.end]
        units, at = _length(part, at, self.utf8)
        if self.utf8:
            length, at = _length(part, at, True)
            if at + length + 1 > self.end or part[at + length] != 0:
                raise ValueError('Invalid UTF8 string')
            value = part[at:at + length].decode('utf-8')
        else:
            length = units * 2
            if at + length + 2 > self.end or part[at + length:at + length + 2] != b'\0\0':
                raise ValueError('Invalid UTF16 string')
            value = part[at:at + length].decode('utf-16-le')
        if len(value.encode('utf-16-le')) // 2 != units:
            raise ValueError('String character length mismatch')
        return value

    def text(self, index):
        if index == NONE:
            return None
        if not 0 <= index < self.count:
            raise ValueError('String reference outside pool')
        return self.values[index]

    def append(self, value):
        if value in self.values:
            return self.chunk, self.values.index(value)
        units = len(value.encode('utf-16-le')) // 2
        if units >= 0x80:
            raise ValueError('AK is too long')
        encoded = (bytes([units, len(value.encode('utf-8'))]) + value.encode('utf-8') + b'\0') if self.utf8 else struct.pack('<H', units) + value.encode('utf-16-le') + b'\0\0'
        old_offsets_end = self.header + self.count * 4
        string_data = self.chunk[self.start:self.end]
        offsets = self.chunk[self.header:old_offsets_end] + struct.pack('<I', len(string_data))
        style_offsets_and_pad = self.chunk[old_offsets_end:self.start]
        string_data += encoded
        string_data += b'\0' * (-len(string_data) % 4)
        style_data = self.chunk[self.end:]
        result = bytearray(self.chunk[:self.header] + offsets + style_offsets_and_pad + string_data + style_data)
        struct.pack_into('<I', result, 4, len(result))
        struct.pack_into('<I', result, 8, self.count + 1)
        struct.pack_into('<I', result, 16, self.flags & ~1)  # appended pool is no longer sorted
        struct.pack_into('<I', result, 20, self.start + 4)
        struct.pack_into('<I', result, 24, self.start + 4 + len(string_data) if self.style_start else 0)
        return bytes(result), self.count


def _element(chunk, pool):
    if len(chunk) < 36 or struct.unpack_from('<H', chunk, 2)[0] != 16:
        raise ValueError('Unsupported element header')
    name = pool.text(struct.unpack_from('<I', chunk, 20)[0])
    start, size, count = struct.unpack_from('<HHH', chunk, 24)
    at = 16 + start
    if size != 20 or at < 36 or at + count * size > len(chunk):
        raise ValueError('Invalid attribute bounds')
    attributes = []
    for index in range(count):
        offset = at + index * size
        ns, key, raw, value_size, reserved, kind, value = struct.unpack_from('<IIIHBBI', chunk, offset)
        if value_size != 8 or reserved != 0:
            raise ValueError('Unsupported attribute value')
        text = pool.text(value) if kind == TYPE_STRING else None
        attributes.append({'ns': pool.text(ns), 'name': pool.text(key), 'raw': raw, 'type': kind, 'text': text, 'offset': offset})
    return name, attributes


def inspect_manifest(data):
    parts = chunks(data)
    pools = [(index, Pool(chunk)) for index, (kind, chunk) in enumerate(parts) if kind == STRING_POOL]
    if len(pools) != 1:
        raise ValueError('Expected exactly one manifest string pool')
    pool_index, pool = pools[0]
    package = None
    keys = []
    stack = []
    for index, (kind, chunk) in enumerate(parts):
        if kind == START_ELEMENT:
            name, attrs = _element(chunk, pool)
            if name == 'manifest' and not stack:
                package = next((a['text'] for a in attrs if a['name'] == 'package' and a['ns'] is None), None)
            if name == 'meta-data' and stack and stack[-1] == 'application':
                label = next((a['text'] for a in attrs if a['name'] == 'name' and a['ns'] == ANDROID_NS), None)
                if label == BAIDU_KEY:
                    values = [a for a in attrs if a['name'] == 'value' and a['ns'] == ANDROID_NS]
                    if len(values) != 1 or values[0]['type'] != TYPE_STRING:
                        raise ValueError('Baidu AK must be one inline string value')
                    keys.append((index, values[0]))
            stack.append(name)
        elif kind == END_ELEMENT:
            if len(chunk) < 24 or not stack or pool.text(struct.unpack_from('<I', chunk, 20)[0]) != stack.pop():
                raise ValueError('Unbalanced manifest elements')
    if stack or not package or len(keys) != 1:
        raise ValueError('Manifest must have a package and one application-level Baidu AK')
    return parts, pool_index, pool, package, keys[0]


def baidu_key(data):
    return inspect_manifest(data)[4][1]['text']


def patch_baidu_key(data, key, expected_package='com.linliquan.app'):
    if not isinstance(key, str) or not 16 <= len(key) <= 64 or not key.isascii() or not key.isalnum():
        raise ValueError('Android AK must be 16–64 ASCII letters or digits')
    parts, pool_index, pool, package, (target, attribute) = inspect_manifest(data)
    if package != expected_package:
        raise ValueError('Unexpected APK package name')
    new_pool, string_index = pool.append(key)
    updated = bytearray(parts[target][1])
    struct.pack_into('<I', updated, attribute['offset'] + 8, string_index)
    struct.pack_into('<I', updated, attribute['offset'] + 16, string_index)
    parts[pool_index] = (STRING_POOL, new_pool)
    parts[target] = (START_ELEMENT, bytes(updated))
    body = b''.join(chunk for _, chunk in parts)
    result = struct.pack('<HHI', XML, 8, 8 + len(body)) + body
    if baidu_key(result) != key:
        raise ValueError('Manifest AK round-trip failed')
    return result
