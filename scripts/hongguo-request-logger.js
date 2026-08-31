/*
 * Hongguo request/response metadata logger for Loon.
 * Observational only: no request or response fields are changed.
 */

(function () {
  "use strict";

  var PREFIX = "[HongguoTrace] ";
  var SENSITIVE_QUERY_KEY = /(?:^|[_-])(?:access[_-]?token|token|auth|authorization|cookie|session|sid|iid|install[_-]?id|device[_-]?id|openudid|idfa|oaid|uuid|user[_-]?id|uid|msToken|bogus|gorgon|khronos|signature|sign|sig|odin[_-]?tt|csrf)(?:$|[_-])/i;

  if (typeof $request === "undefined") {
    console.log(PREFIX + JSON.stringify({
      time: new Date().toISOString(),
      phase: "manual-run",
      message: "无需手动运行；启用插件后打开红果，HTTP 请求会自动触发日志。"
    }));
    $done({});
    return;
  }

  function header(headers, name) {
    var target = String(name).toLowerCase();
    var source = headers || {};
    var keys = Object.keys(source);
    for (var i = 0; i < keys.length; i += 1) {
      if (String(keys[i]).toLowerCase() === target) {
        return source[keys[i]];
      }
    }
    return undefined;
  }

  function putIfPresent(target, key, value) {
    if (value !== undefined && value !== null && String(value) !== "") {
      target[key] = String(value);
    }
  }

  function sanitizeUrl(rawUrl) {
    var value = String(rawUrl || "");
    var question = value.indexOf("?");
    if (question < 0) return value;

    var hash = value.indexOf("#", question);
    var suffix = hash >= 0 ? value.slice(hash) : "";
    var query = value.slice(question + 1, hash >= 0 ? hash : value.length);
    var items = query.split("&");

    for (var i = 0; i < items.length; i += 1) {
      var equals = items[i].indexOf("=");
      var rawKey = equals >= 0 ? items[i].slice(0, equals) : items[i];
      var key;
      try {
        key = decodeURIComponent(rawKey.replace(/\+/g, " "));
      } catch (_) {
        key = rawKey;
      }
      if (SENSITIVE_QUERY_KEY.test(key)) {
        items[i] = rawKey + "=<redacted>";
      }
    }

    return value.slice(0, question + 1) + items.join("&") + suffix;
  }

  function requestRecord(request) {
    var headers = request.headers || {};
    var selected = {};
    putIfPresent(selected, "content-type", header(headers, "content-type"));
    putIfPresent(selected, "content-length", header(headers, "content-length"));
    putIfPresent(selected, "range", header(headers, "range"));
    var referer = header(headers, "referer");
    putIfPresent(selected, "referer", referer ? sanitizeUrl(referer) : referer);

    return {
      time: new Date().toISOString(),
      phase: "request",
      method: String(request.method || "GET"),
      url: sanitizeUrl(request.url),
      headers: selected
    };
  }

  function responseRecord(request, response) {
    var headers = response.headers || {};
    var selected = {};
    putIfPresent(selected, "content-type", header(headers, "content-type"));
    putIfPresent(selected, "content-length", header(headers, "content-length"));
    putIfPresent(selected, "content-range", header(headers, "content-range"));
    var location = header(headers, "location");
    putIfPresent(selected, "location", location ? sanitizeUrl(location) : location);
    putIfPresent(selected, "cache", header(headers, "x-cache"));

    return {
      time: new Date().toISOString(),
      phase: "response",
      method: String(request.method || "GET"),
      url: sanitizeUrl(request.url),
      status: Number(response.status || response.statusCode || 0),
      headers: selected
    };
  }

  try {
    var record = typeof $response === "undefined"
      ? requestRecord($request)
      : responseRecord($request, $response);
    console.log(PREFIX + JSON.stringify(record));
  } catch (error) {
    console.log(PREFIX + JSON.stringify({
      time: new Date().toISOString(),
      phase: "logger-error",
      message: String(error && error.message ? error.message : error)
    }));
  }

  $done({});
})();
