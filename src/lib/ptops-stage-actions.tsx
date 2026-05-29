import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { LOST_REASONS, type Lead } from "./ptops-types";

export function WonDialog({
  open,
  lead,
  userId,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  lead: Lead | null;
  userId: string | undefined;
  onOpenChange: (b: boolean) => void;
  onDone?: () => void;
}) {
  const qc = useQueryClient();
  const [value, setValue] = useState<string>("");

  useEffect(() => {
    if (open) setValue(lead?.monthly_value_nis ? String(lead.monthly_value_nis) : "");
  }, [open, lead]);

  const confirm = useMutation({
    mutationFn: async () => {
      if (!lead) throw new Error("No lead");
      if (!userId) throw new Error("Not signed in");
      const monthly = Number(value);
      if (!value || Number.isNaN(monthly) || monthly <= 0) throw new Error("Monthly value required");
      const { error: e1 } = await supabase
        .from("leads")
        .update({ stage: "WON", monthly_value_nis: monthly })
        .eq("id", lead.id);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("tasks").insert({
        user_id: userId,
        title: `Onboard ${lead.name} to CaterFlow`,
        domain: "SALES",
        priority: 1,
        status: "TODO",
        lead_id: lead.id,
        notes: `New paying customer. Monthly value: ₪${monthly}/mo`,
      });
      if (e2) throw e2;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["lead", lead?.id] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Won! Onboarding task created.");
      onOpenChange(false);
      onDone?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Congratulations! Mark as Won</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-2">
            <Label>Monthly value (₪)</Label>
            <Input
              type="number"
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="e.g. 1500"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => confirm.mutate()} disabled={confirm.isPending}>
            {confirm.isPending ? "Saving…" : "Confirm Won"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function LostDialog({
  open,
  lead,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  lead: Lead | null;
  onOpenChange: (b: boolean) => void;
  onDone?: () => void;
}) {
  const qc = useQueryClient();
  const [reason, setReason] = useState<string>("Other");

  useEffect(() => {
    if (open) setReason(lead?.lost_reason ?? "Other");
  }, [open, lead]);

  const confirm = useMutation({
    mutationFn: async () => {
      if (!lead) throw new Error("No lead");
      const { error } = await supabase
        .from("leads")
        .update({ stage: "LOST", lost_reason: reason })
        .eq("id", lead.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["lead", lead?.id] });
      toast.success("Marked as lost");
      onOpenChange(false);
      onDone?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark as Lost</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-2">
            <Label>Lost reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LOST_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => confirm.mutate()} disabled={confirm.isPending}>
            {confirm.isPending ? "Saving…" : "Confirm Lost"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
