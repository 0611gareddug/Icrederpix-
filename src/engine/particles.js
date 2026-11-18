// 파티클 (재사용 풀)
const N = 700;
export class Particles {
  constructor() {
    this.x = new Float32Array(N); this.y = new Float32Array(N);
    this.vx = new Float32Array(N); this.vy = new Float32Array(N);
    this.life = new Float32Array(N); this.max = new Float32Array(N);
    this.g = new Float32Array(N); this.size = new Uint8Array(N);
    this.col = new Array(N).fill('#fff');
    this.shape = new Uint8Array(N); // 0 사각, 1 하트, 2 별, 3 왕관
    this.n = 0; this.head = 0;
  }
  spawn(x, y, vx, vy, life, col, size = 1, g = 0, shape = 0) {
    const i = this.head;
    this.head = (this.head + 1) % N;
    this.x[i] = x; this.y[i] = y; this.vx[i] = vx; this.vy[i] = vy;
    this.life[i] = life; this.max[i] = life; this.col[i] = col; this.size[i] = size; this.g[i] = g; this.shape[i] = shape;
  }
  burst(x, y, n, col, speed, life, size = 1, g = 300, shape = 0) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.7);
      this.spawn(x, y, Math.cos(a) * s, Math.sin(a) * s - speed * 0.3, life * (0.6 + Math.random() * 0.6), Array.isArray(col) ? col[k % col.length] : col, size, g, shape);
    }
  }
  dust(x, y, n = 4, col = '#ffffffaa') {
    for (let k = 0; k < n; k++) this.spawn(x + (Math.random() - 0.5) * 8, y - 1, (Math.random() - 0.5) * 40, -Math.random() * 25, 0.3 + Math.random() * 0.2, col, 2, 40);
  }
  update(dt) {
    for (let i = 0; i < N; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      this.vy[i] += this.g[i] * dt;
      this.x[i] += this.vx[i] * dt; this.y[i] += this.vy[i] * dt;
    }
  }
  draw(ctx, vx0, vy0, vx1, vy1) {
    for (let i = 0; i < N; i++) {
      if (this.life[i] <= 0) continue;
      const x = this.x[i], y = this.y[i];
      if (x < vx0 - 8 || x > vx1 + 8 || y < vy0 - 8 || y > vy1 + 8) continue;
      const a = this.life[i] / this.max[i];
      ctx.globalAlpha = a < 0.3 ? a / 0.3 : 1;
      ctx.fillStyle = this.col[i];
      const s = this.size[i];
      const sh = this.shape[i];
      const X = Math.round(x), Y = Math.round(y);
      if (sh === 1) { ctx.fillRect(X - 2, Y - 1, 2, 2); ctx.fillRect(X + 1, Y - 1, 2, 2); ctx.fillRect(X - 1, Y, 3, 2); ctx.fillRect(X, Y + 2, 1, 1); }
      else if (sh === 2) { ctx.fillRect(X - 2, Y, 5, 1); ctx.fillRect(X, Y - 2, 1, 5); ctx.fillRect(X - 1, Y - 1, 3, 3); }
      else if (sh === 3) { ctx.fillRect(X - 2, Y, 5, 2); ctx.fillRect(X - 2, Y - 2, 1, 2); ctx.fillRect(X, Y - 2, 1, 2); ctx.fillRect(X + 2, Y - 2, 1, 2); }
      else ctx.fillRect(X - (s >> 1), Y - (s >> 1), s, s);
    }
    ctx.globalAlpha = 1;
  }
  clear() { this.life.fill(0); }
}
