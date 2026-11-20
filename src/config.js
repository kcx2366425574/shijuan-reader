/**
 * 应用级配置。
 *
 * 在线升级两种方式（二选一或同时配置）：
 * 1. 代码仓库 Release：填写 repo（如 "your-name/shijuan-reader"），
 *    应用读取 GitHub/Gitee 最新 Release，自动挑选 .apk（或 .wgt）资源。
 * 2. 静态清单：填写 manifestUrl，指向仓库中的 update.json 或 jsDelivr 地址。
 *    适合 GitHub API 被限流/访问不稳的网络环境。
 *
 * 发布新版本时，请同步修改 manifest.json 与这里的 versionName/versionCode。
 */

export const APP_META = {
  name: '拾卷',
  versionName: '1.0.5',
  versionCode: 105,
  slogan: '把喜欢的书，收进一卷里',
  update: {
    provider: 'github',
    repo: 'kcx2366425574/shijuan-reader',
    manifestUrl: '',
    releasePage: '',
    autoCheck: true
  },
  sourceRepo: {
    provider: 'github',
    repo: 'kcx2366425574/shijuan-sources',
    branch: 'main',
    manifestUrl: '',
    autoSync: true
  },
  disclaimer: '拾卷只提供书源解析与阅读界面，不存储、不传播小说内容。请仅访问你拥有阅读权限的内容，并遵守目标网站的服务条款与当地法律。'
}
