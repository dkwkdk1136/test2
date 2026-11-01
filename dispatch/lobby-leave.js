'use strict';
const rooms = require('../rooms');
const { sendGateInfo } = require('./gate-info.sender');
const CQ_LEAVE = 0x00220114;
const SA_LEAVE = 0x00220115;

// ZNetwork.dll: ZDispatchLobby::Leave_CQ waits for SA_LEAVE.
// Leave_SA reads exactly FNETWORK_EVENT_INFO (u16 event + u32 error),
// clears lobby state and returns to scene 3 on success. Keep the connection
// and authentication intact so the player can select another channel.
function handleLobbyLeave(client, type, body) {
    if (type !== CQ_LEAVE) return false;
    const invalid = !client.accountId_ || body.length !== 0 || !!rooms.getRoomByAccount(client.accountId_);
    const [packet, response] = client.getMessageBuffer(SA_LEAVE, 6);
    response.writeUInt16LE(0, 0);
    response.writeUInt32LE(invalid ? 1 : 0, 2);
    client.send(packet);
    if (!invalid) sendGateInfo(client);
    console.log(`[LobbyLeave] account=${client.accountId_ || 0} result=${invalid ? 'rejected' : 'ok'} response=0x00220115`);
    return true;
}
module.exports = { handleLobbyLeave };
