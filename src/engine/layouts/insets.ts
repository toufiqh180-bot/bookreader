/**
 * Space kept around the pages, in CSS px. The bottom inset leaves room for
 * the floating page bar so it never covers the end of a page.
 */
export const PAGE_INSETS = Object.freeze({ x: 28, top: 24, bottom: 88 });

/** CSS `padding` value for a layout container. */
export const insetPadding = (): string => `${PAGE_INSETS.top}px ${PAGE_INSETS.x}px ${PAGE_INSETS.bottom}px`;
