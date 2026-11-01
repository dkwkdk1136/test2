'use strict';
const serverConfig = require('../config/server');
const SN_SERVER_ADD = 0x220101;
const SN_CHANNEL_ADD = 0x220102;
function sendGateInfo(client) {
        // SN_SERVER_ADD
        {
            const [msg, body] = client.getMessageBuffer(SN_SERVER_ADD, 0x2 + 0xd2);
            body[0] = 0x00;
            body[1] = 0x01;

            let offset = 0x2;
            body.write('Dev0', offset + 0x0);

            body.write(serverConfig.getPublicHost(), offset + 0x5);
            body.write('MO_Server_1', offset + 0x15);
            body.write('GS', offset + 0xad);

            body.writeUint32LE(3, offset + 0xB0);
            body.writeUint16LE(30907, offset + 0xB8);
            body.writeUint16LE(128, offset + 0xBA);
            body.writeUint32LE(1, offset + 0xCC);
            body.writeUint16LE(0, offset + 0xD0);

            client.send(msg);
        }

        // SN_CHANNEL_ADD
        {
            const [msg, body] = client.getMessageBuffer(SN_CHANNEL_ADD, 0x2 + 0x5 + 0x37);
            body[0] = 0x00;
            body[1] = 0x01;

            body.write('Dev0', 0x2);
            let offset = 0x2 + 0x5;

            body[offset] = 1;
            body.writeUint16LE(0, offset + 0x1);
            body.writeUint16LE(128, offset + 0x3);
            body.writeUint32LE(1024, offset + 0x11);
            body[offset + 0x15] = 0;
            body[offset + 0x1a] = 1;
            body.write('MO_Server_1', offset + 0x1e);

            client.send(msg);
        }
}
module.exports = { sendGateInfo };
