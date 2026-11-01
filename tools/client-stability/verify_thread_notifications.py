"""Offline validation; does not launch MetalRage or connect to the server."""
import sys
from pathlib import Path
import pefile
from verify_callback_abi import run

original,patched=map(Path,sys.argv[1:])
a,ac,am=run(original);b,bc,bm=run(patched)
assert all(delta==(4 if reason==1 else 16) for reason,delta in b),b
assert ac==bc and am==bm,'Original initialization changed'
raw,changed=original.read_bytes(),patched.read_bytes()
pe=pefile.PE(data=raw)
table=pe.get_offset_from_rva(pe.DIRECTORY_ENTRY_TLS.struct.AddressOfCallBacks-pe.OPTIONAL_HEADER.ImageBase)
cave=pe.get_offset_from_rva(0x6abc0)
assert len(raw)==len(changed)
assert raw[:pe.OPTIONAL_HEADER.SizeOfHeaders]==changed[:pe.OPTIONAL_HEADER.SizeOfHeaders]
assert all(table<=i<table+8 or cave<=i<cave+36 for i,(x,y) in enumerate(zip(raw,changed)) if x!=y)
print('PASS: original process-attach callback behavior and initialization preserved')
print('PASS: six thread/detach callbacks use NTAPI stack cleanup')
print('PASS: unchanged PE headers, file size, sections, entry point and original code')
