async function testBrowserWs() {
  const versionRes = await fetch('http://127.0.0.1:9222/json/version');
  const version = await versionRes.json();
  console.log('Browser WS URL:', version.webSocketDebuggerUrl);

  const ws = new WebSocket(version.webSocketDebuggerUrl);
  
  ws.onopen = () => {
    console.log('Browser WS Connected!');
    ws.send(JSON.stringify({
      id: 1,
      method: 'Target.getTargets'
    }));
  };

  ws.onmessage = (event) => {
    console.log('Browser WS Message received!');
    const data = JSON.parse(event.data);
    console.log('Target count:', data.result?.targetInfos?.length);
    ws.close();
  };

  ws.onerror = (err) => {
    console.error('Browser WS Error:', err);
  };
}

testBrowserWs();
