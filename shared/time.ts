
/*
 * Start an callback interval, but also just call the thing now.
 */
export function setImmediateInterval(callback: () => void, ms: number) {
  setTimeout(callback, 0);
  return setInterval(callback, ms);
}
