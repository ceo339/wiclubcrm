/**
 * Line-art icons for the app shell's sidebar nav. Purely a visual anchor to
 * help scan a list of ~9 destinations at a glance — like the nav-card icons
 * they replaced on the old home page, they carry no meaning of their own
 * (unlike the AI-score/health-status badges rejected elsewhere in this
 * app), so there's nothing dishonest about them being simple line art
 * rather than data-driven.
 */
function iconProps() {
  return {
    xmlns: "http://www.w3.org/2000/svg",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "h-5 w-5",
    "aria-hidden": true,
  };
}

export function IconHome() {
  return (
    <svg {...iconProps()}>
      <path d="m4 11 8-6.5 8 6.5" />
      <path d="M6 9.5V19a1 1 0 0 0 1 1h3v-5.5h4V20h3a1 1 0 0 0 1-1V9.5" />
    </svg>
  );
}

export function IconChart() {
  return (
    <svg {...iconProps()}>
      <path d="M4 20V10M12 20V4M20 20v-7" />
    </svg>
  );
}

export function IconFunnel() {
  return (
    <svg {...iconProps()}>
      <path d="M4 5h16l-6 7.5V18l-4 2v-7.5L4 5Z" />
    </svg>
  );
}

export function IconUsers() {
  return (
    <svg {...iconProps()}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <path d="M16 8.5a2.5 2.5 0 1 0 0-5" />
      <path d="M15 14c2.5.3 4.5 2.1 4.5 5" />
    </svg>
  );
}

export function IconCalendar() {
  return (
    <svg {...iconProps()}>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 9.5h17M8 3v3.5M16 3v3.5" />
      <path d="m8.5 14 2 2 4-4" />
    </svg>
  );
}

export function IconBook() {
  return (
    <svg {...iconProps()}>
      <path d="M5 4.5c2 0 5 .5 7 2 2-1.5 5-2 7-2v14c-2 0-5 .5-7 2-2-1.5-5-2-7-2Z" />
      <path d="M12 6.5V18.5" />
    </svg>
  );
}

export function IconWallet() {
  return (
    <svg {...iconProps()}>
      <rect x="3.5" y="6.5" width="17" height="12" rx="2.5" />
      <path d="M3.5 10.5h17" />
      <circle cx="16.5" cy="14.5" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconMail() {
  return (
    <svg {...iconProps()}>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
      <path d="m4.5 7 7.5 6 7.5-6" />
    </svg>
  );
}

export function IconContact() {
  return (
    <svg {...iconProps()}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <circle cx="9.5" cy="10.5" r="2" />
      <path d="M6 16c.5-2 2-3 3.5-3s3 1 3.5 3" />
      <path d="M15 9h2.5M15 12.5h2.5" />
    </svg>
  );
}

export function IconBuilding() {
  return (
    <svg {...iconProps()}>
      <rect x="5" y="3.5" width="9" height="17" rx="1" />
      <rect x="14" y="9" width="5" height="11.5" rx="1" />
      <path d="M7.5 7h1M10.5 7h1M7.5 10.5h1M10.5 10.5h1M7.5 14h1M10.5 14h1" />
    </svg>
  );
}
