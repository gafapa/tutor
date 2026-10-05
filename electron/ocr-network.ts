/** OCR receives local bytes only. Block accidental outbound traffic in both worker contexts. */
export function denyOcrNetwork() {
  const blocked = () => { throw new Error('El reconocimiento local no permite conexiones de red.'); };
  globalThis.fetch = async () => { throw new Error('El reconocimiento local no permite conexiones de red.'); };
  const http = require('node:http'), https = require('node:https'), net = require('node:net'), tls = require('node:tls');
  http.request = blocked; http.get = blocked; https.request = blocked; https.get = blocked;
  net.connect = blocked; net.createConnection = blocked; net.Socket.prototype.connect = blocked; tls.connect = blocked;
}
