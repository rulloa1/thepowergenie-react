---
name: Power Genie Application
description: Inherited navy application controls with a scoped Video Studio extension.
colors:
  hub-bg: "#071b27"
  hub-surface: "#1b2d38"
  hub-muted: "#2a3b45"
  hub-ink: "#f7fbff"
  hub-soft: "#bed0dc"
  hub-faint: "#8aa0b0"
  hub-control: "#8f989e"
  hub-primary: "#d4f1ff"
  hub-primary-hover: "#b6e6fb"
  hub-on-primary: "#082638"
  hub-accent-fill: "#ffcf75"
  hub-accent-fill-hover: "#e8b85c"
  hub-on-accent: "#102029"
  hub-link: "#87dbff"
  hub-focus: "#ffdc90"
  vs-panel: "#122935"
  vs-field: "#0c212d"
  vs-line: "#3f5561"
  vs-muted: "#b7cad6"
  vs-faint: "#92aab9"
typography:
  body:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
  vs-body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "14px"
    lineHeight: 1.5
  vs-title:
    fontSize: "16px"
    fontWeight: 600
    letterSpacing: "-.015em"
  vs-field-copy:
    fontSize: "13px"
    lineHeight: 1.6
  vs-button:
    fontSize: "12px"
    fontWeight: 550
    lineHeight: 1.4
rounded:
  hub-control: "12px"
  vs-panel: "10px"
  vs-control: "7px"
  vs-field: "6px"
  vs-tag: "5px"
spacing:
  vs-control-gap: "8px"
  vs-action-gap: "10px"
  vs-field-gap: "7px"
  vs-section: "24px"
components:
  hub-button-primary:
    backgroundColor: "{colors.hub-primary}"
    textColor: "{colors.hub-on-primary}"
    rounded: "{rounded.hub-control}"
  vs-button-primary:
    backgroundColor: "{colors.hub-primary}"
    textColor: "{colors.hub-on-primary}"
    rounded: "{rounded.vs-control}"
    padding: "8px 12px"
    typography: "{typography.vs-button}"
  vs-button-primary-hover:
    backgroundColor: "{colors.hub-primary-hover}"
  vs-button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.hub-ink}"
    rounded: "{rounded.vs-control}"
    padding: "8px 12px"
    typography: "{typography.vs-button}"
  vs-field:
    backgroundColor: "{colors.vs-field}"
    textColor: "{colors.hub-ink}"
    rounded: "{rounded.vs-field}"
    padding: "10px 12px"
  vs-idea-panel:
    backgroundColor: "{colors.vs-panel}"
    rounded: "{rounded.vs-panel}"
    padding: "23px 24px 17px"
---

# Design System: Power Genie Application

## Overview

**Creative North Star: "Power Genie application workspace"**

This is a descriptive name for the inherited application world in the approved Video Studio direction contract. Navy fields, ice-blue controls, warm gold focus, and restrained borders connect the new editor with the Referral Hub. This record captures the existing application foundation and the shipped Video Studio extension; it does not replace the public marketing journey, booking-page overrides, assistant brand variants, or individual product identities.

The studio is a compact editing workspace. Its own stylesheet and entry point preserve the inherited color roles while using local surface colors and denser controls. Those local measurements apply to Video Studio, rather than redefining the hub's shared components.

**Key Characteristics:**

- Navy surfaces with ice-blue primary actions.
- Gold keyboard focus and visible selection treatments.
- Restrained borders, modest rounding, and flat studio panels.
- Denser studio controls alongside larger hub controls.

## Colors

Cool navy layers support pale text and ice-blue actions, with gold reserved for focus and selected treatments in the studio.

### Primary

- **Ice primary:** `hub-primary` and `hub-primary-hover` drive filled actions and studio active scene labels; `hub-on-primary` is their dark foreground.

### Secondary

- **Warm gold:** `hub-focus` is also the studio's local gold value, used for focus outlines, selected controls, the brand icon, and saved task identifiers. The hub separately uses `hub-accent-fill` for accent buttons.
- **Cyan links:** `hub-link` remains a hub role. Studio text links instead use its local primary, which matches ice primary.

### Neutral

- **Deep navy:** `hub-bg` is shared by the studio canvas.
- **Hub surface layers:** `hub-surface` and `hub-muted` remain incumbent hub container roles.
- **Studio surface layers:** `vs-panel` is the idea/output panel; `vs-field` is the recessed field. These do not replace hub surfaces.
- **Foreground hierarchy:** `hub-ink` is shared; the studio uses its own `vs-muted`, `vs-faint`, and `vs-line` rather than the hub's corresponding values.

### Named Rules

**The Inherited Roles Rule.** Preserve the hub's color roles when extending shared hub components; keep Video Studio's local surface and density variations scoped to its entry point.

**The Visible State Rule.** Selected tabs have an underline, selected scene cards have an outline and changed label fill, and focus has a gold outline. Preserve these non-color state cues.

Pipeline icon tints are local stage identifiers, not additional brand accents. Success and error notices also have local status colors; do not substitute those for the hub's existing status palette.

## Typography

**Body Font:** the hub inherits the global Inter stack. Video Studio explicitly uses the platform UI stack recorded as `vs-body` and inherits it into fields and buttons.

**Character:** compact application type, with weight and spacing distinguishing sections from controls. The recorded family stacks describe shipped source declarations; font availability is not inferred from CSS alone.

### Hierarchy

- **Title:** `vs-title` applies to section and preview headings.
- **Body:** `vs-body` sets the studio's baseline; idea and scene text use the smaller field-copy size. Idea text has a slightly more open line height (1.7).
- **Label:** ordinary form labels and control copy use the studio's smaller application scale. Buttons use `vs-button`, with primary buttons increasing weight (650).
- **Metadata:** the build also uses smaller type (10–11px) for durations, helper text, and pipeline subtitles. This is observed density, not a minimum size requirement for new surfaces.

No normative display-font token is established here. The shipped studio page heading uses the system family at `clamp(25px, 2.4vw, 34px)`, weight (600), line height (1.2), and tracking (-.025em), with a phone override (27px). The inherited system display face is carried as a craft-floor exception, not canonized for future display work.

## Layout

The studio container centers at a maximum width (1510px), with desktop padding (38px 4.2% 20px). Its workspace uses an editor column and preview column (`minmax(0, 1fr) minmax(280px, 36%)`) separated by a gap (38px). The preview is sticky at (22px). These are studio layout rules, not a global page template.

At (1150px) and below, gutters and column gaps tighten. At (850px) and below, connection fields stack, the pipeline scrolls horizontally, and the project name is hidden. At (650px) and below, the workspace becomes a vertical stack with side gutters (16px); the preview stops sticking, and adjacent Preview scene / Back to scene links connect the editor and full preview. At (1500px) and above the preview mat and frame enlarge.

Repeated gaps are recorded in spacing tokens. Other observed studio values are contextual, not a mathematical spacing scale. The horizontal scene strip and pipeline retain their own overflow rather than expanding the page width.

## Elevation & Depth

Video Studio uses flat tonal surfaces and borders rather than panel box shadows. Its preview caption uses a dark gradient and text shadow (`0 1px 4px #000`) over media. This is a legibility treatment, not container elevation. The incumbent hub supports button shadows and a signed-in desk shadow (`0 18px 48px rgba(11, 34, 51, 0.14)`); the studio's flatness does not ban those existing devices.

## Shapes

Hub controls retain their larger rounded corners. Studio panels use `vs-panel` rounding, its buttons and scene thumbnails use `vs-control`, and fields use `vs-field`. Draft tags and the preview frame use smaller corners. Scene thumbnails crop media; the portrait preview uses `object-fit: cover`, with landscape and square ratios also supported. These media-specific shapes do not prescribe the proportions of other application cards.

## Components

### Buttons

Hub controls remain larger: shared buttons have a minimum height (44px), horizontal padding (20px), bold type, and their existing primary/accent/ghost/danger/quiet variants. Their focus treatment uses the hub focus ring and offset.

Studio buttons are compact: base minimum height (38px), with the primary/secondary shapes and padding recorded above. Primary hover uses the shared ice-hover value; secondary hover changes fill (`#263f4c`) and border (`#bed4e2`). Quiet buttons have transparent borders and a pale foreground. Selected controls use gold borders and text. Disabled studio controls reduce opacity (.42); this is local behavior, not a replacement for hub disabled tokens.

Studio focus-visible uses a gold outline (2px) with offset (4px); uploads also expose that outline through focus-within. Background and border transitions last (.15s). Reduced-motion mode disables animation and transitions.

### Chips

The draft tag is a small outlined status label with padding (2px 7px), muted text, and the local divider border. It has no invented interactive state. Tab counts are separate compact filled badges, rather than global filter chips.

### Cards / Containers

The idea panel uses the recorded studio panel token and padding. The preview mat is a distinct darker teal surface (`#16313f`), normally with padding (22px). Connections use another local surface (`#183340`), a visible border (`#6a8796`), and padding (22px). Keep these local container roles separate from hub cards.

### Inputs / Fields

Studio fields have a local stroke (`#59717f`), recessed fill, pale text, and placeholder color (`#9db4c2`). Inputs use the recorded padding; scene textareas use (11px 13px), while the idea textarea uses (13px 14px). Textareas resize vertically. Select controls begin at a minimum height (36px), with smaller preview ratio controls. Keyboard focus follows the studio outline above.

### Navigation

Studio tabs are horizontal text controls separated by a bottom rule. The selected tab uses ice text and an underline (2px); hover moves text to white. The pipeline is informational, not tab navigation. Preserve Celebrity Solar, Hip-Hop Solar, and Gas-Genie as separate products with their own dashboards and navigation, as required by PRODUCT.md.

### Scene selection and preview

Selecting a scene updates the editor, preview, and timeline together. The active scene thumbnail combines an ice outline with a filled pale footer. Timeline segments use duration-based widths and a lighter active fill. Time values use tabular numbers. The portrait frame has a maximum width (254px) on ordinary desktop layouts, (235px) on phones, and (270px) on wide screens. Caption overlays use white, centered text over the dark gradient; still preview motion is a slow scale animation, disabled by reduced-motion preference.

## Do's and Don'ts

### Do:

- **Do** preserve inherited hub color roles and scope studio surface variations to Video Studio.
- **Do** retain visible outlines, underlines, and fill changes for keyboard focus and selection.
- **Do** preserve the studio's mobile links between the selected scene editor and full preview.
- **Do** keep the solar example labeled as existing Power Genie imagery.

### Don't:

- **Don't** apply the studio's smaller controls or local surface colors globally to the hub.
- **Don't** merge or remove the separate Celebrity Solar, Hip-Hop Solar, and Gas-Genie navigation.
- **Don't** turn local pipeline tints or media aspect ratios into brand-wide rules.

Evidence: `src/index.css`, sampled shared controls in `src/hub/ui.tsx`, `src/video/video-studio.css`, `src/video/VideoStudio.tsx`, `src/video/main.tsx`, `video-studio.html`, PRODUCT.md, and the Video Studio surface contract; rendered desktop screenshot `.impeccable/review/desktop.png`.

Sidecar tonal ramps are synthesized panel metadata for exploration, not colors used or prescribed by the shipped application. Component specimens reproduce the source's local styling with live CSS-variable bindings and literal fallbacks.

Not canonized or repaired: inherited system display typography, small metadata density, and the studio's duplicated/changed local neutral tokens. This is an ordinary extension documentation pass, not authority to redesign the incumbent system. No kickers, glyph icons, or hard offset shadows were observed in the sampled studio; caption text shadow serves media legibility.
