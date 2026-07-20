# Loon Plugins

个人维护的 Loon 插件集合。插件基于实际网络请求制作，尽量只处理目标接口，避免影响应用的正常功能。

## 插件列表

### 斗鱼直播间去广告

移除斗鱼直播间中的：

- 视频下方横幅广告
- 右下角悬浮游戏卡片
- 房间推送广告
- 第三方 SDK 广告配置及预加载素材

适配信息：斗鱼 iOS 8.180，2026-07-14 实际抓包验证。

Loon 插件订阅地址：

```text
https://raw.githubusercontent.com/gj0134/Loon-Plugins/main/plugins/Douyu-AdBlock.plugin
```

在 Loon 的插件页面添加上述 URL，启用插件，并确认 MITM 证书已经安装和信任。启用后请强制关闭斗鱼再重新打开。

### 知乎净化（去广告 + 隐藏付费内容）

基于知乎 iOS 11.1.0（2026-07-20）实际抓包优化，处理：

- 开屏广告、信息流广告、回答连续浏览广告
- 盐选推荐、付费视频试读及其他带明确付费标识的推荐内容
- 热榜推广、页面悬浮广告、优惠券、盐粒任务和引导弹窗
- 回答/文章详情页中的商业推广模块

插件只隐藏付费内容入口，不会破解、解锁或修改会员状态。`next-render` 采用条目级过滤，正常回答会保留，因此仍可上下切换浏览。

Loon 插件订阅地址：

```text
https://raw.githubusercontent.com/gj0134/Loon-Plugins/main/plugins/Zhihu-AdBlock-Answer-Swipe.plugin
```

安装本版本前，请先停用或删除其他知乎去广告插件，避免相同接口被旧规则继续拦截。

### 知乎净化（盐选过滤可开关，独立版）

这是独立插件，不会覆盖上面的固定过滤版。广告始终过滤，“过滤盐选会员内容”参数可自行切换：

- 开启（默认）：隐藏盐选推荐、付费视频试读等明确付费内容。
- 关闭：保留盐选及付费内容，只执行广告过滤。

Loon 插件订阅地址：

```text
https://raw.githubusercontent.com/gj0134/Loon-Plugins/main/plugins/Zhihu-AdBlock-Configurable.plugin
```

固定版与开关版不要同时启用。切换参数后请强制关闭知乎再重新打开。

## 说明

- 插件不会修改账号、会员或付费数据。
- 应用接口可能随版本更新；如果广告重新出现，需要重新抓包适配。
- 请勿公开分享包含 Cookie、Token 等登录信息的 HAR 或 PCAP 文件。
