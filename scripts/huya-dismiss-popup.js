// Close Huya's native activity panel instead of merely blanking its web content.

"use strict";

function copySafeHeaders(source) {
  var result = {};
  var blocked = {
    "content-encoding": true,
    "content-length": true,
    "content-security-policy": true,
    "x-content-security-policy": true,
    "x-webkit-csp": true
  };

  Object.keys(source || {}).forEach(function (key) {
    if (!blocked[String(key).toLowerCase()]) {
      result[key] = source[key];
    }
  });

  result["Content-Type"] = "text/html; charset=utf-8";
  result["Cache-Control"] = "no-store";
  return result;
}

var dismissPage = [
  "<!doctype html>",
  "<html><head><meta charset=\"utf-8\">",
  "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">",
  "<style>html,body{display:none!important;width:0!important;height:0!important;background:transparent!important}</style>",
  "</head><body><script>",
  "(function(){",
  "var attempts=0;var timer=null;",
  "function bridge(){try{return window.top&&window.self!==window.top&&window.top.KiwiJSBridge?window.top.KiwiJSBridge:window.KiwiJSBridge}catch(_){return null}}",
  "function dismiss(){var value=bridge();if(!value)return false;try{",
  "if(typeof value.callWithModule==='function'){value.callWithModule('HYPanel','dismissPopup',{},function(){});return true}",
  "if(typeof value.call==='function'){var options={usePostMessageByDefault:true,useProcolByDefault:false,useContextByDefault:false};value.call('dismissPopup',options,function(){});value.call('closeWebView',options,function(){});return true}",
  "}catch(_){}return false}",
  "function run(){attempts+=1;if(dismiss()||attempts>=40){if(timer!==null)clearInterval(timer)}}",
  "document.addEventListener('KiwiWebViewJavascriptBridgeReady',run,false);",
  "timer=setInterval(run,50);run();",
  "})();",
  "</scr" + "ipt></body></html>"
].join("");

$done({
  headers: copySafeHeaders($response.headers),
  body: dismissPage
});
