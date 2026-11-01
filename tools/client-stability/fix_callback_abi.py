"""Fix the supported client's PE TLS callback calling convention.
No game process is started. Original callback code and behavior are preserved.
Requires pefile. Output must be a separate file.
"""
import hashlib
import struct
import sys
from pathlib import Path
import pefile

SUPPORTED = '487646b0aafb9f586126876ef483825f60053e0166f59b74a7ca86ac437021b4'

def build(source, destination):
    source, destination = Path(source), Path(destination)
    if source.resolve() == destination.resolve():
        raise ValueError('Use a separate output file')
    raw = source.read_bytes()
    if hashlib.sha256(raw).hexdigest() != SUPPORTED:
        raise ValueError('Unsupported executable hash; refusing to patch')
    pe = pefile.PE(data=raw)
    base = pe.OPTIONAL_HEADER.ImageBase
    assert base == 0x10900000 and not hasattr(pe, 'DIRECTORY_ENTRY_BASERELOC')
    table = pe.DIRECTORY_ENTRY_TLS.struct.AddressOfCallBacks - base
    callbacks = struct.unpack('<III', pe.get_data(table, 12))
    assert callbacks == (base + 0x5112d, base + 0x51159, 0)
    align = lambda x, a: (x + a - 1) // a * a
    rva = align(max(s.VirtualAddress + max(s.Misc_VirtualSize, s.SizeOfRawData) for s in pe.sections), pe.OPTIONAL_HEADER.SectionAlignment)
    offset = align(len(raw), pe.OPTIONAL_HEADER.FileAlignment)
    wrappers = bytearray()
    addresses = []
    for target in callbacks[:2]:
        addresses.append(base + rva + len(wrappers))
        # Duplicate all three arguments; original routines return with plain RET.
        # Restore their cdecl arguments, then return with NTAPI/stdcall RET 12.
        code = bytearray(bytes.fromhex('ff74240c') * 3)
        call_next = addresses[-1] + len(code) + 5
        code += b'\xe8' + struct.pack('<i', target - call_next)
        code += bytes.fromhex('8d64240cc20c00')
        wrappers += code
    header = pe.sections[-1].get_file_offset() + 40
    assert header + 40 <= min(s.PointerToRawData for s in pe.sections)
    assert not any(raw[header:header+40])
    padded = align(len(wrappers), pe.OPTIONAL_HEADER.FileAlignment)
    result = bytearray(raw)
    result += bytes(offset-len(result)) + wrappers + bytes(padded-len(wrappers))
    struct.pack_into('<8sIIIIIIHHI', result, header, b'.cbfix\0\0', len(wrappers), rva, padded, offset, 0, 0, 0, 0, 0x60000020)
    struct.pack_into('<H', result, pe.FILE_HEADER.get_field_absolute_offset('NumberOfSections'), pe.FILE_HEADER.NumberOfSections+1)
    struct.pack_into('<I', result, pe.OPTIONAL_HEADER.get_field_absolute_offset('SizeOfImage'), align(rva+len(wrappers), pe.OPTIONAL_HEADER.SectionAlignment))
    struct.pack_into('<I', result, pe.OPTIONAL_HEADER.get_field_absolute_offset('SizeOfCode'), pe.OPTIONAL_HEADER.SizeOfCode+padded)
    struct.pack_into('<II', result, pe.get_offset_from_rva(table), *addresses)
    check = pefile.PE(data=result)
    struct.pack_into('<I', result, pe.OPTIONAL_HEADER.get_field_absolute_offset('CheckSum'), check.generate_checksum())
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(result)
    print('Patched SHA256:', hashlib.sha256(result).hexdigest())
    print('Original callbacks preserved; wrappers:', [hex(a) for a in addresses])

if __name__ == '__main__':
    if len(sys.argv) != 3: raise SystemExit('Usage: fix_callback_abi.py ORIGINAL_EXE OUTPUT_EXE')
    build(*sys.argv[1:])
