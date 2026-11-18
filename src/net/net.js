// PeerJS P2P 연결 (방장 = 호스트)
import { Peer } from 'peerjs';

const PREFIX = 'trapbuilders-v1-';
const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function makeCode() {
  let s = '';
  for (let i = 0; i < 5; i++) s += ALPH[Math.floor(Math.random() * ALPH.length)];
  return s;
}
export function normCode(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/O/g, '0').slice(0, 5); }

function peerOpts() {
  const o = { debug: 0, config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' }] } };
  try {
    const q = new URLSearchParams(location.search).get('peerserver');
    if (q) { const [host, port] = q.split(':'); Object.assign(o, { host, port: +port || 9000, path: '/', secure: false }); }
  } catch (e) { /* 무시 */ }
  return o;
}

export class HostNet {
  constructor(h) { this.h = h; this.conns = new Map(); this.peer = null; this.code = ''; this.tries = 0; }
  start() {
    return new Promise((resolve, reject) => {
      const attempt = () => {
        this.code = makeCode();
        const peer = new Peer(PREFIX + this.code, peerOpts());
        this.peer = peer;
        let opened = false;
        const to = setTimeout(() => { if (!opened) { peer.destroy(); reject(new Error('서버에 연결할 수 없어요. 인터넷 연결을 확인해 주세요.')); } }, 12000);
        peer.on('open', () => { opened = true; clearTimeout(to); resolve(this.code); });
        peer.on('error', (e) => {
          if (e.type === 'unavailable-id' && this.tries++ < 5) { clearTimeout(to); peer.destroy(); attempt(); return; }
          if (!opened) { clearTimeout(to); reject(new Error(errText(e))); }
          else this.h.onError && this.h.onError(errText(e));
        });
        peer.on('disconnected', () => { if (!peer.destroyed) setTimeout(() => { try { peer.reconnect(); } catch (e) { /* 무시 */ } }, 1000); });
        peer.on('connection', (conn) => this.accept(conn));
      };
      attempt();
    });
  }
  accept(conn) {
    conn.on('data', (m) => {
      if (!m || typeof m !== 'object') return;
      if (conn.pid === undefined) {
        if (m.t === 'hello') {
          const res = this.h.onHello(conn, m);
          if (res && res.reject) { try { conn.send({ t: 'reject', reason: res.reject }); } catch (e) { /* 무시 */ } setTimeout(() => conn.close(), 400); return; }
          conn.pid = res.pid;
          this.conns.set(res.pid, conn);
          conn.send({ t: 'welcome', pid: res.pid });
          this.h.onJoined && this.h.onJoined(res.pid);
        }
        return;
      }
      if (m.t === 'pong') { this.h.onPong && this.h.onPong(conn.pid, performance.now() - m.ts); return; }
      this.h.onMsg(conn.pid, m);
    });
    const gone = () => {
      if (conn.pid !== undefined && this.conns.get(conn.pid) === conn) {
        this.conns.delete(conn.pid);
        this.h.onLeave(conn.pid);
      }
    };
    conn.on('close', gone);
    conn.on('error', gone);
  }
  send(pid, m) {
    const c = this.conns.get(pid);
    if (c && c.open) { try { c.send(m); } catch (e) { /* 무시 */ } }
  }
  broadcast(m, except) {
    for (const [pid, c] of this.conns) if (pid !== except && c.open) { try { c.send(m); } catch (e) { /* 무시 */ } }
  }
  ping() { const ts = performance.now(); this.broadcast({ t: 'ping', ts }); }
  kick(pid) { const c = this.conns.get(pid); if (c) { this.conns.delete(pid); c.close(); } }
  destroy() { for (const c of this.conns.values()) try { c.close(); } catch (e) { /* 무시 */ } this.conns.clear(); if (this.peer) this.peer.destroy(); }
}

export class ClientNet {
  constructor(h) { this.h = h; this.peer = null; this.conn = null; this.pid = -1; this.closed = false; }
  connect(code, hello) {
    return new Promise((resolve, reject) => {
      const peer = new Peer(peerOpts());
      this.peer = peer;
      let done = false;
      const fail = (msg) => { if (done) return; done = true; clearTimeout(to); try { peer.destroy(); } catch (e) { /* 무시 */ } reject(new Error(msg)); };
      const to = setTimeout(() => fail('연결 시간이 초과됐어요. 방 코드와 네트워크를 확인해 주세요.'), 15000);
      peer.on('error', (e) => {
        if (!done) fail(e.type === 'peer-unavailable' ? '방을 찾을 수 없어요. 코드를 확인해 주세요.' : errText(e));
        else if (e.type !== 'peer-unavailable') this.h.onError && this.h.onError(errText(e));
      });
      peer.on('open', () => {
        const conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
        this.conn = conn;
        conn.on('open', () => conn.send(hello));
        conn.on('data', (m) => {
          if (!m || typeof m !== 'object') return;
          if (m.t === 'ping') { conn.send({ t: 'pong', ts: m.ts }); return; }
          if (!done) {
            if (m.t === 'welcome') { done = true; clearTimeout(to); this.pid = m.pid; resolve(m.pid); return; }
            if (m.t === 'reject') { fail(m.reason || '참가할 수 없어요.'); return; }
          }
          this.h.onMsg(m);
        });
        conn.on('close', () => { if (done && !this.closed) { this.closed = true; this.h.onClose(); } });
        conn.on('error', () => { if (!done) fail('연결에 실패했어요. 네트워크 환경 때문에 연결할 수 없을 수 있어요.'); });
      });
    });
  }
  send(m) { if (this.conn && this.conn.open) { try { this.conn.send(m); } catch (e) { /* 무시 */ } } }
  destroy() { this.closed = true; try { if (this.conn) this.conn.close(); } catch (e) { /* 무시 */ } if (this.peer) this.peer.destroy(); }
}

function errText(e) {
  switch (e && e.type) {
    case 'network': case 'server-error': case 'socket-error': case 'socket-closed':
      return '서버에 연결할 수 없어요. 인터넷 연결을 확인해 주세요.';
    case 'browser-incompatible': return '이 브라우저는 온라인 대전을 지원하지 않아요.';
    case 'webrtc': return '네트워크 환경 때문에 연결할 수 없어요. (회사·학교 네트워크에서는 막힐 수 있어요)';
    default: return '연결 중 문제가 생겼어요.';
  }
}
