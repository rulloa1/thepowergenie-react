export interface Section {
  id: string;
  label: string;
  still: string;
  stillMobile?: string;
  clip: string;
  clipMobile?: string;
  accent?: string;
  scroll?: number;
  linger?: number;
  eyebrow?: string;
  title?: string;
  body?: string;
  tags?: string[];
  cta?: {
    primary?: { label: string; href: string };
    secondary?: { label: string; href: string };
  };
  _seg?: any; // internal engine use
}

export interface Config {
  brand?: {
    name: string;
    href: string;
    logo?: string;
  };
  mobileClipsUseDesktopFraming?: boolean;
  diveScroll?: number;
  connScroll?: number;
  crossfade?: number;
  idle?: boolean;
  idleRange?: number;
  idlePeriod?: number;
  hint?: string;
  nav?: boolean;
  atmosphere?: boolean;
  cta?: {
    label: string;
    href: string;
  };
  sections: Section[];
  connectors?: (string | null)[];
  connectorsMobile?: (string | null)[];
}

export interface Segment {
  kind: 'dive' | 'conn';
  si: number;
  clip: string | null;
  clipM: string | null;
  still: string | null;
  stillM: string | null;
  accent: string | undefined;
  w: number;
  linger: number;
  start?: number;
  end?: number;
  el?: HTMLDivElement;
  img?: HTMLImageElement;
  video?: HTMLVideoElement | null;
  hasClip?: boolean;
  loading?: boolean;
  ready?: boolean;
  cur?: number;
  target?: number;
  visible?: boolean;
  failed?: boolean;
}
