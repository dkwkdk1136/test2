"""Decode the patched function independently and validate VM jumps/context sizes."""
import struct
from inspect_package import Package, Reader

def verify(filename):
    p=Package(filename)
    e=next(e for e in p.exports if p.names[e['name']]=='ButtonClick' and p.name(e['outer'])=='ZPage_LoginWasabii')
    data=p.b[e['offset']:e['offset']+e['size']]
    r=Reader(data,26);pc=0;starts=set();targets=[];calls=[]
    def byte():
        nonlocal pc
        x=r.b[r.pos];r.pos+=1;pc+=1;return x
    def word():return byte() | byte()<<8
    def index():
        nonlocal pc
        x=r.ci();pc+=4;return x
    def expr():
        nonlocal pc
        starts.add(pc);op=byte()
        if op in (0,1):return ('var',p.name(index()))
        if op==0x20:return ('object',p.name(index()))
        if op in (0x0b,0x16,0x27,0x28,0x2a,0x47):return op
        if op==4:return ('return',expr())
        if op==5:
            byte();return ('switch',expr())
        if op==6:targets.append(word());return 'jump'
        if op==7:
            targets.append(word());return ('ifnot',expr())
        if op==0xa:
            target=word()
            if target!=0xffff:targets.append(target);return ('case',expr())
            return 'default'
        if op==0xe:return ('discard',expr())
        if op in (0x12,0x19):
            obj=expr();skip=word();byte();begin=pc;result=expr()
            assert pc-begin==skip,(filename,'context size',pc-begin,skip)
            return ('context',obj,result)
        if op==0x1f:
            s=[]
            while True:
                c=byte()
                if c==0:break
                s.append(c)
            return bytes(s).decode('ascii')
        if op==0x1b or op>=0x60:
            if op==0x1b:name=p.names[index()]
            elif op<0x70:name=f'native:{(op-0x60)*256+byte()}'
            else:name=f'native:{op}'
            args=[]
            while r.b[r.pos]!=0x16:args.append(expr())
            byte();calls.append((name,args));return ('call',name,args)
        raise ValueError(f'Unknown opcode {op:x} at VM {pc-1}')
    tree=[]
    while pc<144:tree.append(expr())
    assert pc==144
    assert all(t in starts for t in targets),(targets,starts)
    return calls

import sys
if len(sys.argv) != 3:
    raise SystemExit('Usage: verify_bytecode.py ORIGINAL_MENU_UNR PATCHED_MENU_UNR')
old=verify(sys.argv[1])
new=verify(sys.argv[2])
assert any(n=='ConsoleCommand' for n,a in old)
assert not any(n=='ConsoleCommand' for n,a in new)
certify=next(a for n,a in new if n=='Certify_Account_Set')
assert certify[0][1]=='native:112' and certify[0][2][0]=='!REG!'
assert any(n=='SendConnect' for n,a in new)
print('PASS: old/new VM size 144, all jump targets and context skips valid.')
print('Register calls:',certify)
