"""Emulate only PE callbacks, never start the game. Requires pefile + unicorn."""
import struct
import sys
from pathlib import Path
import pefile
from unicorn import Uc, UC_ARCH_X86, UC_MODE_32
from unicorn.x86_const import UC_X86_REG_ESP, UC_X86_REG_ESI, UC_X86_REG_EBX, UC_X86_REG_EDI, UC_X86_REG_EBP

def run(file):
    pe = pefile.PE(str(file)); base = pe.OPTIONAL_HEADER.ImageBase
    image = pe.get_memory_mapped_image()
    uc = Uc(UC_ARCH_X86, UC_MODE_32)
    uc.mem_map(base, (len(image)+4095)//4096*4096); uc.mem_write(base, image)
    uc.mem_map(0, 0x10000)
    # Synthetic loader/PEB data; process attach behavior can be compared safely.
    for at, value in [(0x30,0x5000),(0x18,0x4000),(0x4030,0x5000),(0x500c,0x6000),(0x600c,0x7000),(0x701c,0x8000)]:
        uc.mem_write(at, struct.pack('<I', value))
    uc.mem_map(0x200000, 0x10000)
    stop = 0x2100
    table = pe.DIRECTORY_ENTRY_TLS.struct.AddressOfCallBacks-base
    callbacks = struct.unpack('<II',pe.get_data(table,8))
    observations=[]
    for reason in [1,2,3,0]:
        for callback in callbacks:
            esp=0x208000
            uc.mem_write(esp,struct.pack('<IIII',stop,base,reason,0))
            uc.reg_write(UC_X86_REG_ESP,esp)
            regs=[UC_X86_REG_ESI,UC_X86_REG_EBX,UC_X86_REG_EDI,UC_X86_REG_EBP]
            for i,r in enumerate(regs):uc.reg_write(r,0x12340000+i)
            uc.emu_start(callback,stop,count=10000)
            for i,r in enumerate(regs):assert uc.reg_read(r)==0x12340000+i
            observations.append((reason,uc.reg_read(UC_X86_REG_ESP)-esp))
    return observations,bytes(uc.mem_read(base+0x5112d,0x86)),bytes(uc.mem_read(0,0x10000))

if __name__=='__main__':
    original, patched = map(Path,sys.argv[1:])
    before, original_code, original_state = run(original)
    after, patched_code, patched_state = run(patched)
    assert all(delta==4 for reason,delta in before),before
    assert all(delta==16 for reason,delta in after),after
    assert original_code==patched_code,'Original callback/decryption behavior changed'
    assert original_state==patched_state,'Process-attach side effects changed'
    print('PASS: all 8 callback/reason combinations clean 12 argument bytes correctly')
    print('PASS: callback code, decrypted code, process-attach side effects and nonvolatile registers preserved')
