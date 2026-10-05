export class DirectCdpPage {
  private ws: WebSocket;
  private messageId = 1;
  private pending = new Map<number, { resolve: (val: any) => void; reject: (err: any) => void }>();

  private constructor(ws: WebSocket) {
    this.ws = ws;
    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data.toString());
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id)!;
          this.pending.delete(msg.id);
          if (msg.error) {
            reject(new Error(msg.error.message || JSON.stringify(msg.error)));
          } else {
            resolve(msg.result);
          }
        }
      } catch (err) {
        // ignore parse errors
      }
    };
  }

  public static async connect(cdpPort = 9222): Promise<DirectCdpPage> {
    const res = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
    const pages = await res.json();
    const railwayTabs = pages.filter((p: any) => p.type === 'page' && p.url && p.url.includes('eticket.railway.gov.bd'));
    // Prefer a tab already inside the booking flow over a home/login tab.
    const railway = railwayTabs.find((p: any) => p.url.includes('/booking/')) || railwayTabs[0];
    if (!railway || !railway.webSocketDebuggerUrl) {
      throw new Error('No Bangladesh Railway tab found at http://127.0.0.1:' + cdpPort + '. Open eticket.railway.gov.bd in Brave first.');
    }

    // Automatically bring the railway tab to foreground to wake up Chromium's background throttling
    await fetch(`http://127.0.0.1:${cdpPort}/json/activate/${railway.id}`).catch(() => {});

    const ws = new WebSocket(railway.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out opening CDP WebSocket to railway tab')), 5000);
      ws.onopen = () => { clearTimeout(timer); resolve(); };
      ws.onerror = () => { clearTimeout(timer); reject(new Error('WebSocket connection error to railway tab')); };
    });

    return new DirectCdpPage(ws);
  }

  public async send(method: string, params: Record<string, any> = {}): Promise<any> {
    const id = this.messageId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP ${method} timed out`));
      }, 30000);
      this.pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  public async evaluate<T = any>(exprOrFn: string | ((...args: any[]) => any), ...args: any[]): Promise<T> {
    // tsx/esbuild may wrap named inner functions in __name(...); define a no-op so they run in the page.
    const shim = 'var __name = globalThis.__name || ((f) => f);';
    const expression = typeof exprOrFn === 'function'
      ? `(() => { ${shim} return (${exprOrFn.toString()})(${args.map(a => JSON.stringify(a)).join(',')}); })()`
      : exprOrFn;

    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });

    if (res?.exceptionDetails) {
      throw new Error('CDP Evaluate Exception: ' + (res.exceptionDetails.exception?.description || res.exceptionDetails.text));
    }

    return res?.result?.value;
  }

  public async waitForFunction(fn: (...args: any[]) => boolean, arg?: any, timeout = 10000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const ok = await this.evaluate(fn, arg).catch(() => false);
      if (ok) return;
      await new Promise(r => setTimeout(r, 50));
    }
    throw new Error(`Timeout waiting for function after ${timeout}ms`);
  }

  public async close(): Promise<void> {
    this.ws.close();
  }
}
