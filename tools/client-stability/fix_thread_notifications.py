"""Preserve packed process-attach startup; correct no-op notification returns.
Uses existing executable padding. Does not change PE headers, size or sections.
"""
import hashlib
import struct
import sys
from pathlib import Path
import pefile

SUPPORTED = '487646b0aafb9f586126876ef483825f60053e0166f59b74a7ca86ac437021b4'
def build(source, output):
    source,output=Path(source),Path(output)
    if source.resolve()==output.resolve():raise ValueError('Separate output required')
    raw=source.read_bytes()
    if hashlib.sha256(raw).hexdigest()!=SUPPORTED:raise ValueError('Unsupported source')
    pe=pefile.PE(data=raw);base=pe.OPTIONAL_HEADER.ImageBase
    assert base==0x10900000
    cave=0x6abc0
    assert pe.get_data(cave,64)==bytes(64)
    section=pe.get_section_by_rva(cave)
    assert section.Characteristics & 0x20000000
    assert cave+64 < section.VirtualAddress+section.SizeOfRawData
    table=pe.DIRECTORY_ENTRY_TLS.struct.AddressOfCallBacks-base
    original=struct.unpack('<III',pe.get_data(table,12))
    assert original==(base+0x5112d,base+0x51159,0)
    result=bytearray(raw);code=bytearray();addresses=[]
    for target in original[:2]:
        start=base+cave+len(code);addresses.append(start)
        # Preserve flags. Process attach takes a tail JMP into the exact original
        # routine, with the exact original stack/return address (no extra CALL).
        # Other reasons already do nothing in both original routines.
        wrapper=bytearray.fromhex('9c837c240c0174049dc20c009de9')
        wrapper+=struct.pack('<i',target-(start+len(wrapper)+4))
        assert len(wrapper)==18
        code+=wrapper
    at=pe.get_offset_from_rva(cave);result[at:at+len(code)]=code
    struct.pack_into('<II',result,pe.get_offset_from_rva(table),*addresses)
    assert result[:pe.OPTIONAL_HEADER.SizeOfHeaders]==raw[:pe.OPTIONAL_HEADER.SizeOfHeaders]
    assert len(result)==len(raw)
    output.parent.mkdir(parents=True,exist_ok=True);output.write_bytes(result)
    print('SHA256',hashlib.sha256(result).hexdigest())
if __name__=='__main__':build(*sys.argv[1:])
