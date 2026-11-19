(function () {
  const { MODULES } = window.STUDIO_SCHEMAS;
  const remote = new window.STUDIO_GITHUB.GitHubStore();
  let online = new URLSearchParams(location.search).get("mode") === "github" || !["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
  let submitting = false;

  const state = {
    site: null,
    credits: [],
    assetCatalog: [],
    assetFiles: [],
    assets: [],
    module: "timeline",
    selectedIndex: null,
    activeGroup: null,
    status: "all",
    search: "",
    dirty: false,
    uploadTargetPath: null,
    pickerTargetPath: null,
    linkTargetPath: null,
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    moduleTabs: $("module-tabs"),
    moduleTitle: $("module-title"),
    moduleDescription: $("module-description"),
    visibleCount: $("visible-count"),
    statusTabs: $("status-tabs"),
    search: $("search-input"),
    add: $("add-btn"),
    tableHead: $("table-head"),
    tableBody: $("table-body"),
    empty: $("empty-state"),
    editorPlaceholder: $("editor-placeholder"),
    editorContent: $("editor-content"),
    editorKind: $("editor-kind"),
    editorTitle: $("editor-title"),
    fieldTabs: $("field-tabs"),
    form: $("editor-form"),
    unsaved: $("unsaved-badge"),
    connection: $("connection-status"),
    validationDialog: $("validation-dialog"),
    validationSummary: $("validation-summary"),
    validationList: $("validation-list"),
    confirmDialog: $("confirm-dialog"),
    confirmTitle: $("confirm-title"),
    confirmMessage: $("confirm-message"),
    uploadInput: $("asset-upload-input"),
    toastRegion: $("toast-region"),
  };

  const MODULE_DESCRIPTIONS = {
    people: "维护人物资料、简介与头像素材。",
    timeline: "整理事件、日期、关联媒体与出处。",
    sugars: "集中编辑糖点文案、视频与封面。",
    photos: "管理相册图片、说明与版权关联。",
    music: "维护音乐条目、平台嵌入与来源。",
    sources: "统一记录资料来源与访问日期。",
    credits: "管理图片作者、许可证与原始页面。",
    assets: "登记图床链接、复用图片，并核对项目内素材引用位置。",
  };

  const clone = (value) => JSON.parse(JSON.stringify(value));

  function getPath(object, path) {
    if (!path) return undefined;
    return path.split(".").reduce((value, key) => value == null ? undefined : value[key], object);
  }

  function setPath(object, path, value) {
    const keys = path.split(".");
    let target = object;
    keys.slice(0, -1).forEach((key) => {
      if (!target[key] || typeof target[key] !== "object") target[key] = {};
      target = target[key];
    });
    target[keys[keys.length - 1]] = value;
  }

  function slugify(value) {
    return String(value || "")
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 42);
  }

  function uniqueId(prefix, label) {
    const base = slugify(label) || Date.now().toString(36);
    const allIds = new Set([
      ...Object.keys(state.site || {}).flatMap((key) => Array.isArray(state.site[key]) ? state.site[key].map((item) => item.id) : []),
      ...state.credits.map((item) => item.id),
      ...state.assetCatalog.map((item) => item.id),
    ]);
    let id = `${prefix}-${base}`;
    let suffix = 2;
    while (allIds.has(id)) id = `${prefix}-${base}-${suffix++}`;
    return id;
  }

  function resolveAssetUrl(value) {
    if (!value) return "";
    if (online) return remote.assetUrl(value);
    if (/^(https?:|data:|blob:)/i.test(value)) return value;
    return `../${String(value).replace(/^\/+/, "")}`;
  }

  function collectionFor(moduleKey = state.module) {
    const schema = MODULES[moduleKey];
    if (schema.virtual) return state.assets;
    if (moduleKey === "credits") return state.credits;
    return state.site?.[schema.collection] || [];
  }

  function usageMap() {
    const usage = new Map();
    const add = (path, label) => {
      if (!path) return;
      const labels = usage.get(path) || [];
      if (!labels.includes(label)) labels.push(label);
      usage.set(path, labels);
    };
    const groups = { ...state.site, credits: state.credits };
    Object.entries(groups).forEach(([key, items]) => {
      if (!Array.isArray(items)) return;
      items.forEach((item) => {
        const label = item.title || item.name || item.caption || item.label || item.id || "未命名";
        ["photo", "src", "cover", "file"].forEach((field) => add(item[field], `${MODULES[key]?.label || key}：${label}`));
      });
    });
    return usage;
  }

  function refreshAssets(selectedCatalogId = null) {
    const usage = usageMap();
    const registeredUrls = new Set(state.assetCatalog.map((asset) => asset.url).filter(Boolean));
    const catalogRows = state.assetCatalog.map((asset) => ({
      id: `catalog:${asset.id}`,
      catalogId: asset.id,
      registered: true,
      label: asset.name,
      path: asset.url,
      kind: asset.status === "archived" ? "图床素材（已归档）" : "图床素材",
      provider: asset.provider,
      alt: asset.alt || "",
      note: asset.note || "",
      status: asset.status || "active",
      sizeLabel: "远程",
      usedBy: (usage.get(asset.url) || []).join("；"),
    }));
    const fileRows = state.assetFiles.map((asset) => ({
      ...asset,
      id: `file:${asset.path}`,
      registered: false,
      usedBy: (usage.get(asset.path) || []).join("；"),
    }));
    const unregisteredRows = [...usage.keys()]
      .filter((path) => /^https?:\/\//i.test(path) && !registeredUrls.has(path))
      .map((path) => ({
        id: `remote:${path}`,
        label: path.split("/").pop() || path,
        path,
        kind: "未登记外链",
        provider: "外部链接",
        registered: false,
        sizeLabel: "远程",
        usedBy: (usage.get(path) || []).join("；"),
      }));
    state.assets = [...catalogRows, ...fileRows, ...unregisteredRows];
    if (selectedCatalogId && state.module === "assets") state.selectedIndex = state.assets.findIndex((item) => item.catalogId === selectedCatalogId);
  }

  function selectedItem() {
    if (state.selectedIndex == null) return null;
    return collectionFor()[state.selectedIndex] || null;
  }

  function normalizeState() {
    Object.entries(MODULES).forEach(([key, schema]) => {
      if (schema.virtual) return;
      const collection = key === "credits" ? state.credits : state.site[schema.collection];
      collection.forEach((item, index) => {
        if (!item.id) item.id = uniqueId(key.replace(/s$/, ""), getPath(item, schema.titlePath) || String(index + 1));
        if (!item._status) item._status = "published";
      });
    });

    const creditByFile = new Map(state.credits.map((credit) => [credit.file, credit.id]));
    state.site.photos.forEach((photo) => {
      if (!photo.alt) photo.alt = photo.caption || "";
      if (!photo.creditId) photo.creditId = creditByFile.get(photo.src) || "";
    });
    state.assetCatalog.forEach((asset, index) => {
      if (!asset.id) asset.id = uniqueId("asset", asset.name || String(index + 1));
      if (!asset.provider) asset.provider = "123pan";
      if (!asset.status) asset.status = "active";
    });
    refreshAssets();
  }

  async function request(path, options = {}) {
    if (online) {
      const body = options.body ? JSON.parse(options.body) : {};
      if (path === "/api/state") return remote.load();
      if (path === "/api/save") {
        remote.saveDraft(body.site, body.credits, body.assets);
        return { files: remote.fileAssets() };
      }
      if (path === "/api/validate") return remote.validate(body.site, body.credits, body.assets);
      throw new Error("线上模式不支持此本地操作");
    }
    const response = await fetch(path, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `请求失败（${response.status}）`);
    return payload;
  }

  async function loadState({ quiet = false } = {}) {
    if (online && !remote.connected) { configureMode(); return; }
    try {
      const payload = await request("/api/state");
      state.site = payload.site;
      state.credits = payload.credits;
      state.assetCatalog = payload.catalog || [];
      state.assetFiles = payload.files || [];
      normalizeState();
      state.selectedIndex = null;
      state.activeGroup = null;
      setDirty(false);
      setConnection(true, online ? "GitHub 已连接" : "本地编辑服务已连接");
      renderAll();
      configureMode();
      if (online) $("sync-status").textContent = "已读取 hinskenny-site。保存草稿仅存此设备；提交审核后需到 GitHub 合并。";
      if (!quiet) toast("内容已载入", "success");
      return true;
    } catch (error) {
      if (online) { toast(error.message, "error", 7000); return false; }
      setConnection(false, "未连接本地编辑服务");
      showStartupError(error);
    }
  }

  function showStartupError(error) {
    els.tableBody.replaceChildren();
    els.empty.hidden = false;
    els.empty.querySelector("strong").textContent = "内容工作台需要本地编辑服务";
    els.empty.querySelector("p").textContent = "请在项目根目录运行：python3 studio/server.py，然后打开 http://127.0.0.1:8765/studio/";
    toast(error.message, "error", 7000);
  }

  function setConnection(ok, message) {
    els.connection.textContent = message;
    els.connection.className = `connection ${ok ? "ok" : "error"}`;
  }

  function setDirty(dirty) {
    state.dirty = dirty;
    els.unsaved.hidden = !dirty;
    document.title = `${dirty ? "● " : ""}HinsKenny 内容工作台`;
  }

  function renderAll() {
    renderModuleTabs();
    renderModuleContext();
    renderStatusCounts();
    renderTable();
    renderEditor();
  }

  function renderModuleContext() {
    const schema = MODULES[state.module];
    els.moduleTitle.textContent = schema.label;
    els.moduleDescription.textContent = MODULE_DESCRIPTIONS[state.module] || "管理当前板块内容。";
  }

  function renderModuleTabs() {
    els.moduleTabs.replaceChildren();
    Object.entries(MODULES).forEach(([key, schema]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `module-tab${key === state.module ? " active" : ""}`;
      button.dataset.module = key;
      button.setAttribute("aria-current", key === state.module ? "page" : "false");
      button.textContent = schema.label;
      const count = document.createElement("span");
      count.className = "count";
      count.textContent = collectionFor(key).length;
      button.append(count);
      els.moduleTabs.append(button);
    });
  }

  function statusOf(item) {
    return item?._status || "published";
  }

  function renderStatusCounts() {
    const schema = MODULES[state.module];
    const collection = collectionFor();
    const counts = {
      all: collection.length,
      draft: collection.filter((item) => statusOf(item) === "draft").length,
      published: collection.filter((item) => statusOf(item) === "published").length,
      "needs-source": schema.virtual ? 0 : collection.filter((item) => schema.needsSource(item)).length,
    };
    Object.entries(counts).forEach(([key, value]) => {
      const target = $(`count-${key}`);
      if (target) target.textContent = value;
    });
    els.statusTabs.hidden = schema.virtual;
    els.statusTabs.querySelectorAll("[data-status]").forEach(tab => tab.classList.toggle("active", tab.dataset.status === state.status));
  }

  function filteredRows() {
    const schema = MODULES[state.module];
    const query = state.search.trim().toLowerCase();
    return collectionFor()
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => {
        if (state.status === "draft" && statusOf(item) !== "draft") return false;
        if (state.status === "published" && statusOf(item) !== "published") return false;
        if (state.status === "needs-source" && !schema.needsSource(item)) return false;
        if (!query) return true;
        return schema.searchPaths.some((path) => String(getPath(item, path) || "").toLowerCase().includes(query));
      });
  }

  function renderTable() {
    const schema = MODULES[state.module];
    const headerRow = document.createElement("tr");
    schema.columns.forEach((column) => {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = column.label;
      headerRow.append(th);
    });
    els.tableHead.replaceChildren(headerRow);
    els.tableBody.replaceChildren();

    const rows = filteredRows();
    els.visibleCount.textContent = `${rows.length} / ${collectionFor().length} 条`;
    rows.forEach(({ item, index }) => {
      const tr = document.createElement("tr");
      tr.dataset.index = index;
      tr.tabIndex = 0;
      tr.setAttribute("aria-selected", index === state.selectedIndex ? "true" : "false");
      if (index === state.selectedIndex) tr.classList.add("selected");
      schema.columns.forEach((column) => {
        const td = document.createElement("td");
        if (column.primary) td.classList.add("primary-cell");
        if (column.wrap) td.classList.add("wrap-cell");
        const value = column.render ? column.render(item) : getPath(item, column.path);
        if (column.type === "image") {
          if (value) {
            const img = document.createElement("img");
            img.className = "thumb";
            img.src = resolveAssetUrl(value);
            img.alt = "";
            img.loading = "lazy";
            td.append(img);
          } else {
            td.textContent = "—";
            td.classList.add("muted-cell");
          }
        } else if (column.type === "status") {
          const status = statusOf(item);
          const pill = document.createElement("span");
          pill.className = `status-pill ${status}`;
          pill.textContent = status === "published" ? "已发布" : status === "draft" ? "草稿" : "已归档";
          td.append(pill);
        } else {
          td.textContent = value || "—";
          if (!value) td.classList.add("muted-cell");
        }
        tr.append(td);
      });
      els.tableBody.append(tr);
    });

    els.empty.hidden = rows.length > 0;
    els.add.hidden = schema.virtual && !schema.defaultItem;
    els.add.textContent = `新增${schema.singular}`;
  }

  function renderEditor() {
    const schema = MODULES[state.module];
    const item = selectedItem();
    els.editorPlaceholder.hidden = Boolean(item);
    els.editorContent.hidden = !item;
    if (!item) return;

    if (schema.virtual) {
      renderAssetEditor(item);
      return;
    }

    els.editorKind.textContent = `${schema.label} · ${item.id || "尚未生成 ID"}`;
    els.editorTitle.textContent = getPath(item, schema.titlePath) || `编辑${schema.singular}`;
    if (!state.activeGroup || !schema.groups.some((group) => group.id === state.activeGroup)) {
      state.activeGroup = schema.groups[0].id;
    }

    els.fieldTabs.replaceChildren();
    schema.groups.forEach((group) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `field-tab${group.id === state.activeGroup ? " active" : ""}`;
      button.dataset.group = group.id;
      button.textContent = group.label;
      els.fieldTabs.append(button);
    });

    const group = schema.groups.find((entry) => entry.id === state.activeGroup);
    const groupElement = document.createElement("div");
    groupElement.className = "field-group";
    group.fields.forEach((field) => groupElement.append(createField(field, item)));
    els.form.replaceChildren(groupElement);
    setOrderButtons();
  }

  function renderAssetEditor(item) {
    els.editorKind.textContent = `素材库 · ${item.kind}`;
    els.editorTitle.textContent = item.label;
    els.fieldTabs.replaceChildren();
    els.form.replaceChildren();

    const group = document.createElement("div");
    group.className = "field-group";
    const preview = document.createElement("img");
    preview.className = "asset-preview";
    preview.src = resolveAssetUrl(item.path);
    preview.alt = item.label || "素材预览";
    preview.addEventListener("error", () => preview.classList.add("is-error"));
    group.append(preview);
    if (item.registered) {
      const catalog = state.assetCatalog.find((asset) => asset.id === item.catalogId);
      [
        ["素材名称", "name", "text"],
        ["公开图片链接", "url", "url"],
        ["图床服务商", "provider", "text"],
        ["默认替代文本", "alt", "text"],
        ["备注", "note", "textarea-compact"],
      ].forEach(([labelText, path, type]) => {
        const field = document.createElement("div");
        field.className = "field";
        const label = document.createElement("label");
        label.textContent = labelText;
        const input = type.startsWith("textarea") ? document.createElement("textarea") : document.createElement("input");
        if (type === "url") input.type = "url";
        if (type === "textarea-compact") input.className = "compact";
        input.dataset.catalogField = path;
        input.value = catalog?.[path] || "";
        field.append(label, input);
        group.append(field);
      });
      const statusField = document.createElement("div");
      statusField.className = "field";
      const statusLabel = document.createElement("label");
      statusLabel.textContent = "素材状态";
      const select = document.createElement("select");
      select.dataset.catalogField = "status";
      [["active", "使用中"], ["archived", "已归档"]].forEach(([value, label]) => {
        const option = document.createElement("option"); option.value = value; option.textContent = label; select.append(option);
      });
      select.value = catalog?.status || "active";
      statusField.append(statusLabel, select);
      group.append(statusField);
    } else {
      [
        ["文件 / 地址", item.path],
        ["类型", item.kind],
        ["服务商", item.provider || "—"],
        ["引用位置", item.usedBy || "尚未引用"],
      ].forEach(([label, value]) => {
        const field = document.createElement("div");
        field.className = "field";
        const title = document.createElement("label");
        title.textContent = label;
        const input = document.createElement("input");
        input.value = value;
        input.readOnly = true;
        field.append(title, input);
        group.append(field);
      });
      if (/^https:\/\//i.test(item.path)) {
        const register = document.createElement("button");
        register.type = "button";
        register.className = "btn primary";
        register.dataset.registerAssetUrl = item.path;
        register.dataset.registerAssetName = item.label;
        register.textContent = "登记到素材库";
        group.append(register);
      }
    }
    const usage = document.createElement("p");
    usage.className = "field-help";
    usage.textContent = `引用位置：${item.usedBy || "尚未引用"}`;
    group.append(usage);
    els.form.append(group);
    $("move-up-btn").disabled = true;
    $("move-down-btn").disabled = true;
    $("duplicate-btn").disabled = true;
    $("delete-btn").disabled = !item.registered;
  }

  function createField(field, item) {
    const wrapper = document.createElement("div");
    wrapper.className = "field";
    const label = document.createElement("label");
    label.htmlFor = `field-${field.path.replace(/\./g, "-")}`;
    label.textContent = field.label;
    if (field.required) {
      const required = document.createElement("span");
      required.className = "required";
      required.textContent = " *";
      label.append(required);
    }
    wrapper.append(label);

    const value = getPath(item, field.path) ?? "";
    let input;
    if (field.type === "textarea" || field.type === "textarea-compact") {
      input = document.createElement("textarea");
      if (field.type === "textarea-compact") input.className = "compact";
    } else if (field.type === "select") {
      input = document.createElement("select");
      field.options.forEach((option) => {
        const element = document.createElement("option");
        element.value = option.value;
        element.textContent = option.label;
        input.append(element);
      });
    } else {
      input = document.createElement("input");
      input.type = field.type === "date" ? "date" : field.type === "url" ? "url" : "text";
    }
    input.id = `field-${field.path.replace(/\./g, "-")}`;
    input.name = field.path;
    input.value = value;
    if (field.required) input.required = true;
    if (field.pattern) input.pattern = field.pattern;

    if (field.type === "asset") {
      const assetRow = document.createElement("div");
      assetRow.className = "asset-field";
      const choose = document.createElement("button");
      choose.type = "button";
      choose.className = "btn";
      choose.dataset.pickAssetFor = field.path;
      choose.textContent = "选择素材";
      const register = document.createElement("button");
      register.type = "button";
      register.className = "btn";
      register.dataset.registerFor = field.path;
      register.textContent = "登记链接";
      assetRow.append(input, choose, register);
      wrapper.append(assetRow);
      if (value) {
        const preview = document.createElement("img");
        preview.className = "asset-preview";
        preview.src = resolveAssetUrl(value);
        preview.alt = "当前图片预览";
        preview.addEventListener("error", () => preview.classList.add("is-error"));
        wrapper.append(preview);
      }
    } else {
      wrapper.append(input);
    }

    if (field.help) {
      const help = document.createElement("p");
      help.className = "field-help";
      help.textContent = field.help;
      wrapper.append(help);
    }
    return wrapper;
  }

  function setOrderButtons() {
    const collection = collectionFor();
    const index = state.selectedIndex;
    $("move-up-btn").disabled = index <= 0;
    $("move-down-btn").disabled = index == null || index >= collection.length - 1;
    $("duplicate-btn").disabled = false;
    $("delete-btn").disabled = false;
  }

  function updateSelected(path, value) {
    const item = selectedItem();
    if (!item) return;
    if (state.module === "assets") {
      if (!item.registered) return;
      const catalog = state.assetCatalog.find((asset) => asset.id === item.catalogId);
      if (!catalog) return;
      setPath(catalog, path, value);
      if (path === "name") { item.label = value; els.editorTitle.textContent = value || "编辑图床素材"; }
      if (path === "url") { item.path = value; }
      if (path === "provider") item.provider = value;
      if (path === "status") item.status = value;
      setDirty(true);
      return;
    }
    setPath(item, path, value);
    if (path === MODULES[state.module].titlePath) els.editorTitle.textContent = value || `编辑${MODULES[state.module].singular}`;
    setDirty(true);
  }

  function addItem() {
    if (!state.site) return;
    const schema = MODULES[state.module];
    if (!schema.defaultItem) return;
    if (state.module === "assets") {
      openAssetLinkDialog(null);
      return;
    }
    const item = schema.defaultItem();
    item.id = uniqueId(state.module.replace(/s$/, ""), getPath(item, schema.titlePath));
    const collection = collectionFor();
    collection.unshift(item);
    state.selectedIndex = 0;
    state.activeGroup = schema.groups[0].id;
    state.status = "all";
    setDirty(true);
    refreshAssets();
    renderAll();
    requestAnimationFrame(() => els.form.querySelector("input, textarea, select")?.focus());
  }

  function duplicateItem() {
    const schema = MODULES[state.module];
    const item = selectedItem();
    if (!item || schema.virtual) return;
    const copy = clone(item);
    const title = `${getPath(copy, schema.titlePath) || schema.singular}（副本）`;
    setPath(copy, schema.titlePath, title);
    copy.id = uniqueId(state.module.replace(/s$/, ""), title);
    copy._status = "draft";
    collectionFor().splice(state.selectedIndex + 1, 0, copy);
    state.selectedIndex += 1;
    setDirty(true);
    refreshAssets();
    renderAll();
  }

  async function deleteItem() {
    const schema = MODULES[state.module];
    const item = selectedItem();
    if (!item) return;
    if (state.module === "assets") {
      if (!item.registered) return;
      const message = item.usedBy
        ? `“${item.label}”仍被以下内容引用：${item.usedBy}。删除只会移除素材登记，不会清空这些内容里的图片链接。`
        : `将删除“${item.label}”的素材登记，图床上的图片不会被删除。`;
      if (!await confirmAction("删除素材登记？", message, "删除登记")) return;
      state.assetCatalog = state.assetCatalog.filter((asset) => asset.id !== item.catalogId);
      state.selectedIndex = null;
      refreshAssets();
      setDirty(true);
      renderAll();
      return;
    }
    if (schema.virtual) return;
    const confirmed = await confirmAction("删除这条内容？", `将删除“${getPath(item, schema.titlePath) || item.id}”。保存后才会写入内容文件。`, "删除");
    if (!confirmed) return;
    collectionFor().splice(state.selectedIndex, 1);
    state.selectedIndex = null;
    setDirty(true);
    refreshAssets();
    renderAll();
  }

  function moveItem(offset) {
    if (state.module === "assets") return;
    const collection = collectionFor();
    const from = state.selectedIndex;
    const to = from + offset;
    if (from == null || to < 0 || to >= collection.length) return;
    const [item] = collection.splice(from, 1);
    collection.splice(to, 0, item);
    state.selectedIndex = to;
    setDirty(true);
    refreshAssets();
    renderAll();
  }

  async function saveDraft({ quiet = false } = {}) {
    if (!state.site) return false;
    try {
      const payload = await request("/api/save", {
        method: "POST",
        body: JSON.stringify({ site: state.site, credits: state.credits, assets: state.assetCatalog }),
      });
      state.assetFiles = payload.files || state.assetFiles;
      refreshAssets();
      setDirty(false);
      renderModuleTabs();
      configureMode();
      if (!quiet) toast(online ? "草稿仅保存到此设备，尚未提交 GitHub" : "草稿已保存", "success");
      return true;
    } catch (error) {
      toast(error.message, "error", 7000);
      return false;
    }
  }

  async function validateContent({ openDialog = true } = {}) {
    if (!state.site) return null;
    try {
      const result = await request("/api/validate", {
        method: "POST",
        body: JSON.stringify({ site: state.site, credits: state.credits, assets: state.assetCatalog }),
      });
      if (openDialog) showValidation(result);
      return result;
    } catch (error) {
      toast(error.message, "error", 7000);
      return null;
    }
  }

  function showValidation(result) {
    const errors = result.issues.filter((issue) => issue.level === "error");
    const warnings = result.issues.filter((issue) => issue.level === "warning");
    els.validationSummary.className = "validation-summary";
    els.validationSummary.replaceChildren();
    [
      [errors.length, "错误", errors.length ? "error" : "ok"],
      [warnings.length, "提醒", warnings.length ? "warning" : "ok"],
      [result.checked, "已检查条目", "ok"],
    ].forEach(([count, label, tone]) => {
      const chip = document.createElement("span");
      chip.className = `summary-chip ${tone}`;
      chip.textContent = `${count} ${label}`;
      els.validationSummary.append(chip);
    });

    els.validationList.replaceChildren();
    if (!result.issues.length) {
      const item = document.createElement("div");
      item.className = "validation-item";
      const strong = document.createElement("strong");
      strong.textContent = "没有发现问题，可以发布。";
      item.append(strong);
      els.validationList.append(item);
    } else {
      result.issues.forEach((issue) => {
        const item = document.createElement("div");
        item.className = "validation-item";
        const strong = document.createElement("strong");
        strong.textContent = `${issue.level === "error" ? "错误" : "提醒"} · ${issue.location}`;
        const text = document.createElement("p");
        text.textContent = issue.message;
        item.append(strong, text);
        els.validationList.append(item);
      });
    }
    els.validationDialog.showModal();
  }

  async function previewSite() {
    if (online) { await previewOnline(); return; }
    const previewWindow = window.open("about:blank", "hinskenny-preview");
    if (previewWindow) {
      previewWindow.document.title = "正在准备 HinsKenny 预览…";
      previewWindow.document.body.textContent = "正在保存草稿并准备预览…";
    }
    const saved = await saveDraft({ quiet: true });
    if (!saved) {
      previewWindow?.close();
      return;
    }
    if (previewWindow) previewWindow.location.replace("/?studioPreview=1");
    else window.location.href = "/?studioPreview=1";
    toast("已打开包含草稿内容的主站预览", "success");
  }

  async function publishSite() {
    if (online) { await submitOnline(); return; }
    const saved = await saveDraft({ quiet: true });
    if (!saved) return;
    const validation = await validateContent({ openDialog: false });
    if (!validation) return;
    const errors = validation.issues.filter((issue) => issue.level === "error");
    if (errors.length) {
      showValidation(validation);
      toast("请先修复错误再发布", "error");
      return;
    }
    const confirmed = await confirmAction("发布到主站？", "系统会备份现有 data.js 和 credits.js，再用当前已发布内容生成新文件。草稿和归档条目不会进入主站。", "确认发布");
    if (!confirmed) return;
    try {
      const result = await request("/api/publish", {
        method: "POST",
        body: JSON.stringify({ site: state.site, credits: state.credits, assets: state.assetCatalog }),
      });
      toast(`发布完成：${result.publishedItems} 条内容`, "success", 6000);
    } catch (error) {
      toast(error.message, "error", 7000);
    }
  }

  async function uploadAsset(file, targetPath) {
    if (!file || !targetPath) return;
    if (online) {
      try {
        const path = await remote.upload(file);
        updateSelected(targetPath, path);
        state.assetFiles = remote.fileAssets();
        refreshAssets();
        renderEditor(); renderModuleTabs(); renderTable();
        toast("图片已暂存，提交审核时一起上传 GitHub");
      } catch (error) { toast(error.message, "error"); }
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast("单张图片不能超过 10 MB", "error");
      return;
    }
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("读取图片失败"));
      reader.readAsDataURL(file);
    });
    try {
      const result = await request("/api/upload", {
        method: "POST",
        body: JSON.stringify({ fileName: file.name, dataUrl }),
      });
      updateSelected(targetPath, result.path);
      state.assetFiles = result.files || state.assetFiles;
      refreshAssets();
      renderEditor();
      renderModuleTabs();
      toast(`图片已放入 ${result.path}`, "success");
    } catch (error) {
      toast(error.message, "error", 7000);
    }
  }

  function chooseAsset(path) {
    if (!state.pickerTargetPath) return;
    const asset = state.assets.find((item) => item.path === path);
    updateSelected(state.pickerTargetPath, path);
    if (state.module === "photos" && state.pickerTargetPath === "src" && !selectedItem()?.alt && asset?.alt) updateSelected("alt", asset.alt);
    refreshAssets();
    $("asset-picker-dialog").close();
    state.pickerTargetPath = null;
    renderEditor();
    renderTable();
    renderModuleTabs();
    toast("已引用素材", "success");
  }

  function renderAssetPicker() {
    const query = $("asset-picker-search").value.trim().toLowerCase();
    const rows = state.assets.filter((item) => item.path && item.status !== "archived" && [item.label, item.path, item.provider, item.kind].some((value) => String(value || "").toLowerCase().includes(query)));
    const grid = $("asset-picker-grid");
    grid.replaceChildren();
    rows.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "asset-picker-card";
      button.dataset.assetPath = item.path;
      const image = document.createElement("img");
      image.src = resolveAssetUrl(item.path);
      image.alt = "";
      image.loading = "lazy";
      const text = document.createElement("div");
      const strong = document.createElement("strong");
      strong.textContent = item.label || item.path;
      const meta = document.createElement("span");
      meta.textContent = `${item.provider || item.kind || "素材"}${item.usedBy ? " · 已引用" : ""}`;
      text.append(strong, meta);
      button.append(image, text);
      grid.append(button);
    });
    $("asset-picker-empty").hidden = rows.length > 0;
  }

  function openAssetPicker(targetPath) {
    state.pickerTargetPath = targetPath;
    $("asset-picker-search").value = "";
    renderAssetPicker();
    $("asset-picker-dialog").showModal();
    requestAnimationFrame(() => $("asset-picker-search").focus());
  }

  function updateLinkPreview() {
    const url = $("asset-link-url").value.trim();
    const preview = $("asset-link-preview");
    preview.classList.remove("is-error");
    $("asset-link-error").textContent = "";
    if (!/^https:\/\/[^\s"'<>`]+$/i.test(url)) {
      preview.hidden = true;
      preview.removeAttribute("src");
      return;
    }
    preview.hidden = false;
    preview.src = url;
  }

  function openAssetLinkDialog(targetPath, seed = {}) {
    state.linkTargetPath = targetPath;
    $("asset-link-form").reset();
    $("asset-link-provider").value = seed.provider || "123pan";
    $("asset-link-name").value = seed.name || "";
    $("asset-link-url").value = seed.url || (targetPath ? getPath(selectedItem(), targetPath) || "" : "");
    $("asset-link-alt").value = seed.alt || "";
    $("asset-link-note").value = seed.note || "";
    $("asset-link-error").textContent = "";
    updateLinkPreview();
    $("asset-link-dialog").showModal();
    requestAnimationFrame(() => ($("asset-link-name").value ? $("asset-link-url") : $("asset-link-name")).focus());
  }

  function closeAssetLinkDialog() {
    $("asset-link-dialog").close();
    state.linkTargetPath = null;
  }

  function registerAssetFromDialog(event) {
    event.preventDefault();
    const name = $("asset-link-name").value.trim();
    const url = $("asset-link-url").value.trim();
    const provider = $("asset-link-provider").value.trim();
    const error = $("asset-link-error");
    if (!name || !provider || !/^https:\/\/[^\s"'<>`]+$/i.test(url)) {
      error.textContent = "请填写素材名称、服务商和有效的 HTTPS 图片直链。";
      return;
    }
    let asset = state.assetCatalog.find((item) => item.url === url);
    const alreadyRegistered = Boolean(asset);
    if (!asset) {
      asset = {
        id: uniqueId("asset", name),
        name,
        url,
        provider,
        alt: $("asset-link-alt").value.trim(),
        note: $("asset-link-note").value.trim(),
        status: "active",
      };
      state.assetCatalog.unshift(asset);
      setDirty(true);
    }
    if (state.linkTargetPath) {
      updateSelected(state.linkTargetPath, asset.url);
      if (state.module === "photos" && state.linkTargetPath === "src" && !selectedItem()?.alt && asset.alt) updateSelected("alt", asset.alt);
    }
    refreshAssets(asset.id);
    $("asset-link-dialog").close();
    if ($("asset-picker-dialog").open) $("asset-picker-dialog").close();
    state.linkTargetPath = null;
    state.pickerTargetPath = null;
    renderAll();
    toast(alreadyRegistered ? "该链接已登记，已使用现有素材" : "图床素材已登记", "success");
  }

  function showToast(message, tone = "", duration = 3500) {
    const element = document.createElement("div");
    element.className = `toast ${tone}`.trim();
    element.textContent = message;
    els.toastRegion.append(element);
    setTimeout(() => element.remove(), duration);
  }
  const toast = showToast;

  function confirmAction(title, message, actionLabel) {
    els.confirmTitle.textContent = title;
    els.confirmMessage.textContent = message;
    $("confirm-ok-btn").textContent = actionLabel;
    els.confirmDialog.showModal();
    return new Promise((resolve) => {
      const finish = (value) => {
        els.confirmDialog.close();
        $("confirm-ok-btn").removeEventListener("click", onConfirm);
        $("confirm-cancel-btn").removeEventListener("click", onCancel);
        els.confirmDialog.removeEventListener("cancel", onEscape);
        resolve(value);
      };
      const onConfirm = () => finish(true);
      const onCancel = () => finish(false);
      const onEscape = (event) => { event.preventDefault(); finish(false); };
      els.confirmDialog.addEventListener("cancel", onEscape);
      $("confirm-ok-btn").addEventListener("click", onConfirm);
      $("confirm-cancel-btn").addEventListener("click", onCancel);
    });
  }

  els.moduleTabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-module]");
    if (!button) return;
    state.module = button.dataset.module;
    state.selectedIndex = null;
    state.activeGroup = null;
    state.status = "all";
    state.search = "";
    els.search.value = "";
    renderAll();
  });

  els.statusTabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-status]");
    if (!button) return;
    state.status = button.dataset.status;
    els.statusTabs.querySelectorAll(".status-tab").forEach((tab) => tab.classList.toggle("active", tab === button));
    renderTable();
  });

  els.search.addEventListener("input", () => {
    state.search = els.search.value;
    renderTable();
  });

  els.tableBody.addEventListener("click", (event) => {
    const row = event.target.closest("tr[data-index]");
    if (!row) return;
    state.selectedIndex = Number(row.dataset.index);
    state.activeGroup = null;
    renderTable();
    renderEditor();
  });

  els.tableBody.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const row = event.target.closest("tr[data-index]");
    if (!row) return;
    event.preventDefault();
    row.click();
  });

  els.fieldTabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-group]");
    if (!button) return;
    state.activeGroup = button.dataset.group;
    renderEditor();
  });

  els.form.addEventListener("input", (event) => {
    const catalogInput = event.target.closest("[data-catalog-field]");
    if (catalogInput) {
      updateSelected(catalogInput.dataset.catalogField, catalogInput.value);
      return;
    }
    const input = event.target.closest("[name]");
    if (!input) return;
    updateSelected(input.name, input.value);
  });

  els.form.addEventListener("change", (event) => {
    const catalogInput = event.target.closest("[data-catalog-field]");
    if (catalogInput) {
      const item = selectedItem();
      updateSelected(catalogInput.dataset.catalogField, catalogInput.value);
      refreshAssets(item?.catalogId);
      renderTable();
      renderModuleTabs();
      renderEditor();
      return;
    }
    const input = event.target.closest("[name]");
    if (!input) return;
    updateSelected(input.name, input.value);
    refreshAssets();
    renderTable();
    renderStatusCounts();
  });

  els.form.addEventListener("click", (event) => {
    const choose = event.target.closest("[data-pick-asset-for]");
    if (choose) { openAssetPicker(choose.dataset.pickAssetFor); return; }
    const register = event.target.closest("[data-register-for]");
    if (register) { openAssetLinkDialog(register.dataset.registerFor); return; }
    const registerUrl = event.target.closest("[data-register-asset-url]");
    if (registerUrl) {
      openAssetLinkDialog(null, { url: registerUrl.dataset.registerAssetUrl, name: registerUrl.dataset.registerAssetName });
      return;
    }
    const button = event.target.closest("[data-upload-for]");
    if (!button) return;
    state.uploadTargetPath = button.dataset.uploadFor;
    els.uploadInput.value = "";
    els.uploadInput.click();
  });

  els.uploadInput.addEventListener("change", () => uploadAsset(els.uploadInput.files?.[0], state.uploadTargetPath));
  $("asset-picker-grid").addEventListener("click", (event) => {
    const button = event.target.closest("[data-asset-path]");
    if (button) chooseAsset(button.dataset.assetPath);
  });
  $("asset-picker-search").addEventListener("input", renderAssetPicker);
  $("asset-picker-close").addEventListener("click", () => $("asset-picker-dialog").close());
  $("asset-picker-cancel").addEventListener("click", () => $("asset-picker-dialog").close());
  $("asset-picker-dialog").addEventListener("close", () => { if (!$("asset-link-dialog").open) state.pickerTargetPath = null; });
  $("asset-picker-new").addEventListener("click", () => openAssetLinkDialog(state.pickerTargetPath));
  $("asset-link-url").addEventListener("input", updateLinkPreview);
  $("asset-link-preview").addEventListener("error", () => {
    $("asset-link-preview").classList.add("is-error");
    $("asset-link-error").textContent = "当前链接未能加载为图片，请确认复制的是公开直链。你仍可登记后再检查。";
  });
  $("asset-link-form").addEventListener("submit", registerAssetFromDialog);
  $("asset-link-close").addEventListener("click", closeAssetLinkDialog);
  $("asset-link-cancel").addEventListener("click", closeAssetLinkDialog);
  $("asset-link-dialog").addEventListener("close", () => { state.linkTargetPath = null; });
  els.add.addEventListener("click", addItem);
  $("duplicate-btn").addEventListener("click", duplicateItem);
  $("delete-btn").addEventListener("click", deleteItem);
  $("move-up-btn").addEventListener("click", () => moveItem(-1));
  $("move-down-btn").addEventListener("click", () => moveItem(1));
  $("reload-btn").addEventListener("click", async () => {
    if (state.dirty && !await confirmAction("放弃未保存修改？", "重新载入会丢失当前浏览器里尚未保存的修改。", "放弃并载入")) return;
    loadState();
  });
  $("save-btn").addEventListener("click", () => saveDraft());
  $("validate-btn").addEventListener("click", () => validateContent());
  $("preview-btn").addEventListener("click", previewSite);
  $("publish-btn").addEventListener("click", publishSite);
  $("close-editor-btn").addEventListener("click", () => {
    state.selectedIndex = null;
    renderTable();
    renderEditor();
  });
  $("close-validation-btn").addEventListener("click", () => els.validationDialog.close());
  $("close-validation-footer-btn").addEventListener("click", () => els.validationDialog.close());

  window.addEventListener("beforeunload", (event) => {
    if (!state.dirty && !submitting) return;
    event.preventDefault();
    event.returnValue = "";
  });

  function configureMode() {
    $("sync-panel").hidden = !online;
    $("save-btn").textContent = online ? "保存设备草稿" : "保存草稿";
    $("publish-btn").textContent = online ? "提交审核" : "发布";
    $("github-connect-btn").textContent = remote.connected ? "更换 Token" : "连接 GitHub";
    $("restore-draft-btn").disabled = !remote.connected || !remote.draft();
    $("disconnect-btn").disabled = !remote.connected;
    for (const id of ["add-btn", "save-btn", "validate-btn", "preview-btn", "publish-btn"]) $(id).disabled = !state.site || (online && !remote.connected);
    if (online && !remote.connected) setConnection(false, "尚未连接 GitHub");
    $("pr-link").hidden = !remote.pr;
    if (remote.pr) { $("pr-link").href = remote.pr.url; $("pr-link").textContent = `查看 PR #${remote.pr.number}`; }
  }

  async function submitOnline() {
    if (submitting || !state.site) return;
    submitting = true;
    try {
      const result = remote.validate(state.site, state.credits, state.assetCatalog);
      if (result.issues.some(i => i.level === "error")) { showValidation(result); return; }
      if (!await confirmAction("提交内容审核？", "将把内容和素材目录保存到 GitHub 内容更新分支，创建或更新 PR。合并到 hinskenny-site 后才会触发部署。", "提交审核")) return;
      $("github-connect-btn").disabled = true;
      $("disconnect-btn").disabled = true;
      document.querySelector(".workspace").inert = true;
      document.querySelector(".module-tabs").inert = true;
      document.querySelector(".top-actions").inert = true;
      $("sync-status").textContent = "正在提交 GitHub，请保持页面开启…";
      const pr = await remote.submit(clone(state.site), clone(state.credits), clone(state.assetCatalog));
      setDirty(false);
      $("sync-status").textContent = `已保存到 GitHub：${remote.branch}。等待你合并 PR #${pr.number}；尚未上线。`;
      toast("已提交审核", "success");
    } catch (error) {
      $("sync-status").textContent = `${error.message}。${remote.branch ? `内容分支：${remote.branch}。可重试以完成 PR。` : "本页编辑内容仍然保留。"}`;
      toast(error.message, "error", 8000);
    } finally {
      submitting = false;
      document.querySelector(".workspace").inert = false;
      document.querySelector(".module-tabs").inert = false;
      document.querySelector(".top-actions").inert = false;
      $("github-connect-btn").disabled = false;
      configureMode();
    }
  }

  async function previewOnline() {
    if (!state.site) return;
    const check = remote.validate(state.site, state.credits, state.assetCatalog);
    if (check.issues.some(i => i.level === "error")) { showValidation(check); return; }
    try {
      const root = new URL("../", location.href);
      const response = await fetch(new URL("index.html", root));
      if (!response.ok) throw new Error("无法读取主站预览模板");
      const doc = new DOMParser().parseFromString(await response.text(), "text/html");
      const base = doc.createElement("base"); base.href = root.href; doc.head.prepend(base);
      // Isolated opaque-origin iframe: content scripts cannot read the editor or its Token.
      const site = clone(state.site), credits = clone(state.credits);
      for (const items of [...Object.values(site).filter(Array.isArray), credits]) for (const item of items) {
        for (const key of ["photo", "src", "cover", "file"]) if (item[key]) item[key] = remote.assetUrl(item[key]);
      }
      const payload = window.STUDIO_GITHUB.publicData(site, credits);
      for (const [name, value, global] of [["data.js", payload.site, "SITE"], ["credits.js", payload.credits, "CREDITS"]]) {
        const script = doc.querySelector(`script[src="${name}"]`);
        if (!script) throw new Error("预览模板不匹配");
        script.removeAttribute("src");
        script.textContent = `window.${global} = ${JSON.stringify(value).replace(/</g, "\\u003c")};`;
      }
      $("preview-frame").srcdoc = "<!doctype html>" + doc.documentElement.outerHTML;
      $("preview-dialog").showModal();
    } catch (error) { toast(error.message, "error"); }
  }

  $("preview-close").addEventListener("click", () => $("preview-dialog").close());
  $("preview-dialog").addEventListener("close", () => { $("preview-frame").srcdoc = ""; });
  $("github-connect-btn").addEventListener("click", () => { $("github-error").textContent = ""; $("github-dialog").showModal(); });
  $("github-cancel").addEventListener("click", () => $("github-dialog").close());
  $("github-dialog").addEventListener("close", () => { $("github-token").value = ""; });
  $("github-form").addEventListener("submit", async event => {
    event.preventDefault();
    if (state.dirty && !await confirmAction("连接并重新读取内容？", "请先保存设备草稿。连接会读取部署分支最新内容，之后可恢复设备草稿。", "继续连接")) return;
    $("github-submit").disabled = true;
    const token = $("github-token").value; $("github-token").value = "";
    try {
      await remote.connect(token); online = true;
      if (!await loadState({ quiet: true })) throw new Error("已验证 Token，但内容读取失败。请检查权限和网络后重试");
      $("github-dialog").close();
      configureMode();
    } catch (error) { $("github-error").textContent = error.message; configureMode(); }
    finally { $("github-submit").disabled = false; }
  });
  $("restore-draft-btn").addEventListener("click", async () => {
    const draft = remote.draft();
    if (!draft || !await confirmAction("恢复设备草稿？", `保存时间：${draft.savedAt}。将替换当前页面内容；提交时仍会检查远端版本。`, "恢复")) return;
    try {
      const data = remote.restore(draft);
      state.site = data.site; state.credits = data.credits; state.assetCatalog = data.catalog; state.assetFiles = data.files;
      normalizeState();
      state.selectedIndex = null; setDirty(true); renderAll(); configureMode();
      $("sync-status").textContent = "已恢复设备草稿。已有 PR 的内容将继续提交到同一个分支；提交前会检查版本。";
    } catch (error) { toast(error.message, "error"); }
  });
  $("disconnect-btn").addEventListener("click", () => { remote.disconnect(); configureMode(); $("sync-status").textContent = "已清除内存中的 Token。重新连接后可恢复设备草稿。"; });
  configureMode();
  loadState({ quiet: true });
})();
