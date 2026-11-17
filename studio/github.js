(function () {
  "use strict";
  const REPO = "15611257356/hinskenny";
  const BASE = "hinskenny-site";
  const PREFIX = "studio/content-update-";
  const KEY = `hinskenny-studio:${REPO}:${BASE}:v1`;
  const encode = (s) => s.split("/").map(encodeURIComponent).join("/");
  const json = (v) => JSON.stringify(v, null, 2) + "\n";
  const decode = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g, "")), c => c.charCodeAt(0)));
  const clean = (v) => Array.isArray(v) ? v.map(clean) : v && typeof v === "object"
    ? Object.fromEntries(Object.entries(v).filter(([k, x]) => k !== "_status" && x !== "" && x !== null).map(([k, x]) => [k, clean(x)])) : v;
  function publicData(site, credits) {
    const published = (items) => items.filter(x => (x._status || "published") === "published");
    return { site: clean(Object.fromEntries(Object.entries(site).map(([k, v]) => [k, Array.isArray(v) ? published(v) : v]))), credits: clean(published(credits)) };
  }
  function validate(site, credits, paths) {
    const issues = []; let checked = 0;
    const issue = (level, location, message) => issues.push({ level, location, message });
    const ids = new Set();
    for (const [key, schema] of Object.entries(window.STUDIO_SCHEMAS.MODULES)) {
      if (schema.virtual) continue;
      const items = key === "credits" ? credits : site?.[schema.collection];
      if (!Array.isArray(items)) { issue("error", schema.label, "数据必须是数组"); continue; }
      for (const item of items) {
        checked++;
        if (!item || typeof item !== "object" || Array.isArray(item)) { issue("error", schema.label, "条目格式错误"); continue; }
        const status = item._status || "published";
        const level = status === "published" ? "error" : "warning";
        const location = `${schema.label} · ${item[schema.titlePath] || item.id || "未命名"}`;
        if (!["draft", "published", "archived"].includes(status)) issue("error", location, "无效内容状态");
        if (!/^[a-z0-9][a-z0-9-]*$/.test(item.id || "")) issue(level, location, "唯一 ID 格式错误");
        if (ids.has(item.id)) issue("error", location, "唯一 ID 重复");
        ids.add(item.id);
        for (const field of schema.groups.flatMap(g => g.fields)) {
          const value = field.path.split(".").reduce((v, k) => v?.[k], item);
          if (value != null && typeof value !== "string") { issue("error", location, `${field.label}必须是文本`); continue; }
          if (status !== "archived" && field.required && !value?.trim()) issue(level, location, `缺少${field.label}`);
          if (!value) continue;
          if (field.pattern && !new RegExp(field.pattern).test(value)) issue(level, location, `${field.label}格式错误`);
          if (field.type === "url" && (!/^https?:\/\//i.test(value) || /[\s"'<>`]/.test(value))) issue("error", location, `${field.label}需要有效的 HTTP(S) 地址`);
          if (field.type === "asset") {
            if (/^https?:\/\//i.test(value)) {
              if (/[\s"'<>`]/.test(value)) issue("error", location, "图片地址格式错误");
            } else if (!/^images\/[\w./-]+$/.test(value) || value.split("/").includes("..") || (paths && !paths.has(value))) issue("error", location, `找不到有效图片：${value}`);
          }
        }
        if (key === "timeline" && status === "published" && !item.source?.url) issue("warning", location, "尚未填写可核验的原始出处");
        if (key === "music" && status === "published" && Boolean(item.bv) === Boolean(item.youtube)) issue("error", location, "B 站与 YouTube 必须选择其中一个");
        if (key === "music" && item.youtube && !/^[\w-]+$/.test(item.youtube)) issue("error", location, "YouTube ID 格式错误");
        if (key === "photos" && status !== "archived" && item.creditId && !credits?.some(c => c.id === item.creditId && (status !== "published" || (c._status || "published") === "published"))) issue(level, location, "找不到可发布的版权记录");
      }
    }
    return { checked, issues };
  }
  class GitHubStore {
    #token = "";
    constructor() { this.baseSha = null; this.head = null; this.branch = null; this.pr = null; this.files = []; this.uploads = {}; this.busy = false; }
    get connected() { return Boolean(this.#token); }
    async api(path, method = "GET", body) {
      if (!this.#token) throw new Error("请先连接 GitHub");
      const response = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
        method, cache: "no-store", redirect: "error", credentials: "omit",
        headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${this.#token}`, "X-GitHub-Api-Version": "2022-11-28", ...(body ? { "Content-Type": "application/json" } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (!response.ok) {
        const message = { 401: "Token 无效或已过期", 403: "权限不足或 API 额度受限，请检查 Contents 与 Pull requests 读写权限", 404: "仓库、分支或文件不存在，或 Token 未授权该仓库", 409: "远端版本冲突，请保存设备草稿后重新载入", 422: "GitHub 拒绝本次更新，请检查分支状态后重试" }[response.status];
        throw new Error(message || `GitHub 请求失败（${response.status}）`);
      }
      return response.json();
    }
    async connect(token) {
      this.#token = token.trim();
      try { await this.api(""); } catch (error) { this.#token = ""; throw error; }
    }
    disconnect() { this.#token = ""; }
    async ref(branch) { return (await this.api(`/git/ref/heads/${encode(branch)}`)).object.sha; }
    async readFile(path, sha) {
      const blob = await this.api(`/contents/${encode(path)}?ref=${sha}`);
      if (blob.encoding !== "base64") throw new Error("内容文件过大或格式不支持");
      return JSON.parse(decode(blob.content));
    }
    async load() {
      const sha = await this.ref(BASE);
      const commit = await this.api(`/git/commits/${sha}`);
      const [site, credits, tree] = await Promise.all([
        this.readFile("studio/content/site.json", sha), this.readFile("studio/content/credits.json", sha), this.api(`/git/trees/${commit.tree.sha}?recursive=1`),
      ]);
      if (tree.truncated) throw new Error("仓库文件清单不完整，暂不能编辑");
      if (!site || !Array.isArray(credits) || Object.values(window.STUDIO_SCHEMAS.MODULES).some(s => !s.virtual && s.collection !== "credits" && !Array.isArray(site[s.collection]))) throw new Error("仓库内容格式错误");
      this.baseSha = sha; this.head = sha; this.branch = null; this.pr = null;
      this.files = tree.tree.filter(f => f.type === "blob").map(f => ({ path: f.path, size: f.size }));
      this.uploads = {};
      return { site, credits, assets: this.assets(site, credits) };
    }
    assets(site, credits) {
      const usage = new Map();
      const add = (path, label) => { if (path) usage.set(path, [...(usage.get(path) || []), label]); };
      for (const [key, items] of Object.entries({ ...site, credits })) if (Array.isArray(items)) for (const item of items) {
        for (const field of ["photo", "src", "cover", "file"]) add(item[field], `${key}：${item.title || item.name || item.caption || item.id}`);
      }
      const paths = new Set([...this.files.map(f => f.path).filter(p => /^images\/.+\.(png|jpe?g|webp|gif)$/i.test(p)), ...Object.keys(this.uploads), ...usage.keys()]);
      return [...paths].map(path => ({ id: path, path, label: path.split("/").pop(), kind: this.uploads[path] ? "待提交图片" : /^https?:/.test(path) ? "远程图片" : "仓库图片", sizeLabel: this.uploads[path] ? `${Math.ceil(this.uploads[path].size / 1024)} KB` : "—", usedBy: (usage.get(path) || []).join("；") }));
    }
    assetUrl(path) {
      if (this.uploads[path]) return this.uploads[path].dataUrl;
      if (/^https?:\/\//i.test(path)) return path;
      return `https://raw.githubusercontent.com/${REPO}/${this.head}/${encode(path)}`;
    }
    async upload(file) {
      if (file.size > 5 * 1024 * 1024) throw new Error("线上模式单张图片最多 5 MB");
      if (Object.values(this.uploads).reduce((n, f) => n + f.size, 0) + file.size > 15 * 1024 * 1024) throw new Error("一批图片最多 15 MB，请先提交当前批次");
      const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" }[file.type];
      if (!ext) throw new Error("仅支持 JPEG、PNG、WebP、GIF 图片");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const magic = ext === "jpg" ? bytes[0] === 255 && bytes[1] === 216 : ext === "png" ? bytes.slice(0, 8).join() === "137,80,78,71,13,10,26,10" : ext === "gif" ? new TextDecoder().decode(bytes.slice(0, 6)).match(/^GIF8[79]a$/) : new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
      if (!magic) throw new Error("文件内容与图片类型不符");
      const path = `images/studio-${crypto.randomUUID()}.${ext}`;
      const dataUrl = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(new Error("图片读取失败")); r.readAsDataURL(file); });
      this.uploads[path] = { dataUrl, size: file.size };
      return path;
    }
    validate(site, credits) { return validate(site, credits, new Set([...this.files.map(f => f.path), ...Object.keys(this.uploads)])); }
    saveDraft(site, credits) {
      // Explicit allowlist: credentials never enter persistent storage.
      const draft = { site, credits, baseSha: this.baseSha, head: this.head, branch: this.branch, pr: this.pr, files: this.files, uploads: this.uploads, savedAt: new Date().toISOString() };
      try { localStorage.setItem(KEY, JSON.stringify(draft)); } catch { throw new Error("设备存储空间不足，草稿未保存。请保持页面开启并提交 GitHub"); }
    }
    draft() { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; } }
    restore(draft) {
      if (!draft?.site || !Array.isArray(draft.credits) || !draft.baseSha || (draft.branch && !draft.branch.startsWith(PREFIX))) throw new Error("设备草稿格式错误");
      for (const key of ["baseSha", "head", "branch", "pr", "files", "uploads"]) this[key] = draft[key];
      return { site: draft.site, credits: draft.credits, assets: this.assets(draft.site, draft.credits) };
    }
    async submit(site, credits) {
      if (this.busy) throw new Error("正在提交，请稍候");
      this.busy = true;
      try {
        if (!this.baseSha) throw new Error("请先读取 GitHub 内容");
        if (this.validate(site, credits).issues.some(i => i.level === "error")) throw new Error("请先修复内容校验错误");
        if (await this.ref(BASE) !== this.baseSha) throw new Error("部署分支已更新。请保留设备草稿，重新载入最新内容后整理修改再提交");
        if (this.branch && !this.branch.startsWith(PREFIX)) throw new Error("只允许写入内容更新分支");
        if (this.pr) {
          const pr = await this.api(`/pulls/${this.pr.number}`);
          if (pr.state !== "open") throw new Error("此 PR 已关闭或合并，请重新载入最新内容后开始下一批编辑");
        }
        if (this.branch && await this.ref(this.branch) !== this.head) throw new Error("待审核分支已被更新，请勿覆盖；保留设备草稿并在 GitHub 检查差异");
        const parent = await this.api(`/git/commits/${this.head}`);
        const data = publicData(site, credits);
        const tree = [
          ["studio/content/site.json", json(site)], ["studio/content/credits.json", json(credits)],
          ["data.js", `// 由内容工作台生成。\nwindow.SITE = ${json(data.site).trim()};\n`],
          ["credits.js", `// 由内容工作台生成。\nwindow.CREDITS = ${json(data.credits).trim()};\n`],
        ].map(([path, content]) => ({ path, mode: "100644", type: "blob", content }));
        for (const [path, file] of Object.entries(this.uploads)) {
          if (!/^images\/studio-[a-f0-9-]+\.(jpg|png|webp|gif)$/.test(path)) throw new Error("图片目标路径无效");
          const blob = await this.api("/git/blobs", "POST", { content: file.dataUrl.split(",")[1], encoding: "base64" });
          tree.push({ path, mode: "100644", type: "blob", sha: blob.sha });
        }
        const nextTree = await this.api("/git/trees", "POST", { base_tree: parent.tree.sha, tree });
        if (nextTree.sha !== parent.tree.sha) {
          const commit = await this.api("/git/commits", "POST", { message: "content: update studio materials", tree: nextTree.sha, parents: [this.head] });
          if (await this.ref(BASE) !== this.baseSha) throw new Error("提交期间部署分支发生变化，请重新载入后处理");
          if (!this.branch) {
            this.branch = `${PREFIX}${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 8)}`;
            try { await this.api("/git/refs", "POST", { ref: `refs/heads/${this.branch}`, sha: commit.sha }); }
            catch (error) {
              // A response can be lost after GitHub accepted the write.
              if (await this.ref(this.branch).catch(() => null) !== commit.sha) { this.branch = null; throw error; }
            }
          } else {
            try { await this.api(`/git/refs/heads/${encode(this.branch)}`, "PATCH", { sha: commit.sha, force: false }); }
            catch (error) { if (await this.ref(this.branch).catch(() => null) !== commit.sha) throw error; }
          }
          this.head = commit.sha;
          this.saveDraft(site, credits);
        }
        if (!this.branch) throw new Error("没有需要提交的内容变化");
        // Retry finds an already-created PR instead of making duplicates.
        const prs = await this.api(`/pulls?state=open&base=${encodeURIComponent(BASE)}&head=${encodeURIComponent(REPO.split("/")[0] + ":" + this.branch)}`);
        const pr = prs[0] || await this.api("/pulls", "POST", { title: `内容更新 · ${new Date().toISOString().slice(0, 10)}`, head: this.branch, base: BASE, body: "由 HinsKenny 内容工作台提交。\n\n请检查内容 JSON、图片和生成的 data.js / credits.js，确认后手动合并。草稿与归档条目不会进入主站生成数据。合并后由现有部署流程上线。" });
        this.pr = { number: pr.number, url: `https://github.com/${REPO}/pull/${pr.number}` };
        // A completed remote save stays successful even if device storage is full.
        try { this.saveDraft(site, credits); } catch { /* The PR link remains available in this session. */ }
        return this.pr;
      } finally { this.busy = false; }
    }
  }
  window.STUDIO_GITHUB = { GitHubStore, validate, publicData, REPO, BASE };
})();
