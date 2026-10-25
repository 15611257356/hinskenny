// 背景音乐小播放器。浏览器不允许无交互自动放声音，所以由开场“进入”按钮触发第一次播放。
(() => {
  const tracks = window.SITE.music || [];
  const music = document.getElementById("music");
  const frame = document.getElementById("music-frame");
  const note = document.getElementById("music-note");
  const tabs = document.getElementById("music-tabs");
  const intro = document.getElementById("intro");
  let current = 0;
  let playing = false;

  const embedUrl = (t) =>
    t.bv
      ? `https://player.bilibili.com/player.html?bvid=${t.bv}&autoplay=1&danmaku=0&high_quality=1`
      : `https://www.youtube-nocookie.com/embed/${t.youtube}?autoplay=1&loop=1&playlist=${t.youtube}`;

  tabs.innerHTML = tracks.map((t, i) => `<button data-i="${i}">${t.label}</button>`).join("");

  function render() {
    tabs.querySelectorAll("button").forEach((b, i) => b.classList.toggle("on", i === current));
    const t = tracks[current];
    note.innerHTML = `${t.note} · <a href="${t.source}" target="_blank" rel="noopener">出处</a>`;
  }

  function play(i = current) {
    current = i;
    const iframe = document.createElement("iframe");
    iframe.src = embedUrl(tracks[i]);
    iframe.allow = "autoplay; fullscreen; encrypted-media";
    iframe.allowFullscreen = true;
    frame.replaceChildren(iframe);
    playing = true;
    music.classList.add("playing");
    render();
  }

  function stop() {
    frame.replaceChildren();
    playing = false;
    music.classList.remove("playing");
  }

  function close() {
    intro.classList.add("gone");
    setTimeout(() => intro.remove(), 900);
  }

  document.getElementById("intro-enter").addEventListener("click", () => {
    play(0);
    music.classList.add("open");
    close();
  });
  document.getElementById("intro-quiet").addEventListener("click", close);

  document.getElementById("music-toggle").addEventListener("click", () => {
    if (!music.classList.contains("open")) {
      music.classList.add("open");
      if (!playing) play();
    } else if (playing) {
      stop();
    } else {
      play();
    }
  });
  document.getElementById("music-min").addEventListener("click", () => music.classList.remove("open"));
  tabs.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (b) play(Number(b.dataset.i));
  });

  // 页面里的糖点视频开始播放时，先停背景音乐，免得两个声音叠在一起。
  document.addEventListener(
    "click",
    (e) => {
      if (e.target.closest(".player button") && playing) stop();
    },
    true
  );

  render();
})();
