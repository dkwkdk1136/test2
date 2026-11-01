# 창 없는 배포용 런처

`Play Metal Rage Online.exe`를 게임의 `data` 폴더 옆에 배치하고 실행합니다. 기존 BAT는 사용하지 않습니다. `TLS/bridge.json`과 `TLS/ca.crt`는 기존 설정을 유지합니다. Node 프로세스나 CMD/PowerShell을 실행하지 않으며 .NET 런타임은 EXE에 포함됩니다. 게임의 requireAdministrator 요구에 따라 UAC 승인은 필요합니다.

Windows 11 x64 이상이 필요합니다. Windows TLS(Schannel)를 사용하며 TLS 1.3 / AES-256-GCM, 서버 이름 및 전용 CA 검증을 강제합니다. Windows 10에서는 실행을 거부합니다. TLS 검증 성공 후 게임을 실행하고 게임 종료 시 자신이 연 포트/연결을 닫습니다. 다른 프로세스를 종료하지 않습니다. 오류는 메시지 창과 `%LOCALAPPDATA%/MetalRage/launcher.log`에 기록됩니다.

빌드 (.NET 8 SDK):
```
dotnet publish client-native/MetalRageLauncher.csproj -c Release -o client-native/publish
```

테스트 (게임/운영 서버를 실행하지 않는 임시 로컬 TLS 에코 서버):
```
python test/generate-tls-fixtures.py test/.tls-fixtures
dotnet build test/native/NativeTests.csproj -c Release
$env:MRO_TLS_TEST_FIXTURES = (Resolve-Path test/.tls-fixtures).Path
node test/native-test.cjs
```
Node는 이 개발 테스트에만 필요하며 플레이 유저에게는 필요하지 않습니다.

검증: 양쪽 채널 128KB 데이터 전달, 서버 이름 불일치, 신뢰하지 않는 CA, 만료 인증서, TLS 1.2 거부, 포트 충돌 시 기존 리스너 보존. 실제 게임 실행/UAC 흐름과 외부 플레이는 수동 검증이 필요합니다.
# 게임 전용 SEHOP 호환성 설정

런처는 게임 실행 전에 Windows `Set-ProcessMitigation -Name <MetalRage.exe 전체 경로> -Disable SEHOP`를 숨김 PowerShell로 호출하고 적용 결과를 확인합니다. 경로는 런처 옆 `data/System/MetalRage.exe`로 고정됩니다. 시스템 전체 및 다른 보호 옵션은 변경하지 않습니다. 기존 관리자 권한 요청을 사용하며 CMD 창은 표시하지 않습니다.

이 설정은 게임 종료 뒤에도 해당 경로의 Windows 프로그램별 설정으로 남습니다. 런처는 실행할 때 다시 확인·적용합니다. 실패하면 로그와 오류창을 표시하고 게임 실행을 중단합니다. 로그: `%LOCALAPPDATA%/MetalRage/launcher.log`.

해제하려면 관리자 Windows PowerShell에서 `Set-ProcessMitigation -Name '게임 실행 파일 전체 경로' -Remove -Disable SEHOP`로 해당 SEHOP 재정의만 제거하십시오. 다음 런처 실행 시 다시 적용되므로 지속 해제하려면 이 기능이 없는 이전 런처를 사용해야 합니다.

공식 명령 설명: https://learn.microsoft.com/en-us/powershell/module/processmitigations/set-processmitigation

