"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { accentColor } from "@/lib/theme";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", match: (p: string) => p === "/" },
  { href: "/trades", label: "Trades", match: (p: string) => p.startsWith("/trades") },
  { href: "/checklist", label: "Checklist & News", match: (p: string) => p.startsWith("/checklist") },
];

function DashboardIcon({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <rect x="1" y="1" width="7" height="7" rx="1.5" fill={color} />
      <rect x="10" y="1" width="7" height="4" rx="1.5" fill={color} opacity="0.55" />
      <rect x="10" y="7" width="7" height="10" rx="1.5" fill={color} opacity="0.55" />
      <rect x="1" y="10" width="7" height="7" rx="1.5" fill={color} opacity="0.55" />
    </svg>
  );
}

function TradesIcon({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <rect x="1" y="9" width="4" height="8" rx="1" fill={color} />
      <rect x="7" y="4" width="4" height="13" rx="1" fill={color} />
      <rect x="13" y="12" width="4" height="5" rx="1" fill={color} opacity="0.55" />
    </svg>
  );
}

function ChecklistIcon({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <rect x="1" y="1" width="16" height="16" rx="3" fill="none" stroke={color} strokeWidth="1.6" />
      <path d="M5 9l3 3 5-6" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const ICONS = [DashboardIcon, TradesIcon, ChecklistIcon];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="sidebar">
      <div className="sidebar-brand">
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: accentColor,
            boxShadow: `0 0 12px ${accentColor}`,
            animation: "pulseDot 2.4s ease-in-out infinite",
          }}
        />
        <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "0.02em" }}>
          FLUX<span style={{ color: accentColor }}>JOURNAL</span>
        </div>
      </div>

      <div className="sidebar-nav">
        {NAV_ITEMS.map((item, i) => {
          const active = item.match(pathname);
          const Icon = ICONS[i];
          return (
            <Link
              key={item.href}
              href={item.href}
              className="sidebar-nav-item"
              style={{
                cursor: "pointer",
                fontWeight: active ? 600 : 500,
                color: active ? "oklch(0.97 0.004 290)" : "oklch(0.66 0.02 290)",
                background: active ? "oklch(0.68 0.19 293 / 0.14)" : "transparent",
              }}
            >
              <Icon color={active ? accentColor : "oklch(0.55 0.02 290)"} />
              <span className="sidebar-nav-label">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
