import Link from "next/link";

const TABS = [
  { href: "", label: "Dashboard" },
  { href: "/prompts", label: "Prompts" },
  { href: "/fixes", label: "Fixes" },
  { href: "/reviews", label: "Reviews" },
  { href: "/report", label: "Report" },
];

export default async function BrandLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div>
      <nav className="mb-6 flex gap-4 border-b text-sm print:hidden">
        {TABS.map((tab) => (
          <Link
            key={tab.label}
            href={`/app/brands/${id}${tab.href}`}
            className="text-muted-foreground hover:text-foreground border-b-2 border-transparent pb-2"
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
