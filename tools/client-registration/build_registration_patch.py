"""Patch the supported, user-supplied UE2 menu package; never edit the original.

Register reuses the two existing login fields and sends !REG! + ID via the
original Certify_Account_Set / SendConnect path. It does not open a browser.
Existing Login/Exit branches and all runtime jump offsets stay unchanged.
"""
import hashlib
import struct
from pathlib import Path
from inspect_package import Package

ORIGINAL_SHA = '0b7862a1a58a08c8b9e6b71de6b22d162993094b61bf70853398e16e01b0a6f1'

def ci(value):
    sign = 128 if value < 0 else 0
    v = abs(value);result = bytearray([sign | (v & 63)]);v >>= 6
    if v: result[0] |= 64
    while v:
        x = v & 127;v >>= 7;result.append(x | (128 if v else 0))
    return bytes(result)

def build(data_root, keys_path, output):
    data_root, output = Path(data_root), Path(output)
    original = (data_root / 'MUD/ZGameMainMenu.tzp').read_bytes()
    if hashlib.sha256(original).hexdigest() != ORIGINAL_SHA:
        raise ValueError('Unsupported client package: original SHA-256 mismatch')
    names = (data_root/'System/File.so').read_text().splitlines()
    seeds = (data_root/'System/iFile.so').read_text().splitlines()
    index = [x.strip().lower() for x in names].index('zgamemainmenu.tzp')
    seed = int(seeds[index]);keys = Path(keys_path).read_bytes()
    def crypt(data):
        return bytes(v ^ keys[(seed * 1024 + i % 1024) * 4] for i, v in enumerate(data))
    decoded = crypt(original)
    output.mkdir(parents=True, exist_ok=True)
    source = output/'original-menu.unr';source.write_bytes(decoded)
    package = Package(source)
    target = next(i for i,e in enumerate(package.exports)
                  if package.names[e['name']] == 'ButtonClick'
                  and package.name(e['outer']) == 'ZPage_LoginWasabii')
    export = package.exports[target]
    body = decoded[export['offset']:export['offset']+export['size']]
    start = body.index(bytes.fromhex('0e19632c16'))
    end = body.index(bytes.fromhex('16068b000affff'), start)+1
    old = body[start:end]
    assert len(old) == 65 and b'start https://member.wasabii.com.tw/CreateUser.aspx' in old
    assert struct.unpack_from('<I', body, 22)[0] == 144

    # Existing object/name references copied from the original AccountLogin function.
    id_get = bytes.fromhex('190176290600001b1f16')
    pw_get = bytes.fromhex('19015a2b0600001b1f16')
    concat = b'\x70\x1f!REG!\0' + id_get + b'\x16'
    # ClassContext skip = runtime bytes in Certify_Account_Set's call (45).
    certify = bytes.fromhex('1220862d00001b7c10') + concat + pw_get + b'\x16'
    send_connect = bytes.fromhex('1b6a0416')
    # Runtime width: 54 + 6 + 7 Nothing opcodes = 67, same as original branch.
    replacement = certify + send_connect + b'\x0b'*7
    changed_body = body[:start]+replacement+body[end:]
    patched = bytearray(decoded)
    new_offset = len(patched);patched.extend(changed_body)
    new_table = len(patched)
    for i,e in enumerate(package.exports):
        size,offset = (len(changed_body),new_offset) if i==target else (e['size'],e['offset'])
        patched.extend(ci(e['cls'])+ci(e['super'])+struct.pack('<I',e['outer'])+ci(e['name'])+struct.pack('<I',e['flags'])+ci(size))
        if size:patched.extend(ci(offset))
    struct.pack_into('<I',patched,24,new_table)
    destination=output/'patched-menu.unr';destination.write_bytes(patched)
    check=Package(destination)
    assert len(check.exports)==len(package.exports)
    for i,e in enumerate(check.exports):
        before=package.exports[i]
        contents=check.b[e['offset']:e['offset']+e['size']]
        expected=changed_body if i==target else decoded[before['offset']:before['offset']+before['size']]
        assert contents==expected, f'Unexpected export change: {i}'
    encoded=crypt(patched)
    assert crypt(encoded)==patched
    (output/'ZGameMainMenu.tzp').write_bytes(encoded)
    print('Verified',len(check.exports),'exports; only login ButtonClick changed.')
    print('Patched SHA-256:',hashlib.sha256(encoded).hexdigest())
    return output/'ZGameMainMenu.tzp'

if __name__=='__main__':
    import sys
    if len(sys.argv)!=4:raise SystemExit('Usage: build_registration_patch.py DATA_DIR KEYS_BIN OUTPUT_DIR')
    build(*sys.argv[1:])
