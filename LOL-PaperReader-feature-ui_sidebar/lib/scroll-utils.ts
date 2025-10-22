/**
 * Smooth scroll to a specific page in the PDF viewer
 */
export function smoothScrollToPage(
  containerRef: HTMLElement | null,
  pageNumber: number,
  duration: number = 500
) {
  if (!containerRef) return;

  // Find the page element
  const pageElement = containerRef.querySelector(
    `[data-page-number="${pageNumber}"]`
  ) as HTMLElement;

  if (!pageElement) {
    console.warn(`Page ${pageNumber} not found in DOM`);
    return;
  }

  const containerRect = containerRef.getBoundingClientRect();
  const pageRect = pageElement.getBoundingClientRect();

  // Calculate the target scroll position
  // Center the page in the viewport
  const targetScrollTop =
    containerRef.scrollTop +
    pageRect.top -
    containerRect.top -
    (containerRect.height - pageRect.height) / 2;

  // Perform smooth scroll using easing
  smoothScrollTo(containerRef, targetScrollTop, duration);
}

/**
 * Smooth scroll with easing animation
 */
export function smoothScrollTo(
  element: HTMLElement,
  targetScrollTop: number,
  duration: number = 500
) {
  const startScrollTop = element.scrollTop;
  const distance = targetScrollTop - startScrollTop;
  const startTime = performance.now();

  function easeInOutCubic(t: number): number {
    return t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function animate(currentTime: number) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easedProgress = easeInOutCubic(progress);

    element.scrollTop = startScrollTop + distance * easedProgress;

    if (progress < 1) {
      requestAnimationFrame(animate);
    }
  }

  requestAnimationFrame(animate);
}

/**
 * Highlight an element temporarily with animation
 */
export function flashHighlight(element: HTMLElement, duration: number = 2000) {
  // Create a temporary highlight overlay
  const highlight = document.createElement('div');
  highlight.style.position = 'absolute';
  highlight.style.pointerEvents = 'none';
  highlight.style.backgroundColor = 'rgba(59, 130, 246, 0.3)'; // Blue highlight
  highlight.style.border = '2px solid rgb(59, 130, 246)';
  highlight.style.borderRadius = '4px';
  highlight.style.transition = `opacity ${duration}ms ease-out`;
  highlight.style.zIndex = '1000';

  // Position the highlight over the element
  const rect = element.getBoundingClientRect();
  const parent = element.offsetParent as HTMLElement;
  const parentRect = parent?.getBoundingClientRect() || { left: 0, top: 0 };

  highlight.style.left = `${rect.left - parentRect.left}px`;
  highlight.style.top = `${rect.top - parentRect.top}px`;
  highlight.style.width = `${rect.width}px`;
  highlight.style.height = `${rect.height}px`;

  // Add to parent
  if (parent) {
    parent.style.position = 'relative';
    parent.appendChild(highlight);
  } else {
    element.parentElement?.appendChild(highlight);
  }

  // Fade out and remove
  setTimeout(() => {
    highlight.style.opacity = '0';
    setTimeout(() => {
      highlight.remove();
    }, duration);
  }, 100);
}
