# Loon Plugins

个人维护的 Loon 插件集合。插件基于实际网络请求制作，尽量只处理目标接口，避免影响应用的正常功能。

## 插件列表

### 抖音屏蔽指定用户消息（实验版）

按发送者 UID 过滤两个指定私聊会话中的 Protobuf 消息记录，保留本人发送的消息及其他会话。插件配置提供“屏蔽阿沁”和“屏蔽老马”两个独立开关。

当前版本基于抖音 PC Web IM 接口抓包制作，并兼容匹配抖音移动端常见的 `imapi*.zijieapi.com` 主机。实时长连接推送可能仍会短暂显示，重新进入会话或刷新历史记录后才会触发过滤。

Loon 插件订阅地址：

```text
https://raw.githubusercontent.com/gj0134/Loon-Plugins/main/plugins/Douyin-Block-User.plugin
```

启用前请确认 Loon 的 MITM 证书已经安装并信任。插件不会 MITM `frontier` 长连接，避免影响私聊发送。

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

### 知乎去广告（保留回答上下切换）

基于知乎去广告规则调整，保留原有广告过滤能力，同时恢复回答详情页的上一条/下一条回答切换。

与上游版本相比，仅取消了对 `next-render?id=…&type=answer` 接口的整接口清空，避免回答连续浏览功能被误伤。

Loon 插件订阅地址：

```text
https://raw.githubusercontent.com/gj0134/Loon-Plugins/main/plugins/Zhihu-AdBlock-Answer-Swipe.plugin
```

安装本版本前，请先停用或删除其他知乎去广告插件，避免相同接口被旧规则继续拦截。

## 说明

- 插件不会修改账号、会员或付费数据。
- 应用接口可能随版本更新；如果广告重新出现，需要重新抓包适配。
- 请勿公开分享包含 Cookie、Token 等登录信息的 HAR 或 PCAP 文件。
