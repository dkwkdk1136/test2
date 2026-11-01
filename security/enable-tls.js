// Configuration only. This command never starts or restarts a process.
const fs = require('node:fs');
const path = require('node:path');
const { loadServerTransport } = require('./tls-transport');
const root = path.resolve(__dirname, '..');
const filename = path.join(root, 'config/server.json');
const config = fs.existsSync(filename) ? JSON.parse(fs.readFileSync(filename, 'utf8')) : {};
config.tls = { enabled: true, authPort: 19211, gamePort: 40907, keyFile: 'certs/server.key', certFile: 'certs/server.crt' };
loadServerTransport(config, root);
fs.mkdirSync(path.dirname(filename), { recursive: true });
if (fs.existsSync(filename)) fs.copyFileSync(filename, `${filename}.${Date.now()}.bak`, fs.constants.COPYFILE_EXCL);
const temporary = `${filename}.${process.pid}.tmp`;
fs.writeFileSync(temporary, JSON.stringify(config, null, 2) + '\n', { flag: 'wx' });
fs.renameSync(temporary, filename);
console.log('TLS configuration saved. No process was started. Start the server manually when ready.');
