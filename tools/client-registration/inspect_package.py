import struct
from pathlib import Path

class Reader:
    def __init__(self,b,pos=0): self.b,self.pos=b,pos
    def u32(self):
        v=struct.unpack_from('<I',self.b,self.pos)[0];self.pos+=4;return v
    def ci(self):
        x=self.b[self.pos];self.pos+=1;v=x&63;neg=x&128;more=x&64;shift=6
        while more:
            x=self.b[self.pos];self.pos+=1;v|=(x&127)<<shift;shift+=7;more=x&128
        return -v if neg else v
    def string(self):
        n=self.ci();size=n if n>=0 else -n*2
        x=self.b[self.pos:self.pos+size];self.pos+=size
        return x.decode('latin1' if n>=0 else 'utf-16le').rstrip('\0')

class Package:
    def __init__(self,path):
        self.b=Path(path).read_bytes();r=Reader(self.b,12)
        nc,no,ec,eo,ic,io=[r.u32() for _ in range(6)]
        r=Reader(self.b,no);self.names=[]
        for _ in range(nc): self.names.append(r.string());r.u32()
        r=Reader(self.b,io);self.imports=[]
        for _ in range(ic):self.imports.append((r.ci(),r.ci(),r.u32(),r.ci()))
        r=Reader(self.b,eo);self.exports=[]
        for _ in range(ec):
            start=r.pos;c,s,o,n,f,z=r.ci(),r.ci(),r.u32(),r.ci(),r.u32(),r.ci();off=r.ci() if z else 0
            self.exports.append(dict(cls=c,super=s,outer=o,name=n,flags=f,size=z,offset=off,entry=start,end=r.pos))
    def name(self,index):
        if index<0:return self.names[self.imports[-index-1][3]]
        if index>0:return self.names[self.exports[index-1]['name']]
        return 'None'

if __name__=='__main__':
    import sys
    if len(sys.argv) != 2: raise SystemExit('Usage: inspect_package.py PACKAGE_UNR')
    p=Package(sys.argv[1])
    for i,e in enumerate(p.exports):
        if p.name(e['outer'])=='ZPage_LoginWasabii':
            print(i+1,p.names[e['name']],p.name(e['cls']),e['offset'],e['size'])
            if p.names[e['name']] in ['ButtonClick','AccountLogin','SendConnect']:
                print(p.b[e['offset']:e['offset']+e['size']].hex())
