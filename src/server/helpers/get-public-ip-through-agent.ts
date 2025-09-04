// src/get-public-ip.ts
import https from 'node:https';
import type { Agent as HttpAgent } from 'node:http';
import type { Agent as HttpsAgent } from 'node:https';

const CANDIDATES = ['https://api.ipify.org?format=text', 'https://ifconfig.me/ip'];

export async function getPublicIpThroughAgent(agent?: HttpAgent | HttpsAgent, timeoutMs = 8000): Promise<string | null> {
  for (const raw of CANDIDATES) {
    const url = new URL(raw);

    const ip = await new Promise<string | null>((resolve) => {
      const req = https.request(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          path: url.pathname + url.search,
          method: 'GET',
          agent, // <<< TUNNELS VIA YOUR PROXY AGENT
          timeout: timeoutMs,
        },
        (res) => {
          let data = '';
          res.setEncoding('utf8');
          res.on('data', (c) => (data += c));
          res.on('end', () => {
            const text = (data || '').trim();
            if (/^\d{1,3}(\.\d{1,3}){3}$/.test(text) || text.includes(':')) {
              resolve(text); // IPv4 or IPv6
            } else {
              resolve(null);
            }
          });
        }
      );
      req.on('error', () => resolve(null));
      req.on('timeout', () => {
        try {
          req.destroy();
        } catch {
          resolve(null);
        }
      });
      req.end();
    });

    if (ip) return ip;
  }
  return null;
}
