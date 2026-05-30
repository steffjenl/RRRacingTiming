export function parsePollingResponse(responseText) {
  const text = String(responseText ?? "");
  const first = text.indexOf("@");
  const second = first >= 0 ? text.indexOf("@", first + 1) : -1;

  if (first < 0 || second < 0) {
    return {
      init: null,
      index: null,
      payload: text
    };
  }

  return {
    init: text.slice(0, first),
    index: text.slice(first + 1, second),
    payload: text.slice(second + 1)
  };
}
