(function () {
  const statusField = {
    path: "_status",
    label: "内容状态",
    type: "select",
    required: true,
    options: [
      { value: "published", label: "已发布" },
      { value: "draft", label: "草稿" },
      { value: "archived", label: "已归档" },
    ],
    help: "草稿不会写入主站；归档内容会保留在工作台，但发布时不会展示。",
  };

  const idField = {
    path: "id",
    label: "唯一 ID",
    type: "text",
    required: true,
    help: "用于跨板块关联。建议使用小写英文、数字和连字符，保存后尽量不要修改。",
  };

  const groupsWithPublishing = (groups) => [
    ...groups,
    { id: "publishing", label: "发布", fields: [statusField, idField] },
  ];

  const MODULES = {
    people: {
      label: "人物",
      singular: "人物",
      collection: "people",
      titlePath: "name",
      searchPaths: ["name", "en", "nick", "intro", "photo"],
      columns: [
        { label: "照片", path: "photo", type: "image" },
        { label: "姓名", path: "name", primary: true },
        { label: "英文名", path: "en" },
        { label: "昵称", path: "nick" },
        { label: "状态", path: "_status", type: "status" },
      ],
      defaultItem: () => ({ id: "", name: "新人物", en: "", nick: "", photo: "", intro: "", _status: "draft" }),
      needsSource: () => false,
      groups: groupsWithPublishing([
        { id: "basic", label: "基本信息", fields: [
          { path: "name", label: "姓名", type: "text", required: true },
          { path: "en", label: "英文名", type: "text", required: true },
          { path: "nick", label: "昵称", type: "text" },
        ] },
        { id: "content", label: "简介", fields: [
          { path: "intro", label: "人物简介", type: "textarea", required: true },
        ] },
        { id: "media", label: "照片", fields: [
          { path: "photo", label: "人物照片", type: "asset", required: true, help: "可以填写 images/ 下的路径，或直接上传图片。" },
        ] },
      ]),
    },

    timeline: {
      label: "时间线",
      singular: "时间线",
      collection: "timeline",
      titlePath: "title",
      searchPaths: ["year", "title", "text", "video", "photo", "source.label", "source.url"],
      columns: [
        { label: "日期", path: "year" },
        { label: "标题", path: "title", primary: true },
        { label: "媒体", render: (item) => [item.photo ? "照片" : "", item.video ? "视频" : ""].filter(Boolean).join(" + ") || "—" },
        { label: "出处", path: "source.label" },
        { label: "状态", path: "_status", type: "status" },
      ],
      defaultItem: () => ({ id: "", year: "", sortDate: "", title: "新时间线", text: "", photo: "", video: "", cover: "", source: { label: "", url: "" }, _status: "draft" }),
      needsSource: (item) => !item.source?.url,
      groups: groupsWithPublishing([
        { id: "basic", label: "基本信息", fields: [
          { path: "year", label: "展示日期", type: "text", required: true, help: "可以是“2002 前后”或“2019.09.13–14”等适合阅读的写法。" },
          { path: "sortDate", label: "排序日期", type: "date", help: "用于未来按时间自动排序；不影响展示日期。" },
          { path: "title", label: "标题", type: "text", required: true },
        ] },
        { id: "content", label: "正文", fields: [
          { path: "text", label: "事件正文", type: "textarea", required: true },
        ] },
        { id: "media", label: "关联媒体", fields: [
          { path: "photo", label: "照片", type: "asset" },
          { path: "video", label: "B 站 BV 号", type: "text", pattern: "^BV[0-9A-Za-z]+$", help: "例如 BV1dJ411c7zq。" },
          { path: "cover", label: "视频封面 URL", type: "url", help: "不填时会尝试复用糖点中相同 BV 号的封面。" },
        ] },
        { id: "source", label: "出处", fields: [
          { path: "source.label", label: "出处名称", type: "text" },
          { path: "source.url", label: "出处链接", type: "url" },
        ] },
      ]),
    },

    sugars: {
      label: "糖点",
      singular: "糖点",
      collection: "sugars",
      titlePath: "title",
      searchPaths: ["title", "tag", "story", "video", "by", "cover"],
      columns: [
        { label: "封面", path: "cover", type: "image" },
        { label: "标题", path: "title", primary: true },
        { label: "标签", path: "tag" },
        { label: "BV 号", path: "video" },
        { label: "上传者", path: "by" },
        { label: "状态", path: "_status", type: "status" },
      ],
      defaultItem: () => ({ id: "", title: "新糖点", tag: "", story: "", video: "", cover: "", by: "", sourceUrl: "", _status: "draft" }),
      needsSource: (item) => !item.sourceUrl && !item.video,
      groups: groupsWithPublishing([
        { id: "basic", label: "基本信息", fields: [
          { path: "title", label: "标题", type: "text", required: true },
          { path: "tag", label: "标签", type: "text", required: true },
          { path: "by", label: "视频上传者", type: "text", required: true },
        ] },
        { id: "content", label: "文案", fields: [
          { path: "story", label: "糖点说明", type: "textarea", required: true },
        ] },
        { id: "media", label: "视频", fields: [
          { path: "video", label: "B 站 BV 号", type: "text", required: true, pattern: "^BV[0-9A-Za-z]+$" },
          { path: "cover", label: "封面 URL", type: "url", required: true },
        ] },
        { id: "source", label: "来源", fields: [
          { path: "sourceUrl", label: "原始视频链接", type: "url", help: "不填写时主站会根据 BV 号自动生成 B 站链接。" },
        ] },
      ]),
    },

    photos: {
      label: "相册",
      singular: "相册图片",
      collection: "photos",
      titlePath: "caption",
      searchPaths: ["caption", "src", "alt", "creditId"],
      columns: [
        { label: "图片", path: "src", type: "image" },
        { label: "说明", path: "caption", primary: true },
        { label: "路径", path: "src" },
        { label: "版权记录", path: "creditId" },
        { label: "状态", path: "_status", type: "status" },
      ],
      defaultItem: () => ({ id: "", src: "", caption: "新图片", alt: "", creditId: "", _status: "draft" }),
      needsSource: (item) => !item.creditId,
      groups: groupsWithPublishing([
        { id: "image", label: "图片", fields: [
          { path: "src", label: "图片文件", type: "asset", required: true },
          { path: "caption", label: "图片说明", type: "text", required: true },
        ] },
        { id: "accessibility", label: "无障碍", fields: [
          { path: "alt", label: "替代文本", type: "textarea-compact", required: true, help: "描述照片里真正可见的内容，不要只重复文件名。" },
        ] },
        { id: "license", label: "授权", fields: [
          { path: "creditId", label: "版权记录 ID", type: "text", required: true, help: "在“版权”板块新建记录后，把它的 ID 填在这里。" },
        ] },
      ]),
    },

    music: {
      label: "音乐",
      singular: "音乐",
      collection: "music",
      titlePath: "label",
      searchPaths: ["label", "note", "bv", "youtube", "source"],
      columns: [
        { label: "名称", path: "label", primary: true },
        { label: "平台", render: (item) => item.bv ? "B 站" : item.youtube ? "YouTube" : "—" },
        { label: "平台 ID", render: (item) => item.bv || item.youtube || "—" },
        { label: "出处", path: "source" },
        { label: "状态", path: "_status", type: "status" },
      ],
      defaultItem: () => ({ id: "", label: "新音乐", note: "", bv: "", youtube: "", source: "", _status: "draft" }),
      needsSource: (item) => !item.source,
      groups: groupsWithPublishing([
        { id: "basic", label: "基本信息", fields: [
          { path: "label", label: "名称", type: "text", required: true },
          { path: "note", label: "说明", type: "textarea-compact", required: true },
        ] },
        { id: "platform", label: "平台嵌入", fields: [
          { path: "bv", label: "B 站 BV 号", type: "text", pattern: "^$|^BV[0-9A-Za-z]+$", help: "B 站与 YouTube 二选一。" },
          { path: "youtube", label: "YouTube 视频 ID", type: "text", help: "B 站与 YouTube 二选一。" },
        ] },
        { id: "source", label: "出处", fields: [
          { path: "source", label: "出处链接", type: "url", required: true },
        ] },
      ]),
    },

    sources: {
      label: "来源",
      singular: "来源",
      collection: "sources",
      titlePath: "label",
      searchPaths: ["label", "url", "level", "accessedAt"],
      columns: [
        { label: "标题", path: "label", primary: true },
        { label: "来源等级", path: "level" },
        { label: "访问日期", path: "accessedAt" },
        { label: "链接", path: "url" },
        { label: "状态", path: "_status", type: "status" },
      ],
      defaultItem: () => ({ id: "", label: "新来源", url: "", level: "媒体报道", accessedAt: "", _status: "draft" }),
      needsSource: (item) => !item.url,
      groups: groupsWithPublishing([
        { id: "basic", label: "基本信息", fields: [
          { path: "label", label: "来源标题", type: "text", required: true },
          { path: "level", label: "来源等级", type: "select", required: true, options: [
            { value: "官方", label: "官方" },
            { value: "一手采访", label: "一手采访" },
            { value: "媒体报道", label: "媒体报道" },
            { value: "粉丝记录", label: "粉丝记录" },
            { value: "资料整理", label: "资料整理" },
          ] },
          { path: "accessedAt", label: "访问日期", type: "date" },
        ] },
        { id: "link", label: "链接", fields: [
          { path: "url", label: "原始链接", type: "url", required: true },
        ] },
      ]),
    },

    credits: {
      label: "版权",
      singular: "图片版权",
      collection: "credits",
      titlePath: "title",
      searchPaths: ["title", "file", "author", "license", "source", "licenseUrl"],
      columns: [
        { label: "文件", path: "file", type: "image" },
        { label: "标题", path: "title", primary: true },
        { label: "作者", path: "author" },
        { label: "许可证", path: "license" },
        { label: "状态", path: "_status", type: "status" },
      ],
      defaultItem: () => ({ id: "", file: "", title: "新版权记录", author: "", license: "", licenseUrl: "", source: "", _status: "draft" }),
      needsSource: (item) => !item.source || !item.license,
      groups: groupsWithPublishing([
        { id: "image", label: "图片", fields: [
          { path: "file", label: "本地图片", type: "asset", required: true },
          { path: "title", label: "原始标题", type: "text", required: true },
        ] },
        { id: "license", label: "授权", fields: [
          { path: "author", label: "作者 / 摄影者", type: "text", required: true },
          { path: "license", label: "许可证", type: "text", required: true, help: "例如 CC BY-SA 4.0、CC0、Public domain。" },
          { path: "licenseUrl", label: "许可证链接", type: "url" },
        ] },
        { id: "source", label: "原始来源", fields: [
          { path: "source", label: "原始页面链接", type: "url", required: true },
        ] },
      ]),
    },

    assets: {
      label: "素材库",
      singular: "素材",
      virtual: true,
      titlePath: "label",
      searchPaths: ["label", "path", "kind", "usedBy"],
      columns: [
        { label: "预览", path: "path", type: "image" },
        { label: "文件 / 地址", path: "label", primary: true },
        { label: "类型", path: "kind" },
        { label: "大小", path: "sizeLabel" },
        { label: "引用位置", path: "usedBy", wrap: true },
      ],
      defaultItem: null,
      needsSource: () => false,
      groups: [],
    },
  };

  window.STUDIO_SCHEMAS = { MODULES };
})();
