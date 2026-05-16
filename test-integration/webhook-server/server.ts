import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

interface WebhookRecord {
  method: string;
  url: string;
  headers: Record<string, string | string[]>;
  body: unknown;
  timestamp: number;
}

export class WebhookTestServer {
  private server: ReturnType<typeof createServer> | null = null;
  readonly records: WebhookRecord[] = [];
  port = 0;

  start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = createServer((req: IncomingMessage, res: ServerResponse) => {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
          try {
            const parsed = body ? JSON.parse(body) : {};
            this.records.push({
              method: req.method ?? 'UNKNOWN',
              url: req.url ?? '/',
              headers: req.headers as Record<string, string | string[]>,
              body: parsed,
              timestamp: Date.now(),
            });
          } catch {
            this.records.push({
              method: req.method ?? 'UNKNOWN',
              url: req.url ?? '/',
              headers: req.headers as Record<string, string | string[]>,
              body: body,
              timestamp: Date.now(),
            });
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        });
      });

      this.server.listen(0, '127.0.0.1', () => {
        const addr = this.server!.address();
        if (addr && typeof addr === 'object') {
          this.port = addr.port;
        }
        console.log(`[WebhookServer] Listening on http://127.0.0.1:${this.port}`);
        resolve();
      });
    });
  }

  getUrl(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
}
