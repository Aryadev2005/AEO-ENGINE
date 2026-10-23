import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { auth } from "@/lib/auth";
import { getUsageSummary, getWorkspace, listMembers } from "@/lib/workspace";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const session = await auth();
  if (!session) notFound();

  const workspace = await getWorkspace(session.workspaceId);
  if (!workspace) notFound();

  const members = await listMembers(session.workspaceId);
  const usage = await getUsageSummary(session.workspaceId);
  const totalSpend = usage.reduce((sum, u) => sum + u.costUsd, 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <SettingsForm
        initialName={workspace.name}
        initialBudget={workspace.monthlyBudgetUsd}
        canEdit={session.role === "owner"}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Team</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.email}>
                  <TableCell>{m.email}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{m.role}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            API usage this month — ${totalSpend.toFixed(4)} of ${workspace.monthlyBudgetUsd.toFixed(2)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {usage.length === 0 ? (
            <p className="text-muted-foreground text-sm">No usage yet this month.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Purpose</TableHead>
                  <TableHead>Engine</TableHead>
                  <TableHead>Calls</TableHead>
                  <TableHead>Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usage.map((u) => (
                  <TableRow key={`${u.purpose}:${u.engine}`}>
                    <TableCell className="capitalize">{u.purpose}</TableCell>
                    <TableCell className="capitalize">{u.engine}</TableCell>
                    <TableCell>{u.calls}</TableCell>
                    <TableCell>${u.costUsd.toFixed(4)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
