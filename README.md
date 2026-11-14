# 拾卷

「拾卷」是一个基于 **uni-app + Vue 3** 的电子书阅读器，可直接导入 HBuilderX 运行到 Android / iOS，也可以构建 H5。

它的核心设计是**书源与 App 解耦**：书源及其解析规则放在独立仓库 [shijuan-sources](../shijuan-sources)，站点改版时只更新书源仓库，不必重新发布 App。

## 功能

- **书架**：本地保存藏书、阅读进度、最近阅读；封面、进度、长按管理。
- **聚合搜索**：同时搜索多个书源，按书名 + 作者聚合结果，可切换来源。
- **阅读器**：宣纸 / 青笺 / 素灰 / 夜读四套主题；字号、行距、宋体/黑体；章节分页目录、进度记忆、自动下一章、屏幕常亮。
- **离线缓存**：整本 / 从当前章到结尾 / 仅当前章下载；书架显示离线标记，断网也能读已缓存章节。
- **书源管理**：导入/导出 Legado 兼容 JSON；启用停用、编辑、体检（搜索 → 详情 → 目录 → 正文）。
- **智能识别书源**：输入网站地址 + 一本示例书名，自动识别搜索入口、详情、目录和正文，生成可保存的书源。
- **独立书源仓库**：支持 GitHub / Gitee / 静态 `index.json` 订阅与手动同步；启动时静默检查版本。
- **链接添加**：对没有搜索入口的站点，可粘贴书籍页链接，使用已有源规则或自动识别直接阅读。
- **在线升级**：读取 GitHub / Gitee Release 或静态清单，App 内下载 APK/WGT 并安装；启动静默检查。
- **公版书**：内置古登堡计划 JSON 源，可阅读公版英文书。

## 快速开始

### 环境

- Node.js 18+
- HBuilderX 4.x/5.x（App 打包需要）
- Android 真机或模拟器（可选）

### H5 预览

```bash
npm install
npm run dev:h5
```

H5 开发环境会自动通过 Vite 本地代理请求小说站（`/__proxy`），避免浏览器 CORS。

### HBuilderX 运行

1. 打开 HBuilderX，直接打开/拖入项目根目录 `D:\code\shijuan-reader`。
2. 在 `src/manifest.json` 的“基础配置”中点击“重新获取 AppID”（云打包需要 DCloud AppID）。
3. 运行 → 运行到浏览器 / 运行到手机或模拟器。
4. 发行 → 原生 App 云打包，选择 Android。

命令行验证编译：

```bash
D:\download\HBuilderX\cli.exe launch web --project D:\code\shijuan-reader --compile true
```

> 如果 HBuilderX 报 `uni is not a function`，通常是根 `package.json` 带了 `"type": "module"`，导致 Vite 以 ESM 方式加载 CJS 插件。本项目已通过“根目录不加 type、`src/package.json` 声明 ESM”解决；不要手动改回。

### 构建

```bash
npm run build:h5
npm test
npm run verify              # 联网验证内置书源
node tools/verify-autodetect.mjs  # 联网验证智能识别
```

## 书源与独立仓库

App 内置 5 个书源作为冷启动：

| 书源 | 解析方式 |
| --- | --- |
| 八五中文网 | GBK 页面 + CSS 规则 |
| 全本小说网 | UTF-8 + AMP 完整目录 |
| 顶点小说网 | UTF-8 + CSS 规则 |
| 古登堡计划 | JSON API + 单章全文 |
| 笔趣阁（yoboi） | 分类页建索引搜索 + 正文分页 |

更多书源由独立仓库提供：

- 仓库：`../shijuan-sources`（GitHub/Gitee 上的 `owner/shijuan-sources`）
- 配置入口：书源页 → 书源仓库 → 配置
- 支持 GitHub（jsDelivr CDN，失败回退 raw）、Gitee、静态 `index.json`
- App 启动时静默检查清单版本，12 小时内最多一次；也可手动同步

### 不同解析方法如何在仓库里区分

每个书源 JSON 自己声明策略，App 只做通用解释，不需要为每个站点改代码：

- `searchMode: "crawl-index"`：站点没有搜索时，用 `indexPagePattern` 抓分类页建书名索引（yoboi）。
- `type: "json"` + `$` JSONPath：JSON API 书源（古登堡）。
- `searchMethod` / `searchBody` / `searchCharset`：POST 搜索与 GBK 编码站点。
- `ruleContent.nextContentUrl` + 正文分页边界：章节拆成多页的站点。
- `singleChapter`：整本书只有一个正文页。
- `direct: true`：仅通过书籍链接解析，不参与书名搜索。
- `charset: "auto" | "gbk" | "utf-8"`：按站点编码解码。

新增一个使用**已有策略**的书源，只需在仓库里加 JSON、更新 `index.json` 并提交，App 无需发版。只有需要**全新策略**时才需要更新 App 引擎，并递增清单里的 `engine` 版本；App 会提示不兼容。出于安全考虑，App **不会执行仓库里的任意 JavaScript**，所有规则都是声明式数据。

详见 [shijuan-sources/README.md](../shijuan-sources/README.md)。

## 在线升级

两种方式（二选一或同时配置）：

1. **代码仓库 Release**：在“我的 → 在线升级 → 更新源”填 `owner/repo`，App 读取 Latest Release，自动选择 `.apk` 或 `.wgt` 附件。
2. **静态清单**：填 `update.json` 地址（jsDelivr / GitHub Pages / 对象存储），适合 GitHub API 受限的网络。

发布流程见 [docs/RELEASE.md](docs/RELEASE.md)。核心约定：

- 每次发布递增 `src/manifest.json` 的 `versionName` / `versionCode`，并同步 `src/config.js`。
- Release 正文可以写 `versionCode: 102`；不写则按语义版本比较。
- 正文包含 `[force]` 或 `强制更新` 时标记为强制更新。
- APK 安装需要 `REQUEST_INSTALL_PACKAGES` 权限（已在 manifest 中配置）。
- WGT 热更新要求 AppID / 版本基线一致，正式包仍建议 APK 更新。

## 项目结构

```
src/
  core/            解析引擎、请求、编码、书源、仓库、升级、本地数据
  components/      导航栏、封面、空状态、底部面板
  pages/           书架、书城、书源、我的、详情、阅读器、智能识别、链接添加
  utils/           格式化与小交互
  config.js        应用元信息、更新仓库、书源仓库默认值
  pages.json / manifest.json
tests/             60 项零依赖单测
tools/             开发代理、书源验证、智能识别验证、图标生成
```

## 法律与使用边界

拾卷只提供书源解析和阅读界面，不存储、不传播小说正文。书源仓库只维护“如何解析公开网页”的声明式规则。请仅访问你拥有阅读权限的内容，遵守目标网站的服务条款与当地法律。番茄小说等正版平台的内容请优先在官方渠道阅读。

## License

代码仅供个人学习与自用。第三方书源与内容版权归各自权利人所有。
