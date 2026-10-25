# Scroll World Page Overrides

> **PROJECT:** Power Genie Hub
> **Generated:** 2026-10-25 18:03:06
> **Page Type:** Blog / Article

> ⚠️ **IMPORTANT:** Rules in this file **override** the Master file (`design-system/MASTER.md`).
> Only deviations from the Master are documented here. For all other rules, refer to the Master.

---

## Page-Specific Rules

### Layout Overrides

- **Max Width:** 1200px (standard)
- **Layout:** Full-width sections, centered content
- **Sections:** 1. Intro hook, 2. Chapter 1 (problem), 3. Chapter 2 (journey), 4. Chapter 3 (solution), 5. Climax CTA

### Spacing Overrides

- No overrides — use Master spacing

### Typography Overrides

- No overrides — use Master typography

### Color Overrides

- **Strategy:** Progressive reveal. Each chapter has distinct color. Building intensity.

### Component Overrides

- Avoid: Jump directly without transition
- Avoid: Content wider than viewport
- Avoid: Force scroll effects

---

## Page-Specific Components

- No unique components for this page

---

## Recommendations

- Effects: transform: translateY(scroll), position: fixed/sticky, perspective: 1px, scroll-triggered animations
- Navigation: Use scroll-behavior: smooth on html element
- Responsive: Ensure content fits viewport width
- Accessibility: Respect prefers-reduced-motion
- CTA Placement: End of each chapter (mini) + Final climax CTA
