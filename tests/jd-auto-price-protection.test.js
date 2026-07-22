"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const script = require("../scripts/jd-auto-price-protection.js");
const root = path.resolve(__dirname, "..");

function decodeHarText(container) {
  const text = container && container.text || "";
  return container && container.encoding === "base64"
    ? Buffer.from(text, "base64").toString("utf8")
    : text;
}

test("只保留京东登录所需的两个 Cookie 字段", () => {
  const cookie = "foo=1; pt_pin=user%40example; bar=2; pt_key=secret==;";
  assert.equal(script.sanitizeCookie(cookie), "pt_key=secret==; pt_pin=user%40example;");
  assert.equal(script.sanitizeCookie("pt_pin=only;"), "");
});

test("请求头匹配不区分大小写", () => {
  assert.equal(script.readHeader({ Cookie: "a=b", "user-agent": "ua" }, "cookie"), "a=b");
  assert.equal(script.readHeader({ Cookie: "a=b", "user-agent": "ua" }, "User-Agent"), "ua");
});

test("插件参数默认自动用券", () => {
  assert.deepEqual(script.readArguments(null), {
    jdCookie: "",
    useCoupon: true,
    showRunStatus: true
  });
  assert.equal(script.readArguments({ useCoupon: "false" }).useCoupon, false);
  assert.equal(script.readArguments({ showRunStatus: "false" }).showRunStatus, false);
  assert.equal(script.readArguments({ notifyAll: "false" }).showRunStatus, false);
});

test("首次申请复刻 HAR 的一键价保字段且不复用过期 h5st", () => {
  const form = new URLSearchParams(script.buildApplyForm("", null, 123456789));
  const body = JSON.parse(form.get("body"));

  assert.equal(form.get("functionId"), "mlproprice_skuOnceApply_jsf");
  assert.equal(form.get("appid"), "price_protection");
  assert.equal(form.get("loginType"), "2");
  assert.equal(form.get("h5st"), "");
  assert.equal(form.get("t"), "123456789");
  assert.deepEqual(body, {
    onceBatchId: "",
    couponConfirmFlag: null,
    appId: "cuser",
    uniformBizInfo: { data: { language: "zh_CN", buId: 301, tenantId: 1024 } },
    type: "25"
  });
});

test("优惠券确认请求使用批次号和 couponConfirmFlag=1", () => {
  const body = script.buildApplyBody("batch-123", 1);
  assert.equal(body.onceBatchId, "batch-123");
  assert.equal(body.couponConfirmFlag, 1);
});

test("识别成功、无差价、优惠券和登录失效响应", () => {
  assert.deepEqual(script.parseApiResponse({
    code: 0,
    data: { flag: true, succNum: 2, succAmount: 12.5, insuranceSuccAmount: 1.5 }
  }), {
    kind: "success",
    successCount: 2,
    successAmount: 12.5,
    insuranceAmount: 1.5,
    totalAmount: 14,
    message: "价保申请成功"
  });

  assert.equal(script.parseApiResponse({
    code: 0,
    data: { flag: true, succNum: 0, succAmount: 0, onceApplyNoSuccessTips: "当前无差价" }
  }).kind, "noop");

  assert.deepEqual(script.parseApiResponse({
    code: 0,
    data: { flag: false, onceBatchId: "batch-123", confirmCouponInfos: [{ couponId: "masked" }] }
  }), {
    kind: "coupon",
    onceBatchId: "batch-123",
    couponCount: 1,
    message: "检测到可用于价保的优惠券"
  });

  assert.equal(script.parseApiResponse({ code: 401, message: "未登录" }).kind, "auth");
});

test("从请求中捕获凭证时不保存其他 Cookie", () => {
  const credentials = script.captureCredentials({
    headers: {
      cookie: "pt_key=key; pt_pin=pin; __jda=tracking;",
      "User-Agent": "JD UA"
    }
  }, null, 1000);

  assert.deepEqual(credentials, {
    cookie: "pt_key=key; pt_pin=pin;",
    userAgent: "JD UA",
    capturedAt: 1000
  });
});

test("Loon 定时运行会在服务端要求时发起第二次用券请求", () => {
  const source = fs.readFileSync(path.join(root, "scripts/jd-auto-price-protection.js"), "utf8");
  const store = new Map([
    [script.STORE_KEY, JSON.stringify({
      cookie: "pt_key=fixture-key; pt_pin=fixture-pin;",
      userAgent: "Fixture UA",
      capturedAt: 1
    })]
  ]);
  const requests = [];
  const notices = [];
  let doneCount = 0;

  const context = {
    console: { log() {} },
    $argument: { useCoupon: true, showRunStatus: true },
    $persistentStore: {
      read(key) { return store.get(key) || null; },
      write(value, key) { store.set(key, value); return true; }
    },
    $notification: { post(...args) { notices.push(args); } },
    $httpClient: {
      post(options, callback) {
        requests.push(options);
        if (requests.length === 1) {
          callback(null, { status: 200 }, JSON.stringify({
            code: 0,
            data: { flag: false, onceBatchId: "batch-fixture", confirmCouponInfos: [{ couponId: "coupon-fixture" }] }
          }));
          return;
        }
        callback(null, { status: 200 }, JSON.stringify({
          code: 0,
          data: { flag: true, succNum: 1, succAmount: 3, insuranceSuccAmount: 0 }
        }));
      }
    },
    $done() { doneCount += 1; }
  };

  vm.runInNewContext(source, context, { filename: "jd-auto-price-protection.js" });

  assert.equal(requests.length, 2);
  assert.equal(doneCount, 1);
  assert.equal(requests[0].headers.Cookie, "pt_key=fixture-key; pt_pin=fixture-pin;");
  assert.equal(requests[0].headers.Origin, "https://h5.m.jd.com");
  assert.equal(requests[0].headers.Referer, "https://h5.m.jd.com/");
  assert.equal(requests[0].headers["X-Referer-Page"], undefined);
  const firstBody = JSON.parse(new URLSearchParams(requests[0].body).get("body"));
  const couponBody = JSON.parse(new URLSearchParams(requests[1].body).get("body"));
  assert.equal(firstBody.couponConfirmFlag, null);
  assert.equal(couponBody.onceBatchId, "batch-fixture");
  assert.equal(couponBody.couponConfirmFlag, 1);
  assert.ok(store.get("jd_auto_price_protection_last_run_at"));
  const history = JSON.parse(store.get(script.HISTORY_KEY));
  assert.equal(history.length, 1);
  assert.equal(history[0].usedCoupon, true);
  assert.equal(history[0].successCount, 1);
  assert.equal(history[0].totalAmount, 3);
  assert.equal(notices.length, 1);
  assert.equal(notices[0][1], "✅ 运行正常");
});

test("只保留最新 3 次价保申请记录", () => {
  let history = [];
  for (let index = 1; index <= 4; index += 1) {
    history = script.appendHistory(history, {
      kind: index === 4 ? "success" : "noop",
      successCount: index === 4 ? 1 : 0,
      totalAmount: index === 4 ? 5 : 0,
      message: "第 " + index + " 次"
    }, index === 4, index * 1000);
  }

  assert.equal(history.length, 3);
  assert.deepEqual(history.map((record) => record.timestamp), [4000, 3000, 2000]);
  assert.equal(history[0].usedCoupon, true);
  assert.equal(history[0].message, "成功 1 笔，预计返还 5 元（已用券）");
});

test("Loon 手动查看入口展示本地记录且不发送网络请求", () => {
  const source = fs.readFileSync(path.join(root, "scripts/jd-auto-price-protection.js"), "utf8");
  const history = [{
    timestamp: new Date(2026, 6, 22, 12, 30).getTime(),
    kind: "noop",
    usedCoupon: false,
    successCount: 0,
    totalAmount: 0,
    message: "当前无差价"
  }];
  const notices = [];
  let doneCount = 0;

  vm.runInNewContext(source, {
    console: { log() {} },
    $argument: "action=history",
    $persistentStore: {
      read(key) { return key === script.HISTORY_KEY ? JSON.stringify(history) : null; },
      write() { throw new Error("查看历史时不应写入存储"); }
    },
    $notification: { post(...args) { notices.push(args); } },
    $httpClient: { post() { throw new Error("查看历史时不应发送网络请求"); } },
    $done() { doneCount += 1; }
  }, { filename: "jd-auto-price-protection.js" });

  assert.equal(doneCount, 1);
  assert.equal(notices.length, 1);
  assert.equal(notices[0][1], "✅ 运行正常");
  assert.match(notices[0][2], /状态：✅ 运行正常/);
  assert.match(notices[0][2], /2026-07-22 12:30/);
  assert.match(notices[0][2], /当前无差价/);
});

test("最近记录健康状态明确区分正常、失败和超时", () => {
  const now = new Date(2026, 6, 22, 16, 0).getTime();
  const recent = [{ timestamp: now - 60 * 60 * 1000, kind: "noop", message: "当前无差价" }];
  const failed = [{ timestamp: now - 10 * 60 * 1000, kind: "error", message: "接口返回格式异常" }];
  const stale = [{ timestamp: now - 181 * 60 * 1000, kind: "noop", message: "当前无差价" }];

  assert.equal(script.evaluateHealth([], now).label, "⚠️ 尚未运行");
  assert.equal(script.evaluateHealth(recent, now).label, "✅ 运行正常");
  assert.equal(script.evaluateHealth(failed, now).label, "❌ 运行失败");
  assert.match(script.evaluateHealth(failed, now).detail, /接口返回格式异常/);
  assert.equal(script.evaluateHealth(stale, now).label, "❌ 运行失败");
  assert.match(script.evaluateHealth(stale, now).detail, /超过 3 小时/);
});

test("没有登录凭证时明确提示运行失败", () => {
  const source = fs.readFileSync(path.join(root, "scripts/jd-auto-price-protection.js"), "utf8");
  const notices = [];
  const store = new Map();
  let doneCount = 0;

  vm.runInNewContext(source, {
    console: { log() {} },
    $argument: { showRunStatus: true },
    $persistentStore: {
      read(key) { return store.get(key) || null; },
      write(value, key) { store.set(key, value); return true; }
    },
    $notification: { post(...args) { notices.push(args); } },
    $httpClient: { post() { throw new Error("没有凭证时不应发送网络请求"); } },
    $done() { doneCount += 1; }
  }, { filename: "jd-auto-price-protection.js" });

  assert.equal(doneCount, 1);
  assert.equal(notices.length, 1);
  assert.equal(notices[0][1], "❌ 运行失败");
  assert.match(notices[0][2], /未找到京东登录凭证/);
});

test("插件每 30 分钟检查并由本地时间戳保持 2.5 小时间隔", () => {
  const plugin = fs.readFileSync(path.join(root, "plugins/JD-Auto-Price-Protection.plugin"), "utf8");
  assert.match(plugin, /cron "\*\/30 \* \* \* \*"/);
  assert.match(plugin, /useCoupon = switch,true/);
  assert.match(plugin, /showRunStatus = switch,true/);
  assert.match(plugin, /hostname = api\.m\.jd\.com/);
  assert.match(plugin, /generic .*tag=查看最近3次价保记录,argument="action=history"/);
  assert.doesNotMatch(plugin, /2RePMzTqg6UoffvMwtwVeMcnPGeg/);

  const base = Date.UTC(2026, 6, 22, 22, 30);
  assert.equal(script.isRunDue(base + 149 * 60 * 1000, base), false);
  assert.equal(script.isRunDue(base + 150 * 60 * 1000, base), true);
  assert.equal(script.isRunDue(base + 150 * 60 * 1000, 0), true);
});

test("jd.har 与实现的一键价保契约一致", { skip: !fs.existsSync(path.join(root, "jd.har")) }, () => {
  const har = JSON.parse(fs.readFileSync(path.join(root, "jd.har"), "utf8"));
  const entry = har.log.entries.find((candidate) => {
    const postData = candidate.request.postData || {};
    const form = new URLSearchParams(decodeHarText(postData));
    return form.get("functionId") === script.FUNCTION_ID;
  });

  assert.ok(entry, "HAR 中应存在一键价保请求");
  const capturedForm = new URLSearchParams(decodeHarText(entry.request.postData));
  const capturedBody = JSON.parse(capturedForm.get("body"));
  const generatedBody = script.buildApplyBody("", null);

  assert.equal(capturedForm.get("appid"), "price_protection");
  assert.equal(capturedForm.get("loginType"), "2");
  assert.deepEqual(Object.keys(generatedBody).sort(), Object.keys(capturedBody).sort());
  assert.deepEqual(generatedBody.uniformBizInfo, capturedBody.uniformBizInfo);
  assert.equal(generatedBody.type, capturedBody.type);
  assert.doesNotMatch(capturedForm.get("body"), /2RePMzTqg6UoffvMwtwVeMcnPGeg/);

  const capturedResponse = JSON.parse(decodeHarText(entry.response.content));
  assert.equal(capturedResponse.code, 0);
  assert.equal(script.parseApiResponse(capturedResponse).kind, "noop");
});

test("受版本控制的文件不包含 HAR 登录凭证", () => {
  const files = [
    "README.md",
    "plugins/JD-Auto-Price-Protection.plugin",
    "scripts/jd-auto-price-protection.js"
  ];
  const trackedText = files.map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n");

  assert.doesNotMatch(trackedText, /pt_key=[A-Za-z0-9_-]{8,}/);
  assert.doesNotMatch(trackedText, /pt_pin=[^;\s]{3,}/);
  assert.doesNotMatch(trackedText, /jdd03[A-Z0-9]{20,}/);
  assert.doesNotMatch(trackedText, /\bh5st=[^&\s]{20,}/);
});
