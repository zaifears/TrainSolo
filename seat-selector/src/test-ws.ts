async function testWs() {
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/96D7217765DA7E60381C7691F3CDE9A2');
  
  ws.onopen = () => {
    console.log('WS Open to Page!');
    ws.send(JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: { expression: 'document.title' }
    }));
  };

  ws.onmessage = (event) => {
    console.log('WS Message:', event.data);
    ws.close();
  };

  ws.onerror = (err) => {
    console.error('WS Error:', err);
  };
}

testWs();
