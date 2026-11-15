# 发布与在线升级

## 一、版本号

发布前同步三处：

1. `src/manifest.json` 的 `versionName` / `versionCode`
2. `src/config.js` 的 `APP_META.versionName` / `versionCode`
3. Release 正文中的 `versionCode: N`

`versionCode` 必须是递增整数；升级判断优先用它，缺失时按 `versionName` 语义版本比较。

## 二、构建 APK / WGT

1. HBuilderX 打开项目，确认 manifest 中已获取 DCloud AppID。
2. 运行到手机确认功能正常。
3. 发行 → 原生 App 云打包 → Android：
   - 使用自有证书或 DCloud 公共测试证书
   - 记录包名、版本号
4. **APK 必须先重命名再上传**。HBuilderX 默认输出在 `dist/release/apk/`，文件形如 `__UNI__E05B11F__20261115024243.apk`；统一改为：
   ```text
   <项目slug>-v<versionName>-<versionCode>.apk
   ```
   本项目示例：`shijuan-v1.0.3-103.apk`。任何项目、任何 APK 都不得直接使用 HBuilderX 默认文件名交付。
5. 如需热更新，额外生成 WGT 资源包（App 资源升级包）。WGT 要求版本基线一致，跨大版本仍建议整包 APK。

## 三、发布到 GitHub / Gitee Release

1. 推送代码并打 tag：`v1.0.3`
2. 创建 Release，上传：
   - `shijuan-v1.0.3-103.apk`（必须）
   - `shijuan-v1.0.3-103.wgt`（可选）
3. 正文示例：

```text
versionCode: 103
- 修复书源同步失败的问题
- 阅读器新增行距调节

[force] 仅在确实需要强制升级时添加
```

4. 在 App「我的 → 在线升级 → 更新源」填 `owner/repo`，选择 GitHub 或 Gitee。

GitHub 读取路径：`https://api.github.com/repos/{repo}/releases/latest`，未配置静态清单时 App 通过 jsDelivr 读取书源仓库，升级 API 则直连 GitHub。
Gitee 读取路径：`https://gitee.com/api/v5/repos/{repo}/releases/latest`。

## 四、静态 update.json（推荐备用）

适合 GitHub API 限流或被墙的网络。把 `update.json` 放到仓库根目录，用 jsDelivr：

```text
https://cdn.jsdelivr.net/gh/owner/repo@main/update.json
```

字段：

```json
{
  "versionName": "1.0.3",
  "versionCode": 103,
  "notes": "修复若干问题",
  "apkUrl": "https://github.com/owner/repo/releases/download/v1.0.3/shijuan-v1.0.3-103.apk",
  "wgtUrl": "",
  "pageUrl": "https://github.com/owner/repo/releases/tag/v1.0.3",
  "force": false,
  "publishedAt": "2026-11-15",
  "size": 12345678
}
```

生成工具：

```bash
node tools/make-update-json.mjs \
  --version 1.0.3 --code 103 \
  --apk https://example.com/shijuan-v1.0.3-103.apk \
  --notes "修复若干问题" \
  --out update.json
```

然后在 App 更新源中选择“静态清单”，填入该地址。

## 五、App 内升级流程

1. 启动时静默检查（可在“我的”关闭），发现新版本给“我的”Tab 加红点。
2. 用户打开「我的 → 在线升级」查看版本说明。
3. `plus.downloader` 下载到 `_doc/shijuan-update.apk`，显示进度。
4. `plus.runtime.install` 拉起系统安装；首次安装需要允许“安装未知应用”。
5. H5 环境退化为打开下载/发布页。

## 六、代码签名与安全

- 不要提交签名证书、密码、AppID 私密信息。
- 更新下载地址应使用 HTTPS。
- 不建议在 Release 中提供可执行脚本；App 只安装 APK/WGT。
