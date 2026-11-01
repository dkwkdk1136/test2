> 적용 중단: 2026-11-01 22:38 사용자 실행에서 시작 직후 0xC0000005 충돌이 발생했습니다. 이 패치는 사용하지 마세요. 로컬 EXE는 원본 SHA256으로 복원했습니다. 콜백 단독 에뮬레이션은 전체 EXE 초기화 호환성을 보장하지 못했습니다. 원인 진단은 미확정입니다.

# 클라이언트 스레드 콜백 복귀 오류 수정

2026-11-01 로컬 클라이언트 진단. Windows Application 이벤트와 CrashDumps의 동일 게임 세션에서 여러 스레드가 주소 2/3 실행 접근 위반을 기록했습니다. 예외 컨텍스트의 스택에 EXE의 PE TLS 콜백이 반복 등장합니다. 여기의 TLS는 Thread Local Storage이며 암호화 통신 TLS와 무관합니다.

지원 원본 SHA256: `487646b0aafb9f586126876ef483825f60053e0166f59b74a7ca86ac437021b4`
수정본 SHA256: `dd22bb9dfc6e349beeca7a49d6ebe1b4ae8b2ddce897c9d82cd3684eae247a4a`

두 콜백(0x1095112d, 0x10951159)이 3개 인수를 받지만 plain RET로 반환하여 NTAPI/stdcall 규약의 12바이트 인수 정리를 하지 않습니다. 기존 코드는 그대로 유지하고 .cbfix 실행/읽기 섹션에 래퍼를 추가했습니다. 래퍼는 동일 인수로 기존 콜백을 호출한 뒤 인수를 정리하고 RET 12로 복귀합니다. 암호화 통신, 게임 로직, 로그인 패키지, 안티치트 파일은 변경하지 않습니다.

개발용 의존성: pefile, unicorn.
```
python fix_callback_abi.py ORIGINAL_EXE OUTPUT_EXE
python verify_callback_abi.py ORIGINAL_EXE OUTPUT_EXE
```
지원 해시가 아닌 파일에는 적용을 거부합니다. 출력은 별도 파일에만 작성합니다. 원본 백업 후 게임이 종료된 상태에서 교체하세요.

오프라인 에뮬레이션: 두 콜백 × PROCESS_ATTACH/THREAD_ATTACH/THREAD_DETACH/PROCESS_DETACH 8조합에서 정상 스택 정리 확인. 기존 콜백, 복호화 결과, 초기화 메모리 변경, 비휘발성 레지스터 보존 확인. 실제 게임 실행은 하지 않았습니다. 플레이 프리징/ESC 종료 메뉴 멈춤의 해결 여부는 사용자 재현으로 검증해야 합니다. 문구 데이터 ImportText 오류도 별도로 남아 있으므로 이번 변경으로 모든 원인이 해결됐다고 단정할 수 없습니다.

호출 규약 근거:
- https://learn.microsoft.com/en-us/windows/win32/debug/pe-format#tls-callback-functions
- https://learn.microsoft.com/en-us/cpp/cpp/stdcall
