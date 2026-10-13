// Portal glyphs: simple 24px line icons, tinted per product. Not vendor artwork.

const shield = "M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z";

const portalIcons: Record<string, { d: string; color: string; w?: number }> = {
  m365: { d: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z", color: "light-dark(#C43E1C, #F26B3A)" },
  exchange: { d: "M4.5 5h15A1.5 1.5 0 0 1 21 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-11A1.5 1.5 0 0 1 4.5 5zM4 7l8 6 8-6", color: "light-dark(#0F6CBD, #4BA3F0)" },
  entra: { d: "M12 3l8 9-8 9-8-9zM12 3v18M4 12h16", color: "light-dark(#1A7FC9, #5AB0F0)" },
  teams: { d: "M9 5a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM3.5 19c.7-3 3-4.8 5.5-4.8s4.8 1.8 5.5 4.8M17 6.6a2.3 2.3 0 1 1 0 4.6M16 14.3c2.3.1 4 1.6 4.5 4", color: "light-dark(#4B53BC, #8B90F0)" },
  azure: { d: "M10 4h4.5L9 20H4.5zM14.5 4L20 20h-6.5", color: "light-dark(#0072C6, #3FA3EC)" },
  intune: { d: "M5 5h14v10H5zM3 19h18", color: "light-dark(#0F6CBD, #4BA3F0)" },
  sharepoint: { d: "M11 4a5 5 0 1 1 0 10 5 5 0 0 1 0-10zM7.5 11a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM16 13a3 3 0 1 1 0 6 3 3 0 0 1 0-6z", color: "light-dark(#036C70, #3CC4C8)" },
  defender: { d: shield, color: "light-dark(#1F5FA8, #5B9BEA)" },
  purview: { d: shield + "M9 12l2 2 4-4", color: "light-dark(#13807A, #48C7BE)" },
  powerplatform: { d: "M12 3l9 9-9 9-9-9zM12 8.5l3.5 3.5-3.5 3.5-3.5-3.5z", color: "light-dark(#742774, #D17BD1)" },
  powerbi: { d: "M6 20v-6M11 20V10M16 20V5", color: "light-dark(#B58A00, #F2C811)", w: 2.8 },
  link: { d: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1", color: "currentColor" },
};

export function PortalIcon({ id, size = 16 }: { id: string | null; size?: number }) {
  const g = portalIcons[id ?? "link"] ?? portalIcons.link;
  return (
    <svg className="ic" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={g.color} strokeWidth={g.w ?? 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d={g.d} />
    </svg>
  );
}

export const tabIcons = {
  klanten: "M9 8a3 3 0 1 0 0-.01M3.5 19c.7-3 3-4.8 5.5-4.8s4.8 1.8 5.5 4.8M16 6.5a2.5 2.5 0 1 1 0 5M17 14.5c2 .3 3.3 1.8 3.7 4",
  portalen: "M4 5h16v14H4zM4 9h16M8 5v4",
  algemeen: "M4 7h10M18 7h2M4 17h4M12 17h8M16 5v4M10 15v4",
  delen: "M12 4v11M8 8l4-4 4 4M5 13v6h14v-6",
};

export const Svg = ({ d, size = 16, sw = 2.1 }: { d: string; size?: number; sw?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
    <path d={d} />
  </svg>
);
