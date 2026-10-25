const { people, timeline, sugars, photos, sources } = window.SITE;
const credits = Object.fromEntries((window.CREDITS || []).map((c) => [c.file, c]));
const $ = (id) => document.getElementById(id);

const esc = (s = "") =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const bvUrl = (bv) => `https://www.bilibili.com/video/${bv}/`;

const creditLine = (src) => {
  const c = credits[src];
  if (!c) return "";
  return `摄影：${esc(c.author)} · <a href="${c.licenseUrl || c.source}" target="_blank" rel="noopener">${esc(c.license)}</a> · <a href="${c.source}" target="_blank" rel="noopener">Wikimedia Commons</a>`;
};

function player(bv, cover) {
  const inner = cover
    ? `<button data-bv="${bv}" aria-label="播放"><img src="${cover}" alt="" loading="lazy" referrerpolicy="no-referrer" /></button>`
    : `<button data-bv="${bv}" aria-label="播放"><span class="placeholder">点击播放 B 站视频</span></button>`;
  return `<div class="player">${inner}</div>`;
}

document.addEventListener("click", (e) => {
  const btn = e.target.closest(".player button");
  if (!btn) return;
  const iframe = document.createElement("iframe");
  iframe.src = `https://player.bilibili.com/player.html?bvid=${btn.dataset.bv}&autoplay=1&high_quality=1&danmaku=0`;
  iframe.allow = "autoplay; fullscreen";
  iframe.allowFullscreen = true;
  btn.replaceWith(iframe);
});

$("hero-photos").innerHTML = people
  .map((p) => `<figure><img src="${p.photo}" alt="${esc(p.name)}" /><figcaption>${esc(p.en)}</figcaption></figure>`)
  .join("");

$("people-list").innerHTML = people
  .map(
    (p) => `
    <article class="person">
      <img src="${p.photo}" alt="${esc(p.name)}" data-zoom="${p.photo}" />
      <div>
        <h3>${esc(p.name)}</h3>
        <div class="en">${esc(p.en)}</div>
        <div class="nick">${esc(p.nick)}</div>
        <p>${esc(p.intro)}</p>
      </div>
    </article>`
  )
  .join("");

$("timeline").innerHTML = timeline
  .map((t) => {
    const media = [
      t.video ? player(t.video, t.cover || sugars.find((s) => s.video === t.video)?.cover) : "",
      t.photo ? `<img src="${t.photo}" alt="" loading="lazy" data-zoom="${t.photo}" />` : "",
    ].join("");
    const src = t.source ? `<p class="src">出处：<a href="${t.source.url}" target="_blank" rel="noopener">${esc(t.source.label)}</a></p>` : "";
    return `
    <li class="tl-item">
      <div class="tl-year">${esc(t.year)}</div>
      <div class="tl-body">
        <h3>${esc(t.title)}</h3>
        <p>${esc(t.text)}</p>
        ${src}
        ${media.trim() ? `<div class="tl-media">${media}</div>` : ""}
      </div>
    </li>`;
  })
  .join("");

$("sugars").innerHTML = sugars
  .map(
    (s) => `
    <article class="sugar">
      ${player(s.video, s.cover)}
      <h3>${esc(s.title)}</h3>
      <span class="tag">${esc(s.tag)}</span>
      <p>${esc(s.story)}</p>
      <div class="by">视频：<a href="${bvUrl(s.video)}" target="_blank" rel="noopener">${esc(s.by)} @ B站</a></div>
    </article>`
  )
  .join("");

$("gallery-grid").innerHTML = photos
  .map(
    (p) => `
    <figure data-zoom="${p.src}">
      <img src="${p.src}" alt="${esc(p.caption)}" loading="lazy" />
      <figcaption>${esc(p.caption)}</figcaption>
    </figure>`
  )
  .join("");

$("source-list").innerHTML = sources
  .map((s) => `<li><a href="${s.url}" target="_blank" rel="noopener">${esc(s.label)}</a></li>`)
  .join("");

$("credit-list").innerHTML = (window.CREDITS || [])
  .map(
    (c) =>
      `<li><a href="${c.source}" target="_blank" rel="noopener">${esc(c.title)}</a> — ${esc(c.author)}，<a href="${c.licenseUrl || c.source}" target="_blank" rel="noopener">${esc(c.license)}</a></li>`
  )
  .join("");

const lb = $("lightbox");
const captionFor = (src) => photos.find((p) => p.src === src)?.caption || "";

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-zoom]");
  if (!el) return;
  const src = el.dataset.zoom;
  lb.querySelector("img").src = src;
  lb.querySelector(".lb-caption").innerHTML = [esc(captionFor(src)), creditLine(src)].filter(Boolean).join("<br>");
  lb.hidden = false;
});

lb.addEventListener("click", (e) => {
  if (e.target === lb || e.target.classList.contains("close")) lb.hidden = true;
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") lb.hidden = true;
});
