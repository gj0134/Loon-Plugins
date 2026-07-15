# Loon Plugins

个人维护的 Loon 插件集合。插件基于实际网络请求制作，尽量只处理目标接口，避免影响应用的正常功能。

## 插件列表

### 抖音屏蔽指定用户消息

按发送者 UID 过滤指定私聊会话中的 Protobuf 消息记录，保留本人发送的消息及其他会话。插件配置提供“屏蔽阿沁的消息”“屏蔽老马的消息”两个独立开关，以及一个用于排查问题的“调试日志”开关。

**仅对抖音网页版（PC Web）有效。** 网页版通过 `imapi.douyin.com/v1/message/get_*` 这类独立 HTTP 接口拉取消息历史，脚本可在响应的 Protobuf 层删除目标用户的消息。

**iOS 客户端不适用。** 经实测，手机版的私信（实时推送与历史消息）全部走 `frontier` / `klink` / `bsync` 等加密长连接同步，不经过任何可被脚本处理的独立 HTTP 请求；即便逐一 REJECT 这些长连接，App 也只会切换到下一条加密通道，而不会回落到 HTTP。这些长连接 Loon 无法解密，也无法从持续的数据流中逐条删除消息。因此 App 端如需屏蔽某人，请使用抖音自带的「消息免打扰」或拉黑功能。

Loon 插件订阅地址：

```text
https://raw.githubusercontent.com/gj0134/Loon-Plugins/main/plugins/Douyin-Block-User.plugin
```

启用前请确认 Loon 的 MITM 证书已经安装并信任。

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
