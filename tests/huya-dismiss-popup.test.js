"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var root = path.resolve(__dirname, "..");
var scriptPath = path.join(root, "scripts", "huya-dismiss-popup.js");
var pluginPath = path.join(root, "plugins", "Huya-AdBlock.plugin");
var source = fs.readFileSync(scriptPath, "utf8");
var plugin = fs.readFileSync(pluginPath, "utf8");
var rewrittenResponse = null;

vm.runInNewContext(source, {
  $response: {
    headers: {
      "Content-Type": "text/html",
      "Content-Length": "1083706",
      "Content-Encoding": "gzip",
      "Content-Security-Policy": "script-src 'none'",
      Server: "test"
    }
  },
  $done: function (value) {
    rewrittenResponse = value;
  }
});

assert.ok(rewrittenResponse, "script should finish with a rewritten response");
assert.strictEqual(rewrittenResponse.headers["Content-Type"], "text/html; charset=utf-8");
assert.strictEqual(rewrittenResponse.headers["Cache-Control"], "no-store");
assert.strictEqual(rewrittenResponse.headers.Server, "test");
assert.ok(!("Content-Length" in rewrittenResponse.headers));
assert.ok(!("Content-Encoding" in rewrittenResponse.headers));
assert.ok(!("Content-Security-Policy" in rewrittenResponse.headers));
assert.ok(rewrittenResponse.body.indexOf("display:none!important") >= 0);

var inlineScript = rewrittenResponse.body.match(/<script>([\s\S]*)<\/script>/);
assert.ok(inlineScript, "dismiss page should contain an inline script");

var bridgeCalls = [];
var clearedTimer = false;
vm.runInNewContext(inlineScript[1], {
  window: {
    KiwiJSBridge: {
      callWithModule: function (moduleName, methodName) {
        bridgeCalls.push([moduleName, methodName]);
      }
    }
  },
  document: {
    addEventListener: function () {}
  },
  setInterval: function () {
    return 7;
  },
  clearInterval: function (timerId) {
    clearedTimer = timerId === 7;
  }
});

assert.deepStrictEqual(bridgeCalls, [["HYPanel", "dismissPopup"]]);
assert.strictEqual(clearedTimer, true);
assert.ok(plugin.indexOf("liwumanghe120") >= 0, "plugin should cover the captured blind-box asset");
assert.ok(plugin.indexOf("scripts/huya-dismiss-popup.js") >= 0, "plugin should use the popup dismiss script");
assert.ok(!/zt\\\.huya\\\.com[^\n]+ reject(?:\s|$)/.test(plugin), "activity HTML should no longer be rejected into a blank panel");

var popupRule = plugin.split("\n").find(function (line) {
  return line.indexOf("http-response ") === 0 && line.indexOf("huya-dismiss-popup.js") >= 0;
});
var popupPattern = popupRule.slice("http-response ".length, popupRule.indexOf(" script-path="));
var popupRegex = new RegExp(popupPattern);
assert.ok(popupRegex.test("https://zt.huya.com/17250f13/mobile/index.html"));
assert.ok(popupRegex.test("https://zt.huya.com/45e2e939/mobile/index.html?horizontalScreen=1"));
assert.ok(popupRegex.test("https://zt.huya.com/new-activity/mobile/index.html?foo=1&window_activity_id=99"));
assert.ok(!popupRegex.test("https://zt.huya.com/new-activity/mobile/index.html?foo=1"));

var blindBoxRule = plugin.split("\n").find(function (line) {
  return line.indexOf("liwumanghe120") >= 0 && line.indexOf("reject-img") >= 0;
});
var blindBoxPattern = blindBoxRule.slice(0, blindBoxRule.lastIndexOf(" reject-img"));
assert.ok(new RegExp(blindBoxPattern).test("https://livewebbs2.msstatic.com/liwumanghe120.png"));

console.log("Huya popup dismissal tests passed.");
