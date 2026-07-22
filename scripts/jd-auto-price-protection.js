// JD automatic price protection for Loon.
// Credentials are kept in Loon's local persistent store and are never embedded here.

"use strict";

var STORE_KEY = "jd_auto_price_protection_credentials_v1";
var AUTH_NOTICE_KEY = "jd_auto_price_protection_auth_notice_at";
var MISSING_NOTICE_KEY = "jd_auto_price_protection_missing_notice_at";
var LAST_RUN_KEY = "jd_auto_price_protection_last_run_at";
var HISTORY_KEY = "jd_auto_price_protection_history_v1";
var RUN_INTERVAL_MS = 150 * 60 * 1000;
var HEALTH_STALE_MS = 180 * 60 * 1000;
var HISTORY_LIMIT = 3;
var API_URL = "https://api.m.jd.com/";
var FUNCTION_ID = "mlproprice_skuOnceApply_jsf";
var DEFAULT_USER_AGENT = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function readHeader(headers, name) {
  if (!headers || typeof headers !== "object") {
    return "";
  }

  var expected = String(name).toLowerCase();
  var keys = Object.keys(headers);
  for (var index = 0; index < keys.length; index += 1) {
    if (String(keys[index]).toLowerCase() === expected) {
      return String(headers[keys[index]] || "");
    }
  }
  return "";
}

function sanitizeCookie(rawCookie) {
  var wanted = { pt_key: "", pt_pin: "" };
  var parts = String(rawCookie || "").split(";");

  for (var index = 0; index < parts.length; index += 1) {
    var part = parts[index].trim();
    var separator = part.indexOf("=");
    if (separator <= 0) {
      continue;
    }

    var name = part.slice(0, separator).trim();
    if (hasOwn(wanted, name)) {
      wanted[name] = part.slice(separator + 1).trim();
    }
  }

  if (!wanted.pt_key || !wanted.pt_pin) {
    return "";
  }
  return "pt_key=" + wanted.pt_key + "; pt_pin=" + wanted.pt_pin + ";";
}

function parseBoolean(value, fallback) {
  if (value === true || String(value).toLowerCase() === "true" || value === "开启" || value === "1") {
    return true;
  }
  if (value === false || String(value).toLowerCase() === "false" || value === "关闭" || value === "0") {
    return false;
  }
  return fallback;
}

function readArguments(argument) {
  var source = argument;
  var result = {
    jdCookie: "",
    useCoupon: true,
    showRunStatus: true
  };

  if (source && typeof source === "object") {
    result.jdCookie = String(source.jdCookie || "");
    result.useCoupon = parseBoolean(source.useCoupon, true);
    if (hasOwn(source, "showRunStatus")) {
      result.showRunStatus = parseBoolean(source.showRunStatus, true);
    } else if (hasOwn(source, "notifyAll")) {
      // Compatibility with the first published plugin argument name.
      result.showRunStatus = parseBoolean(source.notifyAll, true);
    }
  }
  return result;
}

function makeCredentials(cookie, userAgent, capturedAt) {
  var sanitized = sanitizeCookie(cookie);
  if (!sanitized) {
    return null;
  }

  return {
    cookie: sanitized,
    userAgent: String(userAgent || DEFAULT_USER_AGENT),
    capturedAt: Number(capturedAt || Date.now())
  };
}

function parseStoredCredentials(raw) {
  if (!raw) {
    return null;
  }

  try {
    var parsed = JSON.parse(raw);
    return makeCredentials(parsed.cookie, parsed.userAgent, parsed.capturedAt);
  } catch (_) {
    return makeCredentials(raw, DEFAULT_USER_AGENT, Date.now());
  }
}

function encodeForm(values) {
  return Object.keys(values).map(function (key) {
    var value = values[key] === undefined || values[key] === null ? "" : String(values[key]);
    return encodeURIComponent(key) + "=" + encodeURIComponent(value);
  }).join("&");
}

function buildApplyBody(onceBatchId, couponConfirmFlag) {
  return {
    onceBatchId: String(onceBatchId || ""),
    couponConfirmFlag: couponConfirmFlag === undefined ? null : couponConfirmFlag,
    appId: "cuser",
    uniformBizInfo: {
      data: {
        language: "zh_CN",
        buId: 301,
        tenantId: 1024
      }
    },
    type: "25"
  };
}

function buildApplyForm(onceBatchId, couponConfirmFlag, timestamp) {
  return encodeForm({
    functionId: FUNCTION_ID,
    appid: "price_protection",
    loginType: "2",
    body: JSON.stringify(buildApplyBody(onceBatchId, couponConfirmFlag)),
    client: "apple",
    clientVersion: "",
    h5st: "",
    t: String(timestamp || Date.now()),
    xAPIClientLanguage: "zh_CN"
  });
}

function parseApiResponse(rawBody) {
  try {
    var payload = typeof rawBody === "string" ? JSON.parse(rawBody) : rawBody;
    if (!payload || typeof payload !== "object") {
      return { kind: "error", message: "接口返回格式异常" };
    }

    var data = payload.data && typeof payload.data === "object" ? payload.data : {};
    var code = String(payload.code === undefined ? "" : payload.code);
    var message = data.onceApplyNoSuccessTips || data.responseMessage || data.errorMessage || payload.message || payload.msg || "";
    var couponInfos = Array.isArray(data.confirmCouponInfos) ? data.confirmCouponInfos : [];

    if (code !== "0") {
      var authFailed = code === "401" || /登录|cookie|过期|失效/i.test(String(message));
      return {
        kind: authFailed ? "auth" : "error",
        code: code,
        message: String(message || "京东接口返回错误")
      };
    }

    if (couponInfos.length > 0) {
      return {
        kind: "coupon",
        onceBatchId: String(data.onceBatchId || ""),
        couponCount: couponInfos.length,
        message: String(message || "检测到可用于价保的优惠券")
      };
    }

    if (data.flag === true) {
      var successCount = Number(data.succNum || 0);
      var successAmount = Number(data.succAmount || 0);
      var insuranceAmount = Number(data.insuranceSuccAmount || 0);
      var totalAmount = successAmount + insuranceAmount;
      return {
        kind: totalAmount > 0 || successCount > 0 ? "success" : "noop",
        successCount: successCount,
        successAmount: successAmount,
        insuranceAmount: insuranceAmount,
        totalAmount: totalAmount,
        message: String(message || (totalAmount > 0 ? "价保申请成功" : "当前没有可退差价"))
      };
    }

    if (message) {
      return { kind: "noop", message: String(message) };
    }
    return { kind: "error", message: "京东未返回明确的价保结果" };
  } catch (_) {
    return { kind: "error", message: "接口返回的不是有效 JSON" };
  }
}

function resultText(result, usedCoupon) {
  if (result.kind === "success") {
    var amount = Number(result.totalAmount || 0);
    var count = Number(result.successCount || 0);
    return "成功 " + count + " 笔，预计返还 " + amount + " 元" + (usedCoupon ? "（已用券）" : "");
  }
  if (result.kind === "coupon") {
    return "检测到 " + result.couponCount + " 张可用优惠券";
  }
  return result.message || "无详细结果";
}

function shouldNotify(result, showRunStatus) {
  return showRunStatus || result.kind === "success" || result.kind === "auth" || result.kind === "error" || result.kind === "coupon";
}

function isRunDue(now, lastRunAt) {
  var last = Number(lastRunAt || 0);
  return !last || Number(now) - last >= RUN_INTERVAL_MS;
}

function readHistory(rawHistory) {
  if (!rawHistory) {
    return [];
  }

  try {
    var parsed = typeof rawHistory === "string" ? JSON.parse(rawHistory) : rawHistory;
    return Array.isArray(parsed) ? parsed.slice(0, HISTORY_LIMIT) : [];
  } catch (_) {
    return [];
  }
}

function buildHistoryRecord(result, usedCoupon, now) {
  return {
    timestamp: Number(now || Date.now()),
    kind: String(result.kind || "error"),
    usedCoupon: usedCoupon === true,
    successCount: Number(result.successCount || 0),
    totalAmount: Number(result.totalAmount || 0),
    message: String(resultText(result, usedCoupon)).slice(0, 160)
  };
}

function appendHistory(rawHistory, result, usedCoupon, now) {
  var history = readHistory(rawHistory);
  history.unshift(buildHistoryRecord(result, usedCoupon, now));
  return history.slice(0, HISTORY_LIMIT);
}

function formatTimestamp(timestamp) {
  var date = new Date(Number(timestamp || 0));
  if (!timestamp || isNaN(date.getTime())) {
    return "未知时间";
  }

  function pad(value) {
    return String(value).length < 2 ? "0" + value : String(value);
  }

  return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()) + " " + pad(date.getHours()) + ":" + pad(date.getMinutes());
}

function formatHistory(history) {
  var records = readHistory(history);
  if (!records.length) {
    return "暂无价保申请记录";
  }

  return records.map(function (record, index) {
    var status = record.kind === "auth" || record.kind === "error" ? "失败" : "正常";
    return String(index + 1) + ". [" + status + "] " + formatTimestamp(record.timestamp) + "\n" + String(record.message || "无详细结果");
  }).join("\n\n");
}

function evaluateHealth(history, now) {
  var records = readHistory(history);
  if (!records.length) {
    return {
      healthy: false,
      label: "⚠️ 尚未运行",
      detail: "还没有价保请求记录，请等待首次定时执行或检查登录凭证。"
    };
  }

  var latest = records[0];
  var latestAt = Number(latest.timestamp || 0);
  if (latest.kind === "auth" || latest.kind === "error") {
    return {
      healthy: false,
      label: "❌ 运行失败",
      detail: "最近一次请求失败：" + String(latest.message || "无详细原因")
    };
  }

  if (!latestAt || Number(now || Date.now()) - latestAt > HEALTH_STALE_MS) {
    return {
      healthy: false,
      label: "❌ 运行失败",
      detail: "已超过 3 小时没有新的价保请求记录，请检查插件、Loon 后台状态和网络。"
    };
  }

  return {
    healthy: true,
    label: "✅ 运行正常",
    detail: "最近一次请求时间：" + formatTimestamp(latestAt)
  };
}

function runStatusLabel(result) {
  return result.kind === "auth" || result.kind === "error" ? "❌ 运行失败" : "✅ 运行正常";
}

function postNotification(subtitle, message) {
  if (typeof $notification !== "undefined" && $notification && typeof $notification.post === "function") {
    $notification.post("京东自动价保", subtitle, message);
  }
}

function writeCredentials(credentials) {
  if (typeof $persistentStore === "undefined" || !$persistentStore) {
    return false;
  }
  return $persistentStore.write(JSON.stringify(credentials), STORE_KEY);
}

function readCredentialsFromStore() {
  if (typeof $persistentStore === "undefined" || !$persistentStore) {
    return null;
  }

  var own = parseStoredCredentials($persistentStore.read(STORE_KEY));
  if (own) {
    return own;
  }

  // Reuse common local JD-cookie keys when the user already has another JD script configured.
  var legacyKeys = ["CookieJD", "CookiesJD", "JD_COOKIE"];
  for (var index = 0; index < legacyKeys.length; index += 1) {
    var legacy = makeCredentials($persistentStore.read(legacyKeys[index]), DEFAULT_USER_AGENT, Date.now());
    if (legacy) {
      writeCredentials(legacy);
      return legacy;
    }
  }
  return null;
}

function captureCredentials(request, argument, now) {
  var args = readArguments(argument);
  var requestHeaders = request && request.headers ? request.headers : {};
  var rawCookie = args.jdCookie || readHeader(requestHeaders, "cookie");
  return makeCredentials(rawCookie, readHeader(requestHeaders, "user-agent"), now);
}

function handleCredentialCapture() {
  var credentials = captureCredentials($request, typeof $argument === "undefined" ? null : $argument, Date.now());
  if (!credentials) {
    $done({});
    return;
  }

  var previous = readCredentialsFromStore();
  var changed = !previous || previous.cookie !== credentials.cookie;
  writeCredentials(credentials);
  if (changed) {
    console.log("[JDAutoPrice] 京东登录凭证已保存到 Loon 本地存储");
    postNotification("初始化完成", "登录凭证已保存；后续定时价保无需打开京东 App。");
  }
  $done({});
}

function postApply(credentials, onceBatchId, couponConfirmFlag, callback) {
  var params = {
    url: API_URL,
    timeout: 30000,
    "auto-cookie": false,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Cookie": credentials.cookie,
      "User-Agent": credentials.userAgent || DEFAULT_USER_AGENT,
      "Origin": "https://h5.m.jd.com",
      "Referer": "https://h5.m.jd.com/"
    },
    body: buildApplyForm(onceBatchId, couponConfirmFlag, Date.now())
  };

  $httpClient.post(params, function (error, response, body) {
    if (error) {
      callback({ kind: "error", message: "网络请求失败：" + String(error) });
      return;
    }
    if (!response || Number(response.status) !== 200) {
      callback({ kind: "error", message: "接口 HTTP " + String(response && response.status || "未知") });
      return;
    }
    callback(parseApiResponse(body));
  });
}

function maybeNotifyAuthFailure(result) {
  if (result.kind !== "auth" || typeof $persistentStore === "undefined" || !$persistentStore) {
    return true;
  }

  var now = Date.now();
  var lastNoticeAt = Number($persistentStore.read(AUTH_NOTICE_KEY) || 0);
  if (now - lastNoticeAt < 24 * 60 * 60 * 1000) {
    return false;
  }
  $persistentStore.write(String(now), AUTH_NOTICE_KEY);
  return true;
}

function shouldPostDailyNotice(key) {
  if (typeof $persistentStore === "undefined" || !$persistentStore) {
    return true;
  }

  var now = Date.now();
  var lastNoticeAt = Number($persistentStore.read(key) || 0);
  if (now - lastNoticeAt < 24 * 60 * 60 * 1000) {
    return false;
  }
  $persistentStore.write(String(now), key);
  return true;
}

function finishScheduled(result, options, usedCoupon) {
  var text = resultText(result, usedCoupon);
  if (typeof $persistentStore !== "undefined" && $persistentStore) {
    var history = appendHistory($persistentStore.read(HISTORY_KEY), result, usedCoupon, Date.now());
    $persistentStore.write(JSON.stringify(history), HISTORY_KEY);
  }
  console.log("[JDAutoPrice] " + text);
  if (shouldNotify(result, options.showRunStatus) && maybeNotifyAuthFailure(result)) {
    postNotification(runStatusLabel(result), text);
  }
  $done();
}

function isHistoryAction(argument) {
  if (argument && typeof argument === "object") {
    return String(argument.action || "").toLowerCase() === "history";
  }
  return /(?:^|[,&])\s*action\s*=\s*history(?:$|[,&])/i.test(String(argument || ""));
}

function showHistory() {
  var rawHistory = typeof $persistentStore !== "undefined" && $persistentStore ? $persistentStore.read(HISTORY_KEY) : null;
  var history = readHistory(rawHistory);
  var health = evaluateHealth(history, Date.now());
  var text = "状态：" + health.label + "\n" + health.detail + "\n\n" + formatHistory(history);
  console.log("[JDAutoPrice] 最近价保记录\n" + text);
  postNotification(health.label, text);
  $done();
}

function runScheduled() {
  var options = readArguments(typeof $argument === "undefined" ? null : $argument);
  var argumentCredentials = makeCredentials(options.jdCookie, DEFAULT_USER_AGENT, Date.now());
  var credentials = argumentCredentials || readCredentialsFromStore();
  if (argumentCredentials) {
    writeCredentials(argumentCredentials);
  }

  if (!credentials) {
    if (shouldPostDailyNotice(MISSING_NOTICE_KEY)) {
      postNotification("❌ 运行失败", "未找到京东登录凭证。请在插件参数中填写 pt_key/pt_pin，或仅首次打开一次京东价保页面让插件自动保存。");
    }
    console.log("[JDAutoPrice] 未找到京东登录凭证");
    $done();
    return;
  }

  var now = Date.now();
  var lastRunAt = typeof $persistentStore !== "undefined" && $persistentStore ? $persistentStore.read(LAST_RUN_KEY) : 0;
  if (!isRunDue(now, lastRunAt)) {
    var remainingMinutes = Math.ceil((RUN_INTERVAL_MS - (now - Number(lastRunAt))) / 60000);
    console.log("[JDAutoPrice] 距上次申请不足 2.5 小时，跳过；约 " + remainingMinutes + " 分钟后再检查");
    $done();
    return;
  }
  if (typeof $persistentStore !== "undefined" && $persistentStore) {
    $persistentStore.write(String(now), LAST_RUN_KEY);
  }

  postApply(credentials, "", null, function (firstResult) {
    if (firstResult.kind !== "coupon") {
      finishScheduled(firstResult, options, false);
      return;
    }

    if (!options.useCoupon) {
      finishScheduled(firstResult, options, false);
      return;
    }
    if (!firstResult.onceBatchId) {
      finishScheduled({ kind: "error", message: "检测到可用优惠券，但接口未返回价保批次号" }, options, false);
      return;
    }

    console.log("[JDAutoPrice] 检测到可用优惠券，正在自动确认用券");
    postApply(credentials, firstResult.onceBatchId, 1, function (couponResult) {
      finishScheduled(couponResult, options, true);
    });
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    STORE_KEY: STORE_KEY,
    HISTORY_KEY: HISTORY_KEY,
    FUNCTION_ID: FUNCTION_ID,
    readHeader: readHeader,
    sanitizeCookie: sanitizeCookie,
    readArguments: readArguments,
    makeCredentials: makeCredentials,
    parseStoredCredentials: parseStoredCredentials,
    encodeForm: encodeForm,
    buildApplyBody: buildApplyBody,
    buildApplyForm: buildApplyForm,
    parseApiResponse: parseApiResponse,
    resultText: resultText,
    shouldNotify: shouldNotify,
    isRunDue: isRunDue,
    readHistory: readHistory,
    buildHistoryRecord: buildHistoryRecord,
    appendHistory: appendHistory,
    formatHistory: formatHistory,
    evaluateHealth: evaluateHealth,
    runStatusLabel: runStatusLabel,
    isHistoryAction: isHistoryAction,
    captureCredentials: captureCredentials
  };
}

if (typeof $done === "function" && typeof $request !== "undefined") {
  handleCredentialCapture();
} else if (typeof $done === "function" && isHistoryAction(typeof $argument === "undefined" ? null : $argument)) {
  showHistory();
} else if (typeof $done === "function" && typeof $httpClient !== "undefined") {
  runScheduled();
}
