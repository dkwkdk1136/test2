# test2 — Metal Rage Online server

Source copied from the local MetalRage folder. Original project: [shanzenos/MRO-Server](https://github.com/shanzenos/MRO-Server). The original project description and credits are preserved below.

## Local setup

The server files are at the root of this repository.

1. Install Node.js and MySQL, and run `npm ci`.
2. Copy `database/config.example.json` to `database/config.json` and enter your local database settings.
3. Copy `config/server.example.json` to `config/server.json`; set `publicHost` and `cachePath` for your installation.
4. Follow the [upstream setup guide](https://github.com/shanzenos/MRO-Server/wiki) to initialize the database and configure the game client.
5. Run `npm start`. Run `npm test` for the automated tests.

Local credentials, server settings, installed dependencies, game-client binaries, and decrypted/generated game assets are excluded. Supply the client and runtime assets separately as described in the upstream guide.

## 상점 구매 오류: Cache.Bin 경로

`Shop Buy transaction error: Set cachePath in config/server.json to the game client Cache.Bin`은 서버가 아이템 메타데이터 파일을 찾지 못했다는 뜻입니다.

`config/server.example.json`을 `config/server.json`으로 복사하고, 실제 파일 위치를 지정하세요. 서버 폴더 안에 파일이 있다면 설치 위치에 의존하지 않는 상대 경로를 사용할 수 있습니다.

```json
{
  "publicHost": "127.0.0.1",
  "cachePath": "static/gamefiles/Cache.Bin",
  "gameHosts": {}
}
```

상대 경로의 기준은 `config` 폴더가 아니라 서버 최상위 폴더입니다. 위 경로는 서버가 `C:/MetalRage-v0.1.1`에 있을 때 `C:/MetalRage-v0.1.1/static/gamefiles/Cache.Bin`을 가리킵니다. 기존 publicHost/gameHosts 설정은 유지하세요.

`cachePath`가 없으면 `static/Cache.Bin`, `static/gamefiles/Cache.Bin`, 상위 폴더의 `MetalRage/Data/System/Cache.Bin` 순서로 자동 탐색합니다. 명시한 cachePath가 잘못된 경우에는 자동 탐색으로 대체하지 않으므로 해당 설정을 수정해야 합니다.

저장 후 서버를 완전히 재시작하세요. 서버 폴더에서 다음 명령으로 경로 확인이 가능합니다(파일 내용의 호환성까지 검증하는 명령은 아닙니다).

```powershell
node -e "console.log(require('./config/cache').findCacheBinPath())"
```

개인 설정 `config/server.json`과 게임 데이터 `Cache.Bin`은 GitHub에 포함되지 않습니다. 서버 교체 시 별도로 보존하세요. DB 초기화는 필요하지 않습니다.

## 외부 네트워크에서 함께 플레이

서버와 방장이 같은 PC에 있어도 외부 참가자에게 방장의 공인 IP/전투 포트를 전달하도록 `gameHosts`를 설정할 수 있습니다.
설정 예시, 포트포워딩, 실패 로그와 검증 범위는 [한국어 네트워크 설정 안내](docs/NETWORK_SETUP.ko.md)를 확인하세요.

---

# MRO Server
This is a server emulator for the game Metal Rage Online, written in nodeJS.

Created from Ennuo's original MRO Server Prototype: https://github.com/ennuo/eks/tree/main/servers/metalrage

Huge thanks to Ennuo & Zephos for their contributions, their work laid the groundwork for all this.

This server emulator aims to restore online functionality for the 2009 online mech shooter Metal Rage Online, created by GameHI.

A server setup tutorial as well as some documentation can be found in the project's wiki: [MRO Server Wiki](https://github.com/shanzenos/MRO-Server/wiki)

The server currently supports core functionality, the garage/shop, PVE gameplay & Deathmatch mode for PVP.

Server uses the following ports:
* 9211 - Auth/Dispatch
* 30907 - Game Server

Requirements:
* [MySQL](https://www.mysql.com/)
* [NodeJS](https://nodejs.org/en)
* [Game Client](https://archive.org/download/metal-rage-online-client/MetalRage%20Online/MetalRage%20Online.rar)

Additionally, a fix for the game to run on windows 11 onward can be found [here](https://github.com/shanzenos/Metal-Rage-Online-Win11-Fix)
