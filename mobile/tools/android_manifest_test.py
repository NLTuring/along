"""Read-only fixtures for the bounded manifest patcher. No actual AK is printed."""
import runpy
import struct
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
M = runpy.run_path(str(Path(__file__).with_name('android_manifest.py')))
P = runpy.run_path(str(Path(__file__).with_name('package-android.py')))


def base_apk():
    return P['base_apk']()
NEW_KEY = 'B' * 32
OLD_KEY = 'A' * 32


def fixture(utf8=False, name='com.baidu.lbsapi.API_KEY', value_type=3, package='com.linliquan.app'):
    strings = ['manifest', 'application', 'meta-data', 'package', package,
               'http://schemas.android.com/apk/res/android', 'name', name, 'value', OLD_KEY]
    data = bytearray()
    offsets = []
    for value in strings:
        offsets.append(len(data))
        units = len(value.encode('utf-16-le')) // 2
        data += (bytes([units, len(value.encode())]) + value.encode() + b'\0') if utf8 else struct.pack('<H', units) + value.encode('utf-16-le') + b'\0\0'
    data += b'\0' * (-len(data) % 4)
    start = 28 + 4 * len(strings)
    pool = struct.pack('<HHIIIIII', 1, 28, start + len(data), len(strings), 0, 0x100 if utf8 else 0, start, 0)
    pool += b''.join(struct.pack('<I', value) for value in offsets) + data

    def attr(ns, key, value, kind=3):
        return struct.pack('<IIIHBBI', ns, key, value, 8, 0, kind, value)

    def start_element(index, attrs):
        return struct.pack('<HHIII', 0x102, 16, 36 + len(attrs) * 20, 1, 0xffffffff) + struct.pack('<IIHHHHHH', 0xffffffff, index, 20, 20, len(attrs), 0, 0, 0) + b''.join(attrs)

    def end_element(index):
        return struct.pack('<HHIIIII', 0x103, 16, 24, 1, 0xffffffff, 0xffffffff, index)

    body = pool + start_element(0, [attr(0xffffffff, 3, 4)]) + start_element(1, [])
    body += start_element(2, [attr(5, 6, 7), attr(5, 8, 9, value_type)])
    body += end_element(2) + end_element(1) + end_element(0)
    return struct.pack('<HHI', 3, 8, len(body) + 8) + body


class ManifestTests(unittest.TestCase):
    def test_utf16_roundtrip(self):
        source = fixture()
        self.assertEqual(M['baidu_key'](source), OLD_KEY)
        self.assertEqual(M['baidu_key'](M['patch_baidu_key'](source, NEW_KEY)), NEW_KEY)
        self.assertEqual(M['baidu_key'](source), OLD_KEY)

    def test_utf8_roundtrip(self):
        self.assertEqual(M['baidu_key'](M['patch_baidu_key'](fixture(True), NEW_KEY)), NEW_KEY)

    def test_only_pool_and_exact_attribute_change(self):
        source = fixture()
        before, pi, pool, package, (target, attribute) = M['inspect_manifest'](source)
        patched = M['patch_baidu_key'](source, NEW_KEY)
        after = M['inspect_manifest'](patched)
        self.assertEqual(after[3], package)
        self.assertEqual(after[2].values[:-1], pool.values)
        for i, (kind, chunk) in enumerate(before):
            if i not in [pi, target]:
                self.assertEqual(after[0][i], (kind, chunk))
        changes = [i for i, (a, b) in enumerate(zip(before[target][1], after[0][target][1])) if a != b]
        allowed = set(range(attribute['offset'] + 8, attribute['offset'] + 12)) | set(range(attribute['offset'] + 16, attribute['offset'] + 20))
        self.assertTrue(set(changes) <= allowed)

    def test_idempotent_patch(self):
        patched = M['patch_baidu_key'](fixture(), NEW_KEY)
        self.assertEqual(M['patch_baidu_key'](patched, NEW_KEY), patched)

    def test_invalid_key_rejected(self):
        for value in ['', 'short', 'C' * 65, 'x' * 30 + '\n!', '瀵嗛挜' * 20, None]:
            with self.assertRaises(ValueError):
                M['patch_baidu_key'](fixture(), value)

    def test_wrong_package_rejected(self):
        with self.assertRaises(ValueError):
            M['patch_baidu_key'](fixture(package='com.other.app'), NEW_KEY)

    def test_missing_metadata_rejected(self):
        with self.assertRaises(ValueError):
            M['patch_baidu_key'](fixture(name='other.metadata'), NEW_KEY)

    def test_resource_reference_not_guessed(self):
        with self.assertRaises(ValueError):
            M['patch_baidu_key'](fixture(value_type=1), NEW_KEY)

    def test_truncated_and_bad_bounds_rejected(self):
        source = fixture()
        for data in [b'', source[:-1], b'\0' * 8, source[:20]]:
            with self.assertRaises(ValueError):
                M['patch_baidu_key'](data, NEW_KEY)

    def test_original_apk_manifest_roundtrip(self):
        with zipfile.ZipFile(base_apk()) as archive:
            source = archive.read('AndroidManifest.xml')
        before = M['inspect_manifest'](source)
        result = M['patch_baidu_key'](source, NEW_KEY)
        after = M['inspect_manifest'](result)
        self.assertEqual(after[3], 'com.linliquan.app')
        self.assertEqual(after[4][1]['text'], NEW_KEY)
        for i, chunk in enumerate(before[0]):
            if i not in [before[1], before[4][0]]:
                self.assertEqual(after[0][i], chunk)


class LauncherIconTests(unittest.TestCase):
    def test_original_background_patch_changes_four_bytes(self):
        icons = runpy.run_path(str(Path(__file__).with_name('android_icons.py')))
        with zipfile.ZipFile(base_apk()) as archive:
            source = archive.read('resources.arsc')
        result = icons['patch_launcher_background'](source)
        diff = [i for i, (a, b) in enumerate(zip(source, result)) if a != b]
        self.assertEqual(len(source), len(result))
        self.assertTrue(0 < len(diff) and diff[-1] - diff[0] <= 3)
        self.assertEqual(source.count(struct.pack('<I', 0xFFF7F2E8)) + 1, result.count(struct.pack('<I', 0xFFF7F2E8)))
        with self.assertRaises(ValueError):
            icons['patch_launcher_background'](result)

    def test_truncated_table_rejected(self):
        icons = runpy.run_path(str(Path(__file__).with_name('android_icons.py')))
        for data in [b'', b'\0' * 12]:
            with self.assertRaises(ValueError):
                icons['patch_launcher_background'](data)

    def test_original_icon_entries_exist(self):
        with zipfile.ZipFile(base_apk()) as archive:
            for name, size in [('res/QM.png', (512, 512)), ('res/f1.png', (432, 432))]:
                self.assertEqual(struct.unpack('>II', archive.read(name)[16:24]), size)


if __name__ == '__main__':
    unittest.main(verbosity=2)

