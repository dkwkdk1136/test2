"""Generate a private CA and server certificate without changing OS trust stores.

Requires Python cryptography. Keep the entire output directory on the server.
Distribute ONLY ca.crt to clients. No network connections or processes are started.
"""
import argparse
import datetime
import re
from pathlib import Path
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import NameOID, ExtendedKeyUsageOID

def generate(hostname, output, expired=False):
    if not re.fullmatch(r'[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?', hostname):
        raise ValueError('Expected a DNS hostname')
    out=Path(output)
    names=['ca.key','ca.crt','server.key','server.crt']
    if any((out/name).exists() for name in names): raise ValueError('Refusing to overwrite existing certificates')
    out.mkdir(parents=True,exist_ok=True)
    now=datetime.datetime.now(datetime.timezone.utc)
    ca_key=ec.generate_private_key(ec.SECP256R1())
    ca_name=x509.Name([x509.NameAttribute(NameOID.COMMON_NAME,'MetalRage private TLS CA')])
    ca=(x509.CertificateBuilder().subject_name(ca_name).issuer_name(ca_name)
        .public_key(ca_key.public_key()).serial_number(x509.random_serial_number())
        .not_valid_before(now-datetime.timedelta(days=1)).not_valid_after(now+datetime.timedelta(days=3650))
        .add_extension(x509.BasicConstraints(ca=True,path_length=0),critical=True)
        .add_extension(x509.KeyUsage(digital_signature=False,content_commitment=False,key_encipherment=False,data_encipherment=False,key_agreement=False,key_cert_sign=True,crl_sign=True,encipher_only=None,decipher_only=None),critical=True)
        .add_extension(x509.SubjectKeyIdentifier.from_public_key(ca_key.public_key()),critical=False)
        .sign(ca_key,hashes.SHA256()))
    key=ec.generate_private_key(ec.SECP256R1())
    cert=(x509.CertificateBuilder().subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME,hostname)]))
        .issuer_name(ca_name).public_key(key.public_key()).serial_number(x509.random_serial_number())
        .not_valid_before(now-datetime.timedelta(days=2))
        .not_valid_after(now+datetime.timedelta(days=-1 if expired else 365))
        .add_extension(x509.BasicConstraints(ca=False,path_length=None),critical=True)
        .add_extension(x509.SubjectAlternativeName([x509.DNSName(hostname)]),critical=False)
        .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH]),critical=False)
        .add_extension(x509.KeyUsage(digital_signature=True,content_commitment=False,key_encipherment=False,data_encipherment=False,key_agreement=False,key_cert_sign=False,crl_sign=False,encipher_only=None,decipher_only=None),critical=True)
        .add_extension(x509.AuthorityKeyIdentifier.from_issuer_public_key(ca_key.public_key()),critical=False)
        .sign(ca_key,hashes.SHA256()))
    for name,k in [('ca.key',ca_key),('server.key',key)]:
        with (out/name).open('xb') as f:f.write(k.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption()))
    for name,c in [('ca.crt',ca),('server.crt',cert)]:
        with (out/name).open('xb') as f:f.write(c.public_bytes(serialization.Encoding.PEM))
    return out

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--hostname',required=True)
    parser.add_argument('--output',required=True)
    args=parser.parse_args()
    generate(args.hostname,args.output)
    print('Created certificates. Distribute only ca.crt; keep both .key files private.')
