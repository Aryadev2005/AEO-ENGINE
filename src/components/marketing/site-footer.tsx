const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "AEO Engine";

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-muted-foreground">
        {APP_NAME}. We never generate, post, or suggest posting fake reviews — ever.
      </div>
    </footer>
  );
}
