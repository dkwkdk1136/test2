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
