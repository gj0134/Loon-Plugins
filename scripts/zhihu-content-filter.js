// Zhihu response filter for Loon.
// Ads are always removed; paid/Yanxuan content is controlled by the plugin switch.

var HIDE_PAID_ARGUMENT = "hidePaidContent";

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readSwitchArgument(key, fallback) {
  var value = null;

  if (typeof $argument === "object" && $argument !== null && key in $argument) {
    value = $argument[key];
  } else if (typeof $argument === "string" && $argument.length > 0) {
    var raw = $argument.replace(/^\[/, "").replace(/\]$/, "");
    value = raw.split(",")[0];
  }

  if (value === true || String(value).toLowerCase() === "true" || value === "开启") {
    return true;
  }
  if (value === false || String(value).toLowerCase() === "false" || value === "关闭") {
    return false;
  }
  return fallback;
}

function someNestedObject(value, predicate) {
  var stack = [value];

  while (stack.length > 0) {
    var current = stack.pop();
    if (Array.isArray(current)) {
      for (var arrayIndex = 0; arrayIndex < current.length; arrayIndex += 1) {
        if (current[arrayIndex] !== null && typeof current[arrayIndex] === "object") {
          stack.push(current[arrayIndex]);
        }
      }
      continue;
    }

    if (!isObject(current)) {
      continue;
    }
    if (predicate(current)) {
      return true;
    }

    var keys = Object.keys(current);
    for (var keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
      var child = current[keys[keyIndex]];
      if (child !== null && typeof child === "object") {
        stack.push(child);
      }
    }
  }

  return false;
}

function hasAdMarker(object) {
  if (object.type === "ad" || object.type === "feed_advert" || object.type === "market_card") {
    return true;
  }
  if (isObject(object.extra)) {
    if (object.extra.type === "SvipActivity" || object.extra.promotion !== null && object.extra.promotion !== undefined) {
      return true;
    }
    if (isObject(object.extra.business_ext_map) && object.extra.business_ext_map.is_force_insert === true) {
      return true;
    }
  }
  if (hasOwn(object, "ad") || hasOwn(object, "promotion_extra")) {
    return true;
  }
  return typeof object.adjson === "string" && object.adjson.length > 0;
}

function hasPaidMarker(object) {
  if (object.is_paid === true || object.is_trial === true || object.need_pay === true) {
    return true;
  }

  var paidPattern = /paid|vip|salt|market|ebook/i;
  if (typeof object.business_type === "string" && paidPattern.test(object.business_type)) {
    return true;
  }
  if (typeof object.card_type === "string" && paidPattern.test(object.card_type)) {
    return true;
  }
  if (Array.isArray(object.biz_type_list)) {
    for (var index = 0; index < object.biz_type_list.length; index += 1) {
      if (typeof object.biz_type_list[index] === "string" && paidPattern.test(object.biz_type_list[index])) {
        return true;
      }
    }
  }
  return false;
}

function isAdContent(item) {
  return someNestedObject(item, hasAdMarker);
}

function isPaidContent(item) {
  if (someNestedObject(item, hasPaidMarker)) {
    return true;
  }
  try {
    return JSON.stringify(item).indexOf("盐选推荐") >= 0;
  } catch (_) {
    return false;
  }
}

function cleanItem(item) {
  if (!isObject(item)) {
    return item;
  }

  delete item.ad_info;
  delete item.third_business;
  if (isObject(item.target)) {
    delete item.target.ad_info;
    delete item.target.third_business;
  }
  return item;
}

function isNormalHotListItem(item) {
  return isObject(item) && (item.type === "hot_list_feed" || item.type === "hot_list_feed_video");
}

function filterItems(items, hidePaidContent, hotListOnly) {
  if (!Array.isArray(items)) {
    return items;
  }

  return items.filter(function (item) {
    if (hotListOnly && !isNormalHotListItem(item)) {
      return false;
    }
    if (isAdContent(item)) {
      return false;
    }
    if (hidePaidContent && isPaidContent(item)) {
      return false;
    }
    cleanItem(item);
    return true;
  });
}

function clearRootAdConfig(payload) {
  if (!isObject(payload)) {
    return;
  }
  delete payload.ad_info;
  delete payload.adjson;
  delete payload.commercial_info;
  delete payload.promotion_info;
}

function filterPayload(payload, requestUrl, hidePaidContent) {
  clearRootAdConfig(payload);

  if (/\/v2\/topstory\/hot-lists\/everyone-seeing(?:\?|$)/.test(requestUrl)) {
    if (isObject(payload.data)) {
      payload.data.data = filterItems(payload.data.data, hidePaidContent, true);
    }
    return payload;
  }

  if (/\/topstory\/hot-lists(?:\/|\?|$)/.test(requestUrl)) {
    payload.data = filterItems(payload.data, hidePaidContent, true);
    return payload;
  }

  payload.data = filterItems(payload.data, hidePaidContent, false);
  return payload;
}

function run() {
  if (!$response || !$response.body) {
    $done({});
    return;
  }

  try {
    var hidePaidContent = readSwitchArgument(HIDE_PAID_ARGUMENT, true);
    var payload = JSON.parse($response.body);
    var filtered = filterPayload(payload, $request.url, hidePaidContent);
    $done({ body: JSON.stringify(filtered) });
  } catch (error) {
    console.log("[ZhihuContentFilter] " + error);
    $done({});
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    filterPayload: filterPayload,
    isAdContent: isAdContent,
    isPaidContent: isPaidContent
  };
}

if (typeof $done === "function" && typeof $response !== "undefined") {
  run();
}
