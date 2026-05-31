import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell, PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { UserProfile } from "@/lib/ptops-types";
import { StatusPill } from "@/lib/ptops-ui";

export const Route = createFileRoute("/settings")({
  component: () => <AppShell requireAdmin><SettingsPage /></AppShell>,
});

function SettingsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: profile } = useQuery({
    queryKey: ["users", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.from("users").select("*").eq("id", user!.id).maybeSingle();
      return data as UserProfile | null;
    },
  });

  const [telegramId, setTelegramId] = useState<string>("");
  useEffect(() => { if (profile?.telegram_chat_id != null) setTelegramId(String(profile.telegram_chat_id)); }, [profile?.telegram_chat_id]);

  const saveTelegram = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      const val = telegramId.trim() === "" ? null : Number(telegramId);
      if (val !== null && Number.isNaN(val)) throw new Error("Must be a number");
      const { error } = await supabase.from("users").update({ telegram_chat_id: val }).eq("id", user.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); toast.success("Telegram chat ID saved"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ["users", "all"],
    queryFn: async () => {
      const { data } = await supabase.from("users").select("*").order("created_at");
      return (data ?? []) as UserProfile[];
    },
  });

  return (
    <>
      <PageHeader title="Settings" description="Account, integrations, and team." />
      <div className="space-y-6 p-4 md:p-6">
        <Section title="Account">
          <div className="text-sm"><span className="text-muted-foreground">Email:</span> <span className="font-mono">{user?.email}</span></div>
        </Section>

        <Section title="Telegram">
          <p className="text-xs text-muted-foreground">DM your bot to learn your chat ID, then paste it here. The bot will be able to push briefings to you.</p>
          <div className="flex max-w-md gap-2">
            <Input value={telegramId} onChange={(e) => setTelegramId(e.target.value)} placeholder="123456789" />
            <Button onClick={() => saveTelegram.mutate()} disabled={saveTelegram.isPending}>Save</Button>
          </div>
        </Section>

        <Section title="External services">
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div className="flex items-center justify-between rounded border p-3">
              <span>generate-briefing edge fn</span><StatusPill tone="muted">deployed via CLI</StatusPill>
            </div>
            <div className="flex items-center justify-between rounded border p-3">
              <span>telegram-webhook edge fn</span><StatusPill tone="muted">deployed via CLI</StatusPill>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">These functions live outside the app and are deployed independently. PTOPS just reads/writes their data.</p>
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
