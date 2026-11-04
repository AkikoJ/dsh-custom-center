import { afterEach, describe, expect, it } from 'vitest'
import { McpClient } from '../../src/douyin/server/mcp.js'

const clients: McpClient[] = []
function peer(mode = '') {
  const script = `
    const readline=require('node:readline');
    if(${JSON.stringify(mode)}==='slow-stop')process.on('SIGTERM',()=>setTimeout(()=>process.exit(0),60));
    let initialized=false;
    let output=Promise.resolve();
    readline.createInterface({input:process.stdin}).on('line',line=>{
      const m=JSON.parse(line);
      if(m.method==='notifications/initialized'){initialized=true;return}
      if(m.method==='initialize') {
        if(${JSON.stringify(mode)}==='hang-init')return;
        process.stdout.write('peer startup log\\nnull\\n');
        process.stdout.write(JSON.stringify({id:m.id,result:{protocolVersion:'2024-11-05'}})+'\\n');return;
      }
      if(m.params.name==='pid'){process.stdout.write(JSON.stringify({id:m.id,result:{content:[{text:JSON.stringify({pid:process.pid})}]}})+'\\n');return}
      if(m.params.name==='hang')return;
      if(m.params.name==='exit'){process.exit(3);return}
      const text=m.params.name==='text'?'plain text':JSON.stringify({ok:true,initialized,args:m.params.arguments});
      const result={content:[{type:'text',text}],isError:m.params.name==='fail'};
      const response=JSON.stringify({id:m.id,result})+'\\n';
      output=output.then(()=>new Promise(done=>{
        process.stdout.write(response.slice(0,5));
        setTimeout(()=>{process.stdout.write(response.slice(5));done()},5);
      }));
    });
  `
  const client = new McpClient({ command: process.execPath, args: ['-e', script], env: { ...process.env }, identity: { name: 'test-peer', version: '1.0.0' }, initializeTimeoutMs: mode === 'hang-init' ? 40 : 1000 })
  clients.push(client)
  return client
}
afterEach(async () => { await Promise.all(clients.splice(0).map((client) => client.stop())) })

describe('MCP lifecycle and line framing', () => {
  it('initializes once for concurrent calls and parses fragmented/noisy frames', async () => {
    const client = peer()
    const results = await Promise.all([client.call('one', { n: 1 }), client.call('two', { n: 2 })])
    expect(results).toEqual([
      { ok: true, initialized: true, args: { n: 1 } }, { ok: true, initialized: true, args: { n: 2 } },
    ])
    expect(await client.call('text')).toBe('plain text')
    await expect(client.call('fail')).rejects.toThrow('ok')
  })
  it('rejects pending requests on stop and can start a fresh generation', async () => {
    const client = peer()
    await client.start()
    const pending = client.call('hang')
    const rejected = expect(pending).rejects.toThrow('停止')
    await new Promise<void>((resolve) => setImmediate(resolve))
    client.stop()
    await rejected
    expect(client.running).toBe(false)
    expect(await client.call('again')).toMatchObject({ ok: true })
  })
  it('keeps cancellation and timeout pending until the owned process has closed', async () => {
    for (const cancel of [true, false]) {
      const client = peer('slow-stop'), abort = new AbortController()
      const { pid } = await client.call<{ pid: number }>('pid')
      const pending = client.call('hang', {}, { signal: abort.signal, timeoutMs: cancel ? 1000 : 20 })
      const rejected = expect(pending).rejects.toThrow(cancel ? '取消' : '超时')
      if (cancel) { await new Promise<void>((resolve) => setImmediate(resolve)); abort.abort() }
      await rejected
      expect(() => process.kill(pid, 0)).toThrow()
      expect(client.running).toBe(false)
    }
  })
  it('does not start a process for an already aborted call', async () => {
    const client = peer(), abort = new AbortController(); abort.abort()
    await expect(client.call('hang', {}, { signal: abort.signal })).rejects.toThrow()
    expect(client.running).toBe(false)
  })
  it('bounds initialization and tool timeouts and handles process exit', async () => {
    await expect(peer('hang-init').start()).rejects.toThrow('超时')
    const client = peer()
    await expect(client.call('hang', {}, { timeoutMs: 20 })).rejects.toThrow('超时')
    await expect(client.call('exit')).rejects.toThrow('退出')
  })
})
