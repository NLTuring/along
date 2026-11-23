"""Assemble a new APK from the original one plus the new interface files.

Usage: python -I mobile/tools/build_apk.py <original.apk> <new assets dir> <out unsigned.apk> [--baidu-ak-file <local-file>] [--icon-dir <dir>]

The web layer is replaced. With --baidu-ak-file, the single verified application
Baidu AK manifest attribute is updated structurally. Native code and libraries
are copied byte-for-byte. Existing output files are never overwritten. Uncompressed entries are aligned here (16 KB for native libraries,
4 bytes for the rest). The old signature files are left out; the result must be
signed (apksigner) afterwards.
"""
import struct
import sys
import zipfile
import argparse
import runpy
from pathlib import Path

# The old web layer. Everything else under assets/ belongs to native code
# (Baidu map SDK textures and configs, the dex optimisation profile).
OLD_WEB_DIRS = ('assets/brands/', 'assets/craft-gallery/', 'assets/craft-viewer/',
                'assets/fonts/', 'assets/people/', 'assets/places/')
OLD_WEB_SUFFIXES = ('.js', '.css', '.html')
OLD_WEB_FILES = {
    'assets/brand-logo.png', 'assets/brand-mark.png', 'assets/place-starters.json',
    'assets/wood-grain.svg', 'assets/wood-v27.svg',
}
# landscape.jpg: no reference to it was found in the old web layer or in the
# native code. It is kept, since removing an unexplained file is the riskier choice.
SIGNATURE_FILES = {'META-INF/MANIFEST.MF', 'META-INF/CERT.SF', 'META-INF/CERT.RSA'}
# Verified launcher bitmaps: QM.png is ic_launcher_legacy (mipmap/anydpi bitmap),
# f1.png is ic_launcher_mark (adaptive foreground and monochrome). Nothing else changes.
ICON_OVERRIDES = {'res/QM.png': 'launcher-legacy.png', 'res/f1.png': 'launcher-mark.png'}
RESOURCE_TABLE = 'resources.arsc'
# With map_labels, the verified operand changes in android_dex.py turn Baidu's own map labels on
# and let tel: links reach the dialer.
DEX_FILE = 'classes.dex'
# Already-compressed formats are stored, as the Android build tools do.
STORE_SUFFIXES = ('.png', '.jpg', '.jpeg', '.webp', '.woff2')
FIXED_TIME = (1981, 1, 1, 1, 1, 2)  # same fixed timestamp the original entries carry


def alignment_extra(zf, name, compress_type):
    """Extra-field padding so an uncompressed entry's data starts on a boundary.

    Android maps uncompressed files straight from the APK: native libraries must
    start on a memory-page boundary (16 KB covers both 4 KB and 16 KB devices,
    and is what the original APK used) and everything else on 4 bytes. Uses the
    standard alignment field (0xD935), as the Android build tools do.
    """
    if compress_type != zipfile.ZIP_STORED:
        return b''
    align = 16384 if name.endswith('.so') else 4
    base = zf.fp.tell() + 30 + len(name.encode('utf-8'))
    pad = (-(base + 6)) % align
    return struct.pack('<HHH', 0xD935, 2 + pad, align) + b'\x00' * pad


def write_entry(zf, info, data):
    info.extra = alignment_extra(zf, info.filename, info.compress_type)
    zf.writestr(info, data)
    info.extra = b''  # padding belongs in the local header only, not the directory


def is_old_web(name):
    if not name.startswith('assets/'):
        return False
    if name.startswith(OLD_WEB_DIRS) or name in OLD_WEB_FILES:
        return True
    return name.count('/') == 1 and name.endswith(OLD_WEB_SUFFIXES)


def png_size(data):
    if data[:8] != b'\x89PNG\r\n\x1a\n' or data[12:16] != b'IHDR':
        raise SystemExit('Launcher override is not a PNG')
    return struct.unpack('>II', data[16:24])


def load_icons(src, icon_dir):
    icons = {}
    for name, file in ICON_OVERRIDES.items():
        data = (Path(icon_dir) / file).read_bytes()
        if png_size(data) != png_size(src.read(name)):
            raise SystemExit(f'Launcher override must keep the original size: {name}')
        icons[name] = data
    return icons


def main(original, assets_dir, out_path, baidu_ak_file=None, icon_dir=None, map_labels=False):
    if Path(out_path).exists():
        raise SystemExit('Output already exists; choose a new APK filename')
    patch = None
    key = None
    dex_patch = runpy.run_path(str(Path(__file__).resolve().with_name('android_dex.py')))['patch_shell'] if map_labels else None
    if baidu_ak_file:
        key = Path(baidu_ak_file).read_text(encoding='utf-8-sig').strip()
        patch = runpy.run_path(str(Path(__file__).resolve().with_name('android_manifest.py')))['patch_baidu_key']
    patch_background = icons = None
    if icon_dir:
        patch_background = runpy.run_path(str(Path(__file__).resolve().with_name('android_icons.py')))['patch_launcher_background']
    assets_dir = Path(assets_dir)
    new_files = sorted(p for p in assets_dir.rglob('*') if p.is_file())
    new_names = {'assets/' + p.relative_to(assets_dir).as_posix() for p in new_files}

    kept = dropped_web = dropped_sig = 0
    with zipfile.ZipFile(original) as src, zipfile.ZipFile(out_path, 'w') as dst:
        if icon_dir:
            icons = load_icons(src, icon_dir)
        for info in src.infolist():
            name = info.filename
            if name in SIGNATURE_FILES:
                dropped_sig += 1
                continue
            if is_old_web(name):
                dropped_web += 1
                continue
            if name in new_names:
                raise SystemExit(f'new file would overwrite a native asset: {name}')
            out = zipfile.ZipInfo(name, date_time=info.date_time)
            out.compress_type = info.compress_type
            out.external_attr = info.external_attr
            out.create_system = info.create_system
            payload = src.read(name)
            if name == 'AndroidManifest.xml' and patch:
                payload = patch(payload, key)
            if icons and name in icons:
                payload = icons[name]
            if icons and name == RESOURCE_TABLE:
                payload = patch_background(payload)
            if dex_patch and name == DEX_FILE:
                payload = dex_patch(payload)
            write_entry(dst, out, payload)
            kept += 1

        for path in new_files:
            name = 'assets/' + path.relative_to(assets_dir).as_posix()
            out = zipfile.ZipInfo(name, date_time=FIXED_TIME)
            out.compress_type = (zipfile.ZIP_STORED if name.lower().endswith(STORE_SUFFIXES)
                                 else zipfile.ZIP_DEFLATED)
            out.external_attr = 0
            write_entry(dst, out, path.read_bytes())

    if patch:
        print('updated the application Baidu Android AK; value withheld')
    if icons:
        print(f'replaced launcher bitmaps {sorted(icons)} and the launcher background colour')
    if dex_patch:
        print('turned on Baidu map labels (one operand in classes.dex)')
    print(f'kept {kept} original entries')
    print(f'removed {dropped_web} old interface files and {dropped_sig} old signature files')
    print(f'added {len(new_files)} new interface files')
    print(f'wrote {out_path} ({Path(out_path).stat().st_size} bytes)')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('original')
    parser.add_argument('assets_dir')
    parser.add_argument('output')
    parser.add_argument('--baidu-ak-file')
    parser.add_argument('--icon-dir', help='Directory with launcher-legacy.png and launcher-mark.png')
    args = parser.parse_args()
    main(args.original, args.assets_dir, args.output, args.baidu_ak_file, args.icon_dir)
