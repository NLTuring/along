"""Build an independent Android test APK with a local Baidu Android AK.

Usage: python -I mobile/tools/package-android.py [--ak-file FILE] [--output FILE] [--local-experience]
Never prints AK/passwords and never overwrites an existing APK.
"""
import argparse
import hashlib
import json
import re
import runpy
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[2]
TOOLS = ROOT / '_tools' / 'build-tools' / 'android-11'
EXPECTED_SHA1 = '94a0c2fba41266a3df3262743b42cbec817e46f1'


# The original app APK is the packaging base, not a version to hand out. It is kept out of the
# project root so only the latest installable build sits there; both locations are accepted.
def base_apk():
    for path in [ROOT / '.android-local' / 'base' / '一起游.apk.1', ROOT / '一起游.apk.1']:
        if path.is_file():
            return path
    raise SystemExit('Original base APK missing: place it at .android-local/base/一起游.apk.1')


def execute(command, label):
    result = subprocess.run([str(x) for x in command], cwd=ROOT, capture_output=True, encoding='utf-8', errors='replace')
    if result.returncode:
        raise RuntimeError(f'{label} failed (exit {result.returncode}); no secret-bearing output was printed')
    return result.stdout


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ak-file', type=Path, default=ROOT / '.android-local' / 'baidu-android-ak.txt')
    parser.add_argument('--output', type=Path)
    parser.add_argument('--local-experience', action='store_true', help='Enable an isolated local profile in this test APK only')
    parser.add_argument('--api-base-url', default='', help='Explicit trusted HTTPS base of the Along backend, optionally with a mount path')
    args = parser.parse_args()
    api_origin = args.api_base_url.rstrip('/')
    if api_origin:
        parsed = urlsplit(api_origin)
        if parsed.scheme != 'https' or parsed.username or parsed.password or parsed.port not in [None, 443] or parsed.query or parsed.fragment or not parsed.hostname or not re.fullmatch(r'[a-z0-9.-]+', parsed.hostname) or (parsed.path and not re.fullmatch(r'/(?:[A-Za-z0-9_-]+/)*[A-Za-z0-9_-]+', parsed.path)):
            raise SystemExit('API base must be HTTPS with only a simple optional mount path')
    name = 'along-android-local-experience-test.apk' if args.local_experience else 'along-android-baidu-test.apk'
    output = (args.output or ROOT / '_build' / name).resolve()
    if output.exists():
        raise SystemExit('Output already exists. Pass a new --output filename.')
    key = args.ak_file.read_text(encoding='utf-8-sig').strip()
    private_values = []
    for config_name in ['goldgom.env', 'hualong.env', 'goldgom-image.env', 'smtp-deployment.env', 'along-production.env']:
        local_config = ROOT / '.android-local' / config_name
        if not local_config.is_file():
            continue
        for line in local_config.read_text(encoding='utf-8-sig').splitlines():
            if '=' not in line or line.lstrip().startswith('#'):
                continue
            name, value = line.split('=', 1)
            value = value.strip().strip("\"'")
            if any(part in name.upper() for part in ['PASSWORD', 'SECRET', 'API_KEY']) and len(value) >= 8:
                private_values.append(value.encode())
    original = base_apk()
    assets = ROOT / 'mobile' / 'assets'
    manifest = runpy.run_path(str(ROOT / 'mobile' / 'tools' / 'android_manifest.py'))
    builder = runpy.run_path(str(ROOT / 'mobile' / 'tools' / 'build_apk.py'))
    with zipfile.ZipFile(original) as source:
        manifest['patch_baidu_key'](source.read('AndroidManifest.xml'), key)
    execute(['node', ROOT / 'mobile' / 'tools' / 'check.mjs'], 'Bilingual/import check')
    output.parent.mkdir(parents=True, exist_ok=True)
    # Stage next to the output (ASCII path, same drive) instead of the system temp folder on C:.
    staging = output.parent.parent / '_tmp-apk' if not str(output.parent).isascii() else output.parent / '_tmp-apk'
    staging = Path(output.anchor) / 'along-apk-staging' if not str(staging).isascii() else staging
    staging.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix='along-baidu-apk-', dir=staging))
    original_assets = assets
    flag_path = assets / 'js' / 'build-flags.js'
    disabled_flag = 'export const LOCAL_EXPERIENCE_ENABLED = false;'
    if disabled_flag not in flag_path.read_text(encoding='utf-8'):
        raise RuntimeError('Source experience flag must stay disabled')
    if args.local_experience or api_origin:
        assets = work / 'assets'
        shutil.copytree(original_assets, assets)
        staged_flag = assets / 'js' / 'build-flags.js'
        text = staged_flag.read_text(encoding='utf-8')
        if args.local_experience:
            text = text.replace(disabled_flag, 'export const LOCAL_EXPERIENCE_ENABLED = true;')
        if api_origin:
            empty_api = "export const API_BASE_URL = '';"
            if text.count(empty_api) != 1:
                raise RuntimeError('Source API base must be empty and occur exactly once')
            text = text.replace(empty_api, f'export const API_BASE_URL = {json.dumps(api_origin)};')
            index_path = assets / 'index.html'
            html = index_path.read_text(encoding='utf-8')
            for directive in ["connect-src 'self'", "img-src 'self'", "media-src 'self'"]:
                if html.count(directive) != 1:
                    raise RuntimeError('Unexpected asset security policy shape')
                csp_source = f'{parsed.scheme}://{parsed.netloc}{parsed.path + "/" if parsed.path else ""}'
                html = html.replace(directive, f'{directive} {csp_source}')
            index_path.write_text(html, encoding='utf-8')
        staged_flag.write_text(text, encoding='utf-8')
    unsigned = work / 'unsigned.apk'
    signed = work / 'signed.apk'
    # ASCII temporary paths avoid old aapt.exe Unicode-path failures.
    icon_dir = ROOT / '_build' / 'brand-artwork'
    builder['main'](original, assets, unsigned, args.ak_file, icon_dir, map_labels=True)
    execute([TOOLS / 'zipalign.exe', '-c', '-p', '4', unsigned], 'Unsigned alignment')
    execute(['java', '-jar', TOOLS / 'lib' / 'apksigner.jar', 'sign', '--ks', ROOT / '_signing' / 'instrip-test.p12',
             '--ks-type', 'PKCS12', '--ks-key-alias', 'instrip', '--ks-pass', f"file:{ROOT / '_signing' / 'keystore-password.txt'}",
             '--v1-signing-enabled', 'true', '--v2-signing-enabled', 'true', '--v3-signing-enabled', 'true', '--out', signed, unsigned], 'APK signing')
    certificate = execute(['java', '-jar', TOOLS / 'lib' / 'apksigner.jar', 'verify', '--print-certs', signed], 'Signature verification')
    match = re.search(r'certificate SHA-1 digest:\s*([0-9a-f]+)', certificate, re.I)
    if not match or match.group(1).lower() != EXPECTED_SHA1:
        raise RuntimeError('Signed certificate does not match the confirmed Baidu authorization')
    execute([TOOLS / 'zipalign.exe', '-c', '-p', '4', signed], 'Signed alignment')
    execute([TOOLS / 'aapt.exe', 'dump', 'xmltree', signed, 'AndroidManifest.xml'], 'Manifest parser verification')
    badging = execute([TOOLS / 'aapt.exe', 'dump', 'badging', signed], 'APK metadata')
    if "package: name='com.linliquan.app'" not in badging:
        raise RuntimeError('Unexpected signed package name')
    unchanged = 0
    with zipfile.ZipFile(original) as source, zipfile.ZipFile(signed) as target:
        if manifest['baidu_key'](target.read('AndroidManifest.xml')) != key:
            raise RuntimeError('Signed AK does not match local configuration')
        if target.testzip() is not None:
            raise RuntimeError('APK ZIP CRC validation failed')
        icon_changes = []
        for name, file in builder['ICON_OVERRIDES'].items():
            if target.read(name) != (icon_dir / file).read_bytes() or target.read(name) == source.read(name):
                raise RuntimeError('Launcher bitmap override was not applied exactly')
            icon_changes.append(name)
        # classes.dex may differ from the original only by the verified shell changes and its header.
        dex_tools = runpy.run_path(str(ROOT / 'mobile' / 'tools' / 'android_dex.py'))
        dex_before, dex_after = source.read(builder['DEX_FILE']), target.read(builder['DEX_FILE'])
        if dex_after != dex_tools['patch_shell'](dex_before) or not dex_tools['header_valid'](dex_after):
            raise RuntimeError('classes.dex changed beyond the verified shell switches')
        dex_changes = dex_tools['changed_ranges'](dex_before, dex_after)
        before, after = source.read(builder['RESOURCE_TABLE']), target.read(builder['RESOURCE_TABLE'])
        diff = [i for i, (a, b) in enumerate(zip(before, after)) if a != b]
        expected_table = runpy.run_path(str(ROOT / 'mobile' / 'tools' / 'android_icons.py'))['patch_launcher_background'](before)
        if after != expected_table or len(before) != len(after) or not diff or diff[-1] - diff[0] > 3:
            raise RuntimeError('resources.arsc changed beyond the launcher background colour')
        for item in source.infolist():
            name = item.filename
            if name == 'AndroidManifest.xml' or name in builder['SIGNATURE_FILES'] or builder['is_old_web'](name):
                continue
            if name in builder['ICON_OVERRIDES'] or name in (builder['RESOURCE_TABLE'], builder['DEX_FILE']):
                continue
            if source.read(name) != target.read(name):
                raise RuntimeError('An unrelated original APK entry was changed')
            unchanged += 1
        files = [p for p in assets.rglob('*') if p.is_file()]
        for file in files:
            name = 'assets/' + file.relative_to(assets).as_posix()
            if file.read_bytes() != target.read(name):
                raise RuntimeError('Bundled mobile assets do not match the current source')
            if key.encode() in file.read_bytes():
                raise RuntimeError('Android AK must not be present in web assets')
            if any(secret in file.read_bytes() for secret in private_values):
                raise RuntimeError('A server-only secret was found in APK assets')
    # Exclusive creation protects an output created by another process while building.
    with output.open('xb') as destination, signed.open('rb') as source:
        shutil.copyfileobj(source, destination)
    report = {
        'output': str(output), 'package': 'com.linliquan.app', 'certificate_sha1': ':'.join(EXPECTED_SHA1[i:i + 2] for i in range(0, 40, 2)).upper(),
        'baidu_android_ak_matches': True, 'ak_in_web_assets': False, 'signature_verified': True,
        'zip_alignment_4': True, 'manifest_aapt_parse': True, 'unchanged_original_entries': unchanged,
        'mobile_files_match': len(files), 'size_bytes': output.stat().st_size,
        'sha256': hashlib.sha256(output.read_bytes()).hexdigest(),
        'device_validation': 'NOT_RUN', 'temporary_build_directory': str(work),
        'local_experience_enabled': args.local_experience,
        'source_experience_disabled': disabled_flag in flag_path.read_text(encoding='utf-8'),
        'api_base_url': api_origin,
        'server_secrets_absent_from_assets': True,
        'source_api_base_empty': "export const API_BASE_URL = '';" in flag_path.read_text(encoding='utf-8'),
        'launcher_bitmaps_replaced': icon_changes,
        'launcher_background': {'resource': 'color/launcher_background 0x7f040034', 'old': '#EEF3EF', 'new': '#F7F2E8', 'bytes_changed_in_resources_arsc': len(diff)},
        'launcher_device_validation': 'NOT_RUN',
        'map_labels': {'change': 'EmbeddedMapController.create: BaiduMap.showMapPoi(false) -> showMapPoi(true)',
                       'dex_byte_ranges_changed': [[hex(a), hex(b)] for a, b in dex_changes], 'device_validation': 'NOT_RUN'},
        'emergency_dial': {'change': 'MainActivity.openExternal: a host-less URI skips the host test and the second scheme constant "http" becomes "tel", so tel:110 / tel:120 reach the dialer',
                           'accepted_schemes': ['https', 'tel'], 'device_validation': 'NOT_RUN'},
    }
    report_file = output.with_suffix('.verification.json')
    with report_file.open('x', encoding='utf-8') as handle:
        json.dump(report, handle, indent=2, ensure_ascii=False)
    print(json.dumps(report, indent=2, ensure_ascii=False))
    # Each build stages ~190 MB; the signed APK is already copied out, so remove the staging copy.
    shutil.rmtree(work, ignore_errors=True)


if __name__ == '__main__':
    main()
