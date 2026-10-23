import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCheckerUsage, getTotalLlmSpend, isAdminEmail, listAllLeads } from "@/lib/admin";
import { auth } from "@/lib/auth";

export default async function AdminPage() {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) notFound();

  const [leads, usage, totalSpend] = await Promise.all([listAllLeads(), getCheckerUsage(), getTotalLlmSpend()]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-8">
      <h1 className="text-2xl font-bold">Admin</h1>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Total LLM spend</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold">${totalSpend.toFixed(2)}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Checker runs</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold">{usage.totalChecks}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Checker unlocks</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold">{usage.totalUnlocks}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Leads ({leads.length})</CardTitle>
          <Button variant="outline" size="sm" nativeButton={false} render={<a href="/api/admin/leads/export" />}>
            Export CSV
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Business</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>WhatsApp</TableHead>
                <TableHead>Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>{l.createdAt.toLocaleDateString()}</TableCell>
                  <TableCell>{l.businessName}</TableCell>
                  <TableCell>{l.email ?? "—"}</TableCell>
                  <TableCell>{l.whatsapp ?? "—"}</TableCell>
                  <TableCell>{l.checkerResultId ? "Checker" : "Pricing"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
