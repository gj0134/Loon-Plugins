// Diagnostic-only: report whether Douyin IM sync channels can be MITM-decrypted by Loon.
// Logs URL, body length and a short hex/ascii preview so we can judge if the payload is
// readable protobuf (filterable) or opaque ciphertext / a streaming tunnel (not filterable).

function hexPreview(bytes, count) {
  var limit = Math.min(bytes.length, count);
  var hex = "";
  var ascii = "";
  for (var i = 0; i < limit; i += 1) {
    var b = bytes[i];
    hex += (b < 16 ? "0" : "") + b.toString(16);
    ascii += (b >= 32 && b <= 126) ? String.fromCharCode(b) : ".";
  }
  return hex + "  |" + ascii + "|";
}

function main() {
  var url = "";
  try {
    url = ($request && $request.url) || "";
  } catch (_) {}

  var isResponse = typeof $response !== "undefined" && $response;
  var phase = isResponse ? "RESP" : "REQ";
  var body = isResponse ? ($response && $response.body) : ($request && $request.body);

  if (body instanceof Uint8Array) {
    console.log(
      "[IM诊断] " + phase + " " + url +
      " | 二进制 " + body.length + "B | " + hexPreview(body, 48)
    );
  } else if (typeof body === "string") {
    console.log(
      "[IM诊断] " + phase + " " + url +
      " | 文本 " + body.length + " 字符 | " + body.substring(0, 96)
    );
  } else {
    console.log("[IM诊断] " + phase + " " + url + " | 无包体（可能是长连接/流，或未解密）");
  }

  $done({});
}

main();
