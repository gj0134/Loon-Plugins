// Douyin IM protobuf response filter for Loon.
// Removes only messages sent by the configured user in the configured conversation.

var TARGETS = [
  {
    name: "阿沁",
    optionKey: "屏蔽阿沁",
    senderId: 72364353745,
    conversationId: "0:1:72364353745:102398636553"
  },
  {
    name: "老马",
    optionKey: "屏蔽老马",
    senderId: 1251656996762231,
    conversationId: "0:1:102398636553:1251656996762231"
  }
];
var MAX_PROTOBUF_DEPTH = 10;

function readVarint(bytes, offset) {
  var value = 0;
  var multiplier = 1;
  var position = offset;

  for (var count = 0; count < 10; count += 1) {
    if (position >= bytes.length) {
      throw new Error("truncated varint");
    }

    var current = bytes[position];
    position += 1;
    value += (current & 0x7f) * multiplier;

    if ((current & 0x80) === 0) {
      return { value: value, next: position };
    }

    multiplier *= 128;
  }

  throw new Error("varint is too long");
}

function encodeVarint(value) {
  var result = [];
  var remaining = value;

  do {
    var current = remaining % 128;
    remaining = Math.floor(remaining / 128);
    if (remaining > 0) {
      current |= 0x80;
    }
    result.push(current);
  } while (remaining > 0);

  return new Uint8Array(result);
}

function parseFields(bytes) {
  var fields = [];
  var offset = 0;

  while (offset < bytes.length) {
    var start = offset;
    var tag = readVarint(bytes, offset);
    offset = tag.next;

    var fieldNumber = Math.floor(tag.value / 8);
    var wireType = tag.value % 8;
    if (fieldNumber <= 0) {
      throw new Error("invalid field number");
    }

    var field = {
      fieldNumber: fieldNumber,
      wireType: wireType,
      start: start,
      tagEnd: offset,
      payloadStart: -1,
      payloadEnd: -1,
      end: -1,
      varintValue: null
    };

    if (wireType === 0) {
      var varint = readVarint(bytes, offset);
      field.varintValue = varint.value;
      offset = varint.next;
    } else if (wireType === 1) {
      offset += 8;
    } else if (wireType === 2) {
      var lengthInfo = readVarint(bytes, offset);
      offset = lengthInfo.next;
      field.payloadStart = offset;
      field.payloadEnd = offset + lengthInfo.value;
      offset = field.payloadEnd;
    } else if (wireType === 5) {
      offset += 4;
    } else {
      throw new Error("unsupported wire type " + wireType);
    }

    if (offset > bytes.length) {
      throw new Error("truncated field");
    }

    field.end = offset;
    fields.push(field);
  }

  return fields;
}

function asciiEquals(bytes, expected) {
  if (bytes.length !== expected.length) {
    return false;
  }

  for (var index = 0; index < bytes.length; index += 1) {
    if (bytes[index] !== expected.charCodeAt(index)) {
      return false;
    }
  }

  return true;
}

function getBlockedTargetIndex(bytes, enabledTargets) {
  var fields;
  try {
    fields = parseFields(bytes);
  } catch (_) {
    return -1;
  }

  var conversationField = null;
  var senderField = null;

  for (var index = 0; index < fields.length; index += 1) {
    var field = fields[index];

    if (field.fieldNumber === 1 && field.wireType === 2) {
      conversationField = bytes.subarray(field.payloadStart, field.payloadEnd);
    } else if (field.fieldNumber === 7 && field.wireType === 0) {
      senderField = field.varintValue;
    }
  }

  if (conversationField === null || senderField === null) {
    return -1;
  }

  for (var targetIndex = 0; targetIndex < enabledTargets.length; targetIndex += 1) {
    var target = enabledTargets[targetIndex];
    if (
      senderField === target.senderId &&
      asciiEquals(conversationField, target.conversationId)
    ) {
      return targetIndex;
    }
  }

  return -1;
}

function concatBytes(chunks, totalLength) {
  var result = new Uint8Array(totalLength);
  var offset = 0;

  for (var index = 0; index < chunks.length; index += 1) {
    result.set(chunks[index], offset);
    offset += chunks[index].length;
  }

  return result;
}

function filterNestedMessages(bytes, depth, stats, enabledTargets) {
  var fields = parseFields(bytes);
  var chunks = [];
  var totalLength = 0;
  var changed = false;

  for (var index = 0; index < fields.length; index += 1) {
    var field = fields[index];

    if (field.wireType !== 2) {
      var untouched = bytes.subarray(field.start, field.end);
      chunks.push(untouched);
      totalLength += untouched.length;
      continue;
    }

    var payload = bytes.subarray(field.payloadStart, field.payloadEnd);
    var blockedTargetIndex = getBlockedTargetIndex(payload, enabledTargets);
    if (blockedTargetIndex >= 0) {
      stats.removed += 1;
      stats.removedByTarget[blockedTargetIndex] += 1;
      changed = true;
      continue;
    }

    var nested = { bytes: payload, changed: false };
    if (depth < MAX_PROTOBUF_DEPTH) {
      try {
        nested = filterNestedMessages(payload, depth + 1, stats, enabledTargets);
      } catch (_) {
        nested = { bytes: payload, changed: false };
      }
    }

    if (!nested.changed) {
      var original = bytes.subarray(field.start, field.end);
      chunks.push(original);
      totalLength += original.length;
      continue;
    }

    changed = true;
    var tagBytes = bytes.subarray(field.start, field.tagEnd);
    var lengthBytes = encodeVarint(nested.bytes.length);
    chunks.push(tagBytes, lengthBytes, nested.bytes);
    totalLength += tagBytes.length + lengthBytes.length + nested.bytes.length;
  }

  if (!changed) {
    return { bytes: bytes, changed: false };
  }

  return { bytes: concatBytes(chunks, totalLength), changed: true };
}

function finish() {
  var body = $response && $response.body;
  if (!(body instanceof Uint8Array) || body.length === 0) {
    console.log("[Douyin Block User] response body is not binary");
    $done({});
    return;
  }

  try {
    var enabledTargets = [];
    for (var targetIndex = 0; targetIndex < TARGETS.length; targetIndex += 1) {
      var target = TARGETS[targetIndex];
      var selectedValue = $persistentStore.read(target.optionKey);
      if (selectedValue !== "关闭") {
        enabledTargets.push(target);
      }
    }

    if (enabledTargets.length === 0) {
      console.log("[Douyin Block User] all user filters are disabled");
      $done({});
      return;
    }

    var stats = {
      removed: 0,
      removedByTarget: new Array(enabledTargets.length).fill(0)
    };
    var filtered = filterNestedMessages(body, 0, stats, enabledTargets);

    if (!filtered.changed) {
      console.log("[Douyin Block User] no target messages found");
      $done({});
      return;
    }

    var details = [];
    for (var enabledIndex = 0; enabledIndex < enabledTargets.length; enabledIndex += 1) {
      if (stats.removedByTarget[enabledIndex] > 0) {
        details.push(
          enabledTargets[enabledIndex].name + ": " + stats.removedByTarget[enabledIndex]
        );
      }
    }
    console.log(
      "[Douyin Block User] removed " + stats.removed + " target message(s): " + details.join(", ")
    );
    $done({ body: filtered.bytes });
  } catch (error) {
    console.log("[Douyin Block User] protobuf filter failed: " + error);
    $done({});
  }
}

finish();
