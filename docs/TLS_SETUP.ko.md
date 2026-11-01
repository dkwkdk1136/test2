# 로그인·로비 통신 TLS 적용 안내

## 구현과 현재 상태

기존 회원가입 패치 위에 적용하는 추가 패치입니다. 코드와 설정을 수동으로 적용하는 방식이며 서버나 게임을 자동으로 실행하지 않습니다. 실제 게임 및 외부망 접속 검증은 별도로 필요합니다.

통신 경로:

```text
게임 → 같은 PC의 127.0.0.1:9211/30907 → TLS 보조 프로그램
     → 인터넷 구간 TLS 1.3 / AES-256-GCM → 서버 TCP 19211/40907
```

로그인/회원가입 요청, 비밀번호 MD5 값, 게임 로그인 토큰, 로비/상점 통신을 인터넷 구간에서 암호화합니다. 기존 DB의 scrypt 저장과 계정·아이템은 그대로입니다. 게임과 같은 PC의 보조 프로그램 사이 loopback 통신, 방장 클라이언트와 참가자 사이의 전투/P2P/UDP 통신은 이 TLS 터널의 보호 범위가 아닙니다.

TLS 모드에서는 서버가 기존 TCP 9211/30907 대신 TLS 19211/40907만 엽니다. 접속 실패 시 평문으로 재접속하는 fallback은 없습니다. 로비에 전달하는 주소는 각 사용자 PC의 보조 프로그램을 가리키는 127.0.0.1:30907로 바뀝니다. 서버가 직접 TLS를 종료하므로 서버 로그와 IP 허용 목록에서는 원격 사용자의 실제 연결 주소가 유지됩니다.

## 배포 파일 구분

- `tls-server-private.zip`: 서버 관리자 전용. 서버 코드, 인증서, 개인키, 적용 안내를 포함합니다. 다른 사용자에게 보내거나 GitHub에 업로드하지 마세요.
- `tls-client.zip`: 각 사용자에게 전달할 TLS 폴더. 보조 프로그램과 공개 CA 인증서만 포함하며 개인키는 없습니다.
- `tls-source.zip`: 키가 없는 소스·테스트·문서. Git 검토용입니다.

인증서 이름은 현재 클라이언트 실행 파일에 설정된 `mometalrage261031.iptime.org`를 기준으로 만들었습니다. 서버 주소가 바뀌면 인증서 SAN과 bridge.json의 serverName을 함께 다시 준비해야 합니다. 서버 인증서는 발급 시점부터 365일 유효합니다. CA 키는 서버의 private-backup에 두고 공개 배포하지 않습니다.

## 서버 적용 — 직접 실행

1. 기존 게임 서버 CMD를 직접 종료하고, `server.js`, `config/server.js`, `.gitignore`, `config/server.json`을 백업합니다.
2. 서버 ZIP 내용물을 `C:/MetalRage-v0.1.1`에 복사합니다. database/db.js, DB 접속 정보, 계정 DB, Cache.Bin은 이 ZIP에 포함되지 않습니다.
3. 서버 CMD에서 아래 명령을 실행합니다. 인증서 파일을 확인하고 기존 설정을 백업한 후 tls 항목만 추가합니다. 서버를 실행하지는 않습니다.

```powershell
node security/enable-tls.js
```

설정 결과의 tls 항목:

```json
"tls": {
  "enabled": true,
  "authPort": 19211,
  "gamePort": 40907,
  "keyFile": "certs/server.key",
  "certFile": "certs/server.crt"
}
```

4. 외부 접속에는 서버 방화벽과 공유기에서 TCP 19211·40907을 서버 PC로 허용/전달해야 합니다. 기존 서버 프로세스를 별도로 실행해 평문 접속 경로를 남기지 마세요. 기존 9211/30907 포워딩은 이 TLS 구성에서는 사용하지 않습니다. 전투 포트 설정은 기존 방식 그대로입니다.
5. 준비가 끝나면 기존 Start Server.bat 또는 `node server.js`를 **직접 실행**합니다. TLS 모드 로그와 19211/40907 리스닝을 확인합니다.

## 클라이언트 적용 — 사용자마다 필요

로컬 배포 ZIP에는 Windows x64용 Node.js 26.13.0 런타임과 공식 라이선스를 TLS/runtime에 포함했습니다. GitHub에는 런타임을 올리지 않으므로 아래 재생성 절차로 준비해야 합니다. 완성된 배포본의 사용자는 Node.js/npm을 별도로 설치하지 않아도 됩니다.

클라이언트 ZIP의 `TLS` 폴더를 게임의 data 폴더 옆에 둡니다.

```text
MetalRage Online/
├─ data/
└─ TLS/
   ├─ bridge.js
   ├─ launch.js
   ├─ runtime/ (node.exe, LICENSE)
   ├─ bridge.json
   ├─ ca.crt
   ├─ Start TLS Bridge.cmd
   └─ Play through TLS.cmd
```

bridge.example.json은 공용 DDNS 주소를 예시로 사용합니다. host와 serverName을 함께 아래 값으로 유지하세요. 같은 공유기 안에서 공용 주소로 접속하려면 공유기의 NAT loopback 또는 내부 DNS 구성이 필요할 수 있습니다. 외부 사용자용 주소를 localhost로 바꾸지 마세요.

```json
{
  "host": "mometalrage261031.iptime.org",
  "serverName": "mometalrage261031.iptime.org",
  "authPort": 19211,
  "gamePort": 40907,
  "caFile": "ca.crt"
}
```

1. ZIP에 포함된 `data/System/Play Metal Rage Online.bat`를 기존 파일을 백업한 뒤 덮어씁니다.
2. 평소처럼 이 BAT를 실행하면 보조 프로그램 시작 → 두 서버 채널 인증서 확인 → 게임 실행이 자동으로 이어집니다. `TLS/Play through TLS.cmd`로 실행해도 같습니다. CMD 창은 보이게 유지되며 게임이 종료되면 이 런처가 시작한 보조 프로그램만 정리합니다. 별도로 `Start TLS Bridge.cmd`를 먼저 실행할 필요가 없습니다. 기존 MetalRageLauncher.exe나 MetalRage.exe 자체를 직접 실행하는 경로는 바뀌지 않았으므로, 바로가기도 새 BAT를 대상으로 해야 합니다.
3. 로그인 또는 Register를 눌렀을 때 보조 CMD에 `Verified ... TLSv1.3 AES-256-GCM`이 표시되는지 확인합니다. 인증서 검증 성공 전에는 게임 데이터를 서버로 전달하지 않습니다.
4. 가입/정상 비밀번호/틀린 비밀번호/재접속/상점 구매를 검증합니다. 기존 게임 내 Register 패치는 그대로 사용합니다.

EADDRINUSE가 나오면 이미 보조 프로그램 또는 예전 평문 서버가 9211/30907을 쓰는 것입니다. 중복 실행을 직접 종료하세요. 보조 프로그램은 임의로 다른 포트로 옮겨 실행하지 않습니다. 인증서 오류가 나면 ca.crt, serverName, PC 시계와 유효기간을 확인하며 인증서 검증을 끄지 마세요.

## 검증 결과와 한계

- 임시 loopback 포트에서 두 채널의 128KiB 왕복 바이트 보존과 TLS 1.3/AES-256-GCM 협상을 확인했습니다.
- 다른 CA, 잘못된 서버 이름, 만료된 인증서에서는 자격 증명 바이트가 전달되지 않았습니다.
- TLS 엔드포인트의 평문/TLS 1.2 거절, 포트 충돌, 잘못된 TLS 설정 및 키 불일치 거절을 확인했습니다.
- TLS 테스트 8개 및 기존 서버 테스트 28개와 회귀 스크립트 6개 통과. 자동 실행 순서·포트 충돌·인증서 실패·게임 종료/오류 정리 테스트 6개도 모의 프로세스로 통과했습니다. 실제 게임 자동 실행은 아직 검증하지 않았습니다.
- 실제 게임 실행과 외부 PC 접속, 공유기 경유 테스트는 아직 하지 않았습니다. 운영 포트를 열거나 기존 서버를 실행하지 않았습니다.

## 인증서 갱신과 신뢰

인증서는 `security/create_certificates.py`로 생성했습니다(Python cryptography 필요). 새 출력 폴더를 사용해야 하며 기존 키를 덮어쓰지 않습니다. 새 CA로 다시 발급하면 사용자 모두에게 새 ca.crt를 신뢰할 수 있는 경로로 전달해야 합니다. CA 키로 서버 인증서를 갱신하는 별도 관리 도구는 이번 패치에 포함되지 않습니다.

서버의 개인키가 유출되면 새 키·인증서로 교체해야 합니다. 이 패치는 Windows 전체의 인증서 저장소를 변경하지 않습니다. 클라이언트가 받은 ca.crt만 해당 보조 프로그램에서 신뢰합니다.

## 복구

프로그램을 직접 종료하고 백업한 코드·config/server.json을 복원합니다. 클라이언트도 기존 실행 방법으로 되돌립니다. 복구하면 통신도 기존의 TLS 없는 방식으로 돌아갑니다. DB 변경은 없습니다.

## 구현 근거

- [Node.js TLS API](https://nodejs.org/api/tls.html): createServer/connect, TLS 버전, 암호군 및 인증서·호스트 이름 검증.
- [Cryptography X.509 CA hierarchy](https://cryptography.io/en/latest/x509/tutorial/#creating-a-ca-hierarchy): CA와 서버 인증서 생성.

## GitHub 소스로 배포본 준비

개인키, 인증서, 런타임, 게임 패키지 및 배포 ZIP은 GitHub에 포함하지 않습니다. 서버 관리자만 다음을 진행합니다.

1. `python -m pip install cryptography` 후 `python security/create_certificates.py --hostname YOUR_DNS_NAME --output certs`로 새 인증서를 만듭니다. 운영 중인 CA를 교체하는 경우 모든 클라이언트의 ca.crt도 교체해야 합니다.
2. 게임 폴더 옆에 TLS 폴더를 만들고 client-tls의 bridge.js, launch.js, 두 CMD 파일을 복사합니다. bridge.example.json은 bridge.json으로 복사하고 host/serverName을 인증서 DNS 이름으로 설정합니다.
3. certs/ca.crt만 TLS/ca.crt로 복사합니다. server.key와 ca.key는 서버 관리자가 보관합니다.
4. 공식 Node.js Windows x64 ZIP의 node.exe와 LICENSE를 TLS/runtime에 넣습니다. 검증한 버전은 26.13.0입니다. [Node.js 공식 저장소](https://github.com/nodejs/node/tree/v26.13.0)
5. client-tls/Play Metal Rage Online.bat를 게임 data/System에 복사합니다. 전체 게임 파일과 TLS 폴더를 함께 배포합니다.
6. 서버에서 node security/enable-tls.js를 실행해 설정만 추가한 뒤, 준비가 되면 직접 서버와 게임 BAT를 실행합니다.

TLS 및 자동 실행 테스트 재현(테스트 인증서를 운영용으로 쓰지 마세요):

```powershell
python test/generate-tls-fixtures.py test/.tls-fixtures
$env:MRO_TLS_TEST_FIXTURES = (Resolve-Path test/.tls-fixtures).Path
node --test test/tls.test.js test/tls-launcher.test.js
```

TLS 테스트는 임시 loopback 포트만 사용합니다. 런처 테스트는 게임 프로세스를 모의 객체로 대체합니다.
