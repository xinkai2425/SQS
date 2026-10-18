const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

function readDelay(value, element) {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim()) return Number(value)
  if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'delay')) {
    return Number(value.delay)
  }
  return Number(element.dataset.revealDelay || 0)
}

export const reveal = {
  mounted(element, binding) {
    if (prefersReducedMotion()) {
      element.classList.add('is-revealed')
      return
    }

    element.classList.add('reveal')
    const delay = readDelay(binding.value, element)
    if (delay) {
      element.style.setProperty('--reveal-delay', `${delay}ms`)
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          entry.target.classList.add('is-revealed')
          observer.unobserve(entry.target)
          const settleDelay = delay + 760
          element.__iqgRevealTimer = window.setTimeout(() => {
            element.classList.remove('reveal')
            element.style.removeProperty('--reveal-delay')
          }, settleDelay)
        }
      },
      {
        threshold: 0.12,
        rootMargin: '0px 0px -8% 0px',
      },
    )

    element.__iqgRevealObserver = observer
    observer.observe(element)
  },

  unmounted(element) {
    element.__iqgRevealObserver?.disconnect()
    delete element.__iqgRevealObserver
    if (element.__iqgRevealTimer) {
      window.clearTimeout(element.__iqgRevealTimer)
      delete element.__iqgRevealTimer
    }
  },
}
