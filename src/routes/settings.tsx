import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell, PageHeader } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { UserProfile } from "@/lib/ptops-types";

export const Route = createFileRoute("/settings")({
  component: () => <AppShell requireAdmin><SettingsPage /></AppShell>,
});

function SettingsPage() {
  const { user } = useAuth();

  const { data: allUsers = [] } = useQuery({
    queryKey: ["users", "all"],
    queryFn: async () => {
      const { data } = await supabase.from("users").select("*").order("created_at");
      return (data ?? []) as UserProfile[];
    },
  });

  return (
    <>
      <PageHeader title="Settings" description="Account and team." />
      <div className="space-y-6 p-4 md:p-6">
        <Section title="Account">
          <div className="text-sm"><span className="text-muted-foreground">Email:</span> <span className="font-mono">{user?.email}</span></div>
        </Section>

        <Section title="Team members">
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left font-mono text-[10px] uppercase text-muted-foreground">
                <tr><th className="px-3 py-2">Email</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">Joined</th></tr>
              </thead>
              <tbody>
                {allUsers.map((u) => (
                  <tr key={u.id} className="border-t">
                    <td className="px-3 py-2 font-mono text-xs">{u.email}</td>
                    <td className="px-3 py-2">{u.full_name ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">{new Date(u.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">Invite users by sharing the login URL — first user is admin, subsequent are developers.</p>
        </Section>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-lg border bg-card p-5">
      <div className="text-sm font-semibold">{title}</div>
      {children}
    </div>
  );
}
