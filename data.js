// 所有内容都在这里改。想加新糖点/照片，照着已有条目复制一份改字段即可。
// 视频填 B 站 BV 号；cover 是 B 站视频封面（外链，不下载）。
// photos 只放有授权的照片（Wikimedia Commons 等），或你自己拍的照片。

window.SITE = {
  people: [
    {
      id: "hins",
      name: "张敬轩",
      en: "Hins Cheung",
      nick: "轩仔 · 张生",
      photo: "images/hins-2022-portrait.jpg",
      intro:
        "1981 年生于广州，2002 年前后出道的香港创作歌手。写词写曲、做监制，演唱会上习惯把心事说成玩笑。",
    },
    {
      id: "kenny",
      name: "关智斌",
      en: "Kenny Kwan",
      nick: "KK · 关生",
      photo: "images/kenny-2019.jpg",
      intro:
        "Boy'z 组合成员，后来唱演两栖。会吹色士风，笑起来眼睛很亮；被张敬轩当众吐槽“慳”了十几年。",
    },
  ],

  timeline: [
    {
      year: "2002 前后",
      title: "识于微时",
      text:
        "两人在差不多的时间出道，公司不同，却很早就成了朋友。后来张敬轩说起关智斌，用的词是“公事上嘅同事，私人生活係出生入死嘅战友”。",
      photo: "images/kenny-2006.jpg",
    },
    {
      year: "2010",
      title: "“以他咁慳嘅性格”",
      text:
        "张敬轩搬新居，被报道和关智斌同居。他笑着否认，说只是一班朋友一起玩，还顺手吐槽：“以他那么节俭的性格，很少送礼物给我。”否认得一本正经，吐槽得一脸宠溺。",
      source: { label: "中新网 2010-02-01", url: "http://www.chinanews.com.cn/yl/yl-mxzz/news/2010/02-01/2101476.shtml" },
    },
    {
      year: "2018.10.16",
      title: "Boy'z 演唱会 · 《预言书》",
      text:
        "张敬轩在台下帮忙调音，安可时被关智斌请上台。没做造型、像街坊一样的他就这样上去了，一起唱了他为关智斌作曲的《预言书》。",
      video: "BV1Kt411f7uP",
      cover: "https://i2.hdslb.com/bfs/archive/avsas_i181017ws205nlzqg4rtw42nrxcaaa5h_0022.jpg",
    },
    {
      year: "2019.09.13–14",
      title: "Kenny is Born · “欢迎嚟到相敬如斌演唱会”",
      text:
        "关智斌红馆个唱，张敬轩做嘉宾。一黑一白西装，钢琴合奏《情陷百老汇》、对唱《笑忘书》。他开口就是“欢迎嚟到『相敬如斌』演唱会”；台下喊“结婚”，两人扮聋。尾场他唱《只是太爱你》，说：“我很少同人提起，这首歌第一个收到 demo 的人，是关智斌。”",
      video: "BV1dJ411c7zq",
      source: { label: "东方日报 2019-09-15", url: "https://orientaldaily.on.cc/cnt/entertainment/20190915/00282_001.html" },
    },
    {
      year: "2021.02",
      title: "“出生入死嘅战友”",
      text:
        "被记者问到两人感情是不是淡了，张敬轩答：“冇淡，我同佢有好多关系，公事上嘅同事，私人生活係出生入死嘅战友。我哋呢排有倾电话。”",
      photo: "images/hins-leon-2021.jpg",
      source: { label: "东方日报 2021-02-24", url: "https://orientaldaily.on.cc/cnt/entertainment/20210224/00282_008.html" },
    },
    {
      year: "2025",
      title: "还在互相出现",
      text:
        "谢霆锋演唱会现场，记者采访关智斌时一句“喂呀，张敬轩你唔好走！”成了新梗；同年关智斌开演唱会，粉丝记录到张敬轩给他的乐队和音乐总监送了花篮。二十多年了，还在。",
      video: "BV151LRzNEaU",
      photo: "images/kenny-eeg.jpg",
    },
  ],

  sugars: [
    {
      title: "世纪之吻 · 眼红馆",
      tag: "2019 红馆",
      story:
        "Kenny is Born 尾场安可，容祖儿起哄“一人一吻”。全场尖叫的那几秒，被粉丝称为“世纪之吻”。",
      video: "BV1WT411L7F7",
      cover: "https://i1.hdslb.com/bfs/archive/2ab8431b63322c3497b3eb0d3c0a266974502750.jpg",
      by: "stella_hk",
    },
    {
      title: "情陷百老汇 + 笑忘书 + 只是太爱你",
      tag: "2019 红馆 · 必看",
      story:
        "入坑教材。“这首歌曾经你看着我写下的啦”，真心话当玩笑讲，讲完再唱一首《只是太爱你》。",
      video: "BV1dJ411c7zq",
      cover: "https://i1.hdslb.com/bfs/archive/1e0f5eb8e62ccdf1d3596f9c6679cc34dd5daac5.jpg",
      by: "GSzhan",
    },
    {
      title: "水果篮事件",
      tag: "2019 红馆 · 搞笑",
      story:
        "张敬轩嫌做嘉宾“利是都冇封”，然后自己送上巨型果篮：炼奶（“Kenny Kwan 吖嘛，KK”）、鲜淮山、菠萝、火龙果，一边送一边叫观众“唔好心邪”。",
      video: "BV1ZJ411a7uV",
      cover: "https://i2.hdslb.com/bfs/archive/12a6401c797bcebeb5744b3a8e3429f801507f91.jpg",
      by: "張軒嘅包袱",
    },
    {
      title: "容祖儿：我只磕真情侣",
      tag: "圈内认证",
      story: "好朋友容祖儿的一句玩笑，被 CP 粉奉为名场面。",
      video: "BV11h4y1z7ys",
      cover: "https://i0.hdslb.com/bfs/archive/340ffb69b387a9efc83bff8aa343252a44e4b1ef.jpg",
      by: "Bili-omega",
    },
    {
      title: "拉阔同台《死性不改》",
      tag: "早年同台",
      story: "两人在拉阔音乐会上合唱《死性不改》，被称为“历史性同台”。",
      video: "BV1ns411j7Hr",
      cover: "https://i2.hdslb.com/bfs/archive/e8dad36d7e5327dcac45ae8078da61fa68d27345.jpg",
      by: "八个半的福思圆Hins",
    },
    {
      title: "《预言书》demo",
      tag: "写给他的歌",
      story: "张敬轩在社交平台分享《预言书》demo 片段，粉丝逐句分析。",
      video: "BV1tf4y1m7F3",
      cover: "https://i2.hdslb.com/bfs/archive/e474c7578ef3d8b456030ba182bbb81f320508ef.jpg",
      by: "張軒嘅包袱",
    },
    {
      title: "终于笑着唱的《预言书》",
      tag: "2023 REVISIT",
      story: "2023 年张敬轩自己的演唱会上再唱《预言书》，这一次是笑着唱的。",
      video: "BV1VP411Q7sP",
      cover: "https://i0.hdslb.com/bfs/archive/66d21e06bf5f5e956605f51e151818aa6309fb61.jpg",
      by: "CharlotteTerror",
    },
    {
      title: "余震（16–18 年）",
      tag: "分开又回来",
      story: "粉丝剪的“余震期”合集：疏远、沉默，再到重新同框。",
      video: "BV1Mt41197hv",
      cover: "https://i1.hdslb.com/bfs/archive/988b7de751341198f4b45410f906ad299d97664b.jpg",
      by: "带我去海边吹吹风吧",
    },
    {
      title: "“多谢你不介意同我传绯闻”",
      tag: "混剪",
      story: "B 站播放量最高的 HinsKenny 混剪之一，适合入坑第一条。",
      video: "BV1rK4y1Q7Go",
      cover: "https://i1.hdslb.com/bfs/archive/bcc6f6ab88cc37c7eb08b9c83fa26edd0f79167e.jpg",
      by: "朝九seven",
    },
    {
      title: "“张敬轩你唔好走！”",
      tag: "2025",
      story: "谢霆锋演唱会现场的采访，记者一句话就把两个人又拉回了同一条新闻。",
      video: "BV151LRzNEaU",
      cover: "https://i0.hdslb.com/bfs/archive/997567057fe39ccd09c2ae0e785b6f7b6dcc9f7f.jpg",
      by: "當天三歲的波板糖",
    },
  ],

  photos: [
    { src: "images/hins-2007.jpg", caption: "张敬轩 · 2007" },
    { src: "images/kenny-2006.jpg", caption: "关智斌 · 2006" },
    { src: "images/hins-2008.jpg", caption: "张敬轩演唱会 · 2008" },
    { src: "images/hins-2014.jpg", caption: "张敬轩 · 顾嘉煇中大音乐会 2014" },
    { src: "images/kenny-2019.jpg", caption: "关智斌 · 2019" },
    { src: "images/hins-leon-2021.jpg", caption: "张敬轩与黎明 · 红馆 2021" },
    { src: "images/hins-2022-portrait.jpg", caption: "The Next 20 演唱会 · 2022" },
    { src: "images/hins-2022-stage-a.jpg", caption: "The Next 20 · 2022.05.27" },
    { src: "images/hins-2022-stage-b.jpg", caption: "The Next 20 · 360 互动环节" },
    { src: "images/hins-2022-stage-c.jpg", caption: "The Next 20 · 2022.05.27" },
    { src: "images/hins-next20.jpg", caption: "THE NEXT 20 HINS LIVE IN HK" },
    { src: "images/hins-20221113.jpg", caption: "张敬轩 · 2022.11" },
    { src: "images/kenny-eeg.jpg", caption: "关智斌 · 英皇 25+ 星光大道" },
    { src: "images/hins-2025-b.jpg", caption: "张敬轩 · 2025.06" },
  ],

  sources: [
    { label: "中新网：张敬轩澄清同居传闻（2010）", url: "http://www.chinanews.com.cn/yl/yl-mxzz/news/2010/02-01/2101476.shtml" },
    { label: "东方日报：关智斌又喊又笑 軒仔送抱（2019）", url: "https://orientaldaily.on.cc/cnt/entertainment/20190915/00282_001.html" },
    { label: "东方日报：与关智斌感情冇淡（2021）", url: "https://orientaldaily.on.cc/cnt/entertainment/20210224/00282_008.html" },
    { label: "YouTube：Kenny is Born 特别嘉宾张敬轩（尾场足版）", url: "https://www.youtube.com/watch?v=vTmoPOvKMk0" },
    { label: "豆瓣：hinskenny 豆列", url: "https://m.douban.com/doulist/155813237/" },
  ],
};
