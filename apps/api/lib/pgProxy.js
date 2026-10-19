const net = require('net');
const os = require('os');

let proxyServers = [];

function startPgProxy(targetPort = 5432, targetHost = '127.0.0.1') {
  for (const s of proxyServers) {
    try { s.close(); } catch (_) {}
  }
  proxyServers = [];

  function createProxyHandler() {
    return (clientSocket) => {
      clientSocket.setNoDelay(true);
      const targetSocket = net.connect({ port: targetPort, host: targetHost }, () => {
        targetSocket.setNoDelay(true);
        clientSocket.pipe(targetSocket);
        targetSocket.pipe(clientSocket);
      });

      clientSocket.on('error', () => {
        targetSocket.destroy();
      });
      targetSocket.on('error', () => {
        clientSocket.destroy();
      });
      clientSocket.on('close', () => targetSocket.destroy());
      targetSocket.on('close', () => clientSocket.destroy());
    };
  }

  const interfaces = os.networkInterfaces();
  const externalIps = [];
  for (const name of Object.keys(interfaces)) {
    for (const netInfo of interfaces[name]) {
      if (netInfo.family === 'IPv4' && !netInfo.internal) {
        externalIps.push(netInfo.address);
      }
    }
  }

  // Tenta primeiro abrir em 0.0.0.0
  try {
    const wildcardServer = net.createServer(createProxyHandler());
    wildcardServer.on('error', (err) => {
      console.warn('[pgProxy] Listener 0.0.0.0 aviso:', err.message);
    });
    wildcardServer.listen(targetPort, '0.0.0.0', () => {
      console.log(`[pgProxy] PostgreSQL escutando em 0.0.0.0:${targetPort} -> ${targetHost}:${targetPort}`);
    });
    proxyServers.push(wildcardServer);
  } catch (err) {
    console.warn('[pgProxy] Erro 0.0.0.0:', err.message);
  }

  // Escuta em cada IP externo especifico (ex: IP local da LAN, IP Tailscale)
  for (const ip of externalIps) {
    try {
      const server = net.createServer(createProxyHandler());
      server.on('error', (err) => {
        console.warn(`[pgProxy] Listener ${ip} aviso:`, err.message);
      });
      server.listen(targetPort, ip, () => {
        console.log(`[pgProxy] PostgreSQL exposto na interface ${ip}:${targetPort} -> ${targetHost}:${targetPort}`);
      });
      proxyServers.push(server);
    } catch (err) {
      console.warn(`[pgProxy] Erro listener ${ip}:`, err.message);
    }
  }
}

module.exports = { startPgProxy };
