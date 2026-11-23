"""The shell switches change only the verified bytes of the original shell and nothing else.
Run: python -I -m unittest mobile/tools/android_dex_test.py   (reads the base APK; writes nothing)
"""
import hashlib
import runpy
import struct
import unittest
import zipfile
import zlib
from pathlib import Path

D = runpy.run_path(str(Path(__file__).with_name('android_dex.py')))
P = runpy.run_path(str(Path(__file__).with_name('package-android.py')))


def original_dex():
    with zipfile.ZipFile(P['base_apk']()) as apk:
        return apk.read('classes.dex')


class MapLabelSwitch(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.before = original_dex()
        cls.after = D['patch_show_map_poi'](cls.before)

    def test_only_the_operand_and_header_change(self):
        ranges = D['changed_ranges'](self.before, self.after)
        self.assertEqual(len(self.before), len(self.after))
        body = [r for r in ranges if r[0] >= 32]
        self.assertEqual(body, [(D['OFFSET'] + 4, D['OFFSET'] + 5)], 'one byte of the invoke operands')
        self.assertTrue(all(a >= 8 for a, _ in ranges if a < 32), 'magic and version untouched')
        self.assertEqual(self.before[D['OFFSET'] + 4], 0x40)
        self.assertEqual(self.after[D['OFFSET'] + 4], 0x10)

    def test_header_checksum_and_signature_are_correct(self):
        self.assertTrue(D['header_valid'](self.before))
        self.assertTrue(D['header_valid'](self.after))
        self.assertEqual(self.after[12:32], hashlib.sha1(self.after[32:]).digest())
        self.assertEqual(struct.unpack('<I', self.after[8:12])[0], zlib.adler32(self.after[12:]) & 0xFFFFFFFF)

    def test_the_register_passed_now_holds_true(self):
        # const/4 v1, 1 at the start of create(), and v1 is not written again before showMapPoi.
        start = 0x3999F8
        self.assertEqual(self.before[start + 8:start + 10], bytes.fromhex('1211'))
        units = [struct.unpack_from('<H', self.before, start + i * 2)[0] for i in range(5, (D['OFFSET'] - start) // 2)]
        writes_v1 = [u for u in units if (u & 0xFF) in (0x12, 0x13, 0x14, 0x0A, 0x0C, 0x22) and ((u >> 8) & (0xF if (u & 0xFF) == 0x12 else 0xFF)) == 1]
        self.assertEqual(writes_v1, [], 'v1 keeps the value true until the call')

    def test_refuses_anything_but_the_verified_original(self):
        with self.assertRaises(ValueError):
            D['patch_show_map_poi'](self.after)  # already patched
        broken = bytearray(self.before); broken[D['OFFSET'] - 1] ^= 1
        with self.assertRaises(ValueError):
            D['patch_show_map_poi'](bytes(broken))
        with self.assertRaises(ValueError):
            D['patch_show_map_poi'](self.before[:-4])


class EmergencyDial(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.before = original_dex()
        cls.after = D['patch_tel_links'](cls.before)
        cls.shell = D['patch_shell'](cls.before)

    def test_only_the_host_branch_and_the_second_scheme_change(self):
        ranges = [r for r in D['changed_ranges'](self.before, self.after) if r[0] >= 32]
        branch, scheme = D['HOST_BRANCH'], D['SCHEME']
        self.assertEqual(ranges, [(branch[0] + 2, branch[0] + 3), (scheme[0] + 2, scheme[0] + 4)])
        self.assertEqual(self.after[branch[0]:branch[0] + 6], branch[2], 'a host-less URI goes to the scheme test')
        self.assertEqual(self.after[scheme[0]:scheme[0] + 4], scheme[2], 'the second scheme is now tel')

    def test_the_branch_now_lands_on_the_scheme_test(self):
        # if-eqz at 0x12 within openExternal: the offset is in code units from the branch itself.
        self.assertEqual(struct.unpack_from('<H', self.after, D['HOST_BRANCH'][0])[0], 0x0438, 'still if-eqz v4')
        offset = struct.unpack_from('<h', self.after, D['HOST_BRANCH'][0] + 2)[0]
        self.assertEqual(offset, 8)
        target = D['HOST_BRANCH'][0] + offset * 2
        self.assertEqual(self.after[target:target + 4], bytes.fromhex('1a04b6a3'), 'the const-string "https" scheme test')

    def test_header_checksum_and_signature_are_correct(self):
        self.assertTrue(D['header_valid'](self.before))
        self.assertTrue(D['header_valid'](self.after))
        self.assertTrue(D['header_valid'](self.shell))

    def test_both_changes_together_touch_four_places(self):
        ranges = D['changed_ranges'](self.before, self.shell)
        body = [r for r in ranges if r[0] >= 32]
        self.assertEqual(len(body), 3, body)
        self.assertEqual(body[0], (D['OFFSET'] + 4, D['OFFSET'] + 5), 'map labels')
        self.assertEqual(body[1][0], D['HOST_BRANCH'][0] + 2)
        self.assertEqual(body[2][0], D['SCHEME'][0] + 2)

    def test_refuses_anything_but_the_verified_original(self):
        with self.assertRaises(ValueError):
            D['patch_tel_links'](self.after)  # already patched
        broken = bytearray(self.before); broken[D['HOST_BRANCH'][0]] ^= 1
        with self.assertRaises(ValueError):
            D['patch_tel_links'](bytes(broken))
        broken = bytearray(self.before); broken[D['SCHEME'][0] + 3] ^= 1
        with self.assertRaises(ValueError):
            D['patch_tel_links'](bytes(broken))
        with self.assertRaises(ValueError):
            D['patch_shell'](self.shell)


if __name__ == '__main__':
    unittest.main()
