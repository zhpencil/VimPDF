export function animateScrollTop(element: HTMLElement, target: number, duration = 200): void {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const from = element.scrollTop
  const delta = target - from
  if (reduced || Math.abs(delta) < 1) {
    element.scrollTop = target
    return
  }
  const start = performance.now()
  const step = (now: number) => {
    const progress = Math.min(1, (now - start) / duration)
    const eased = progress < 0.5
      ? 2 * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 2) / 2
    element.scrollTop = from + delta * eased
    if (progress < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}
