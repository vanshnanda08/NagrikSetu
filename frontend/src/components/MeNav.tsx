import Link from "next/link";

const LINKS = [
  { href: "/me/reports", label: "My reports" },
  { href: "/me/notifications", label: "Notifications" },
  { href: "/me/profile", label: "Profile" },
  { href: "/me/security", label: "Security" },
] as const;

/** The screens that belong to the signed-in person, one tap from each other. */
export function MeNav({ current }: { current: (typeof LINKS)[number]["href"] }) {
  return (
    <nav aria-label="Your account" className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-dense">
      {LINKS.map((l) =>
        l.href === current ? (
          <span key={l.href} aria-current="page" className="font-semibold text-ink">
            {l.label}
          </span>
        ) : (
          <Link key={l.href} href={l.href} className="text-ink underline">
            {l.label}
          </Link>
        ),
      )}
    </nav>
  );
}
