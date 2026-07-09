"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string };

/**
 * Text-only mobile bottom nav with a visible active-tab indicator.
 * Kept as a client component so we can read the current pathname without
 * threading it through the server layout.
 */
export default function BottomNav({ items }: { items: Item[] }) {
  const pathname = usePathname() ?? "/";

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-card/95 backdrop-blur safe-bottom">
      <div
        className="max-w-5xl mx-auto grid"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((n) => {
          const active = isActive(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active ? "page" : undefined}
              className="relative flex items-center justify-center py-3 text-sm active:bg-bg">
              <span
                aria-hidden
                className={`absolute top-0 h-0.5 rounded-b-full transition-all duration-200 ${
                  active ? "w-8 bg-accent" : "w-0 bg-transparent"
                }`}
              />
              <span className={active ? "text-fg font-semibold" : "text-muted"}>
                {n.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
