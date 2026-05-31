function padTwo(value) {
  return String(value).padStart(2, "0");
}

export function getCountdownRemainingMs(countdown, nowMs = Date.now()) {
  if (!countdown?.deadline_at) {
    return null;
  }

  const deadlineAt = Date.parse(countdown.deadline_at);
  if (!Number.isFinite(deadlineAt)) {
    return null;
  }

  return Math.max(0, deadlineAt - nowMs);
}

export function formatCountdownMs(remainingMs) {
  if (!Number.isFinite(remainingMs)) {
    return "-";
  }

  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${padTwo(minutes)}:${padTwo(seconds)}`;
}

export function formatCountdownDisplay(countdown, nowMs = Date.now()) {
  return formatCountdownMs(getCountdownRemainingMs(countdown, nowMs));
}