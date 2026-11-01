import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'security'))
from create_certificates import generate
if len(sys.argv)!=2:raise SystemExit('Usage: generate-tls-fixtures.py OUTPUT_DIRECTORY')
root=Path(sys.argv[1])
generate('tls-test.invalid',root/'valid')
generate('tls-test.invalid',root/'untrusted')
generate('tls-test.invalid',root/'expired',expired=True)
print('Generated test-only certificates for tls-test.invalid.')
