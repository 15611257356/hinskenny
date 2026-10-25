// 樱花飘落 + 金色闪光，画在一张铺满窗口、不挡点击的 canvas 上。
(() => {
  const canvas = document.getElementById("fx");
  const ctx = canvas.getContext("2d");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let w, h, dpr, petals, sparks;

  const rand = (a, b) => a + Math.random() * (b - a);
  const PETAL_COLORS = ["#ffd1dc", "#ffc0cf", "#f9a8c0", "#ffe4ec"];

  function newPetal(top) {
    return {
      x: rand(0, w),
      y: top ? rand(-h, 0) : rand(0, h),
      r: rand(6, 13),
      vy: rand(0.4, 1.1),
      vx: rand(-0.3, 0.6),
      sway: rand(0.6, 1.6),
      phase: rand(0, Math.PI * 2),
      spin: rand(-0.02, 0.02),
      rot: rand(0, Math.PI * 2),
      flip: rand(0, Math.PI * 2),
      color: PETAL_COLORS[(Math.random() * PETAL_COLORS.length) | 0],
    };
  }

  function newSpark() {
    return { x: rand(0, w), y: rand(0, h), size: rand(1, 2.8), t: rand(0, Math.PI * 2), speed: rand(0.02, 0.06) };
  }

  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    w = innerWidth;
    h = innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const scale = Math.min(1, w / 1200);
    petals = Array.from({ length: Math.round(38 * scale + 12) }, () => newPetal(false));
    sparks = Array.from({ length: Math.round(70 * scale + 20) }, newSpark);
  }

  function drawPetal(p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.scale(1, Math.abs(Math.sin(p.flip)) * 0.6 + 0.4);
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.moveTo(0, -p.r);
    ctx.bezierCurveTo(p.r * 0.9, -p.r * 0.8, p.r * 0.8, p.r * 0.5, 0, p.r);
    ctx.bezierCurveTo(-p.r * 0.8, p.r * 0.5, -p.r * 0.9, -p.r * 0.8, 0, -p.r);
    ctx.fill();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = "#e07a98";
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(0, -p.r * 0.7);
    ctx.lineTo(0, p.r * 0.7);
    ctx.stroke();
    ctx.restore();
  }

  function drawSpark(s) {
    const a = (Math.sin(s.t) + 1) / 2;
    if (a < 0.05) return;
    const len = s.size * (2 + a * 3);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.globalAlpha = a * 0.9;
    ctx.strokeStyle = "#ffe7a8";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-len, 0);
    ctx.lineTo(len, 0);
    ctx.moveTo(0, -len);
    ctx.lineTo(0, len);
    ctx.stroke();
    ctx.fillStyle = "#fff6d6";
    ctx.shadowColor = "#f5c96b";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(0, 0, s.size * a, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function frame() {
    ctx.clearRect(0, 0, w, h);
    for (const s of sparks) {
      s.t += s.speed;
      if (s.t > Math.PI * 2 && Math.random() < 0.01) Object.assign(s, newSpark(), { t: 0 });
      drawSpark(s);
    }
    for (const p of petals) {
      p.phase += 0.01 * p.sway;
      p.x += p.vx + Math.sin(p.phase) * 0.5;
      p.y += p.vy;
      p.rot += p.spin;
      p.flip += 0.03;
      if (p.y > h + 20 || p.x > w + 20 || p.x < -20) Object.assign(p, newPetal(true), { y: -20 });
      drawPetal(p);
    }
    if (!reduce) requestAnimationFrame(frame);
  }

  addEventListener("resize", resize);
  resize();
  frame();
})();
