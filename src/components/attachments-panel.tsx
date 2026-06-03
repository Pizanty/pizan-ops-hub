import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { Attachment } from "@/lib/ptops-types";

const BUCKET = "attachments";
const MAX_BYTES = 25 * 1024 * 1024;

function formatSize(n: number | null): string {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function AttachmentsPanel({
  entityType,
  entityId,
}: {
  entityType: "task" | "dev_item";
  entityId: string;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const queryKey = ["attachments", entityType, entityId] as const;

  const { data: items = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attachments")
        .select("*")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Attachment[];
    },
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (!user) throw new Error("Not signed in");
      if (file.size > MAX_BYTES) throw new Error(`File too large (max 25 MB)`);
      const attachment_id = crypto.randomUUID();
      const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(0, 200);
      const storage_path = `${entityType}/${entityId}/${attachment_id}-${safeName}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(storage_path, file, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });
      if (upErr) throw upErr;
      const { error } = await supabase.from("attachments").insert({
        id: attachment_id,
        user_id: user.id,
        entity_type: entityType,
        entity_id: entityId,
        bucket: BUCKET,
        storage_path,
        filename: file.name,
        mime_type: file.type || null,
        size_bytes: file.size,
      });
      if (error) {
        await supabase.storage.from(BUCKET).remove([storage_path]);
        throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      toast.success("Uploaded");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (a: Attachment) => {
      await supabase.storage.from(BUCKET).remove([a.storage_path]);
      const { error } = await supabase.from("attachments").delete().eq("id", a.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      toast.success("Deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function handleDownload(a: Attachment) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(a.storage_path, 60 * 60);
    if (error || !data?.signedUrl) {
      toast.error(error?.message ?? "Could not get download URL");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) {
        await upload.mutateAsync(f);
      }
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">Attachments</div>
        <div>
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            {busy ? "Uploading…" : "Upload file"}
          </Button>
        </div>
      </div>
      {isLoading ? (
        <div className="text-xs text-muted-foreground">Loading…</div>
      ) : items.length === 0 ? (
        <div className="text-xs text-muted-foreground">No attachments yet.</div>
      ) : (
        <ul className="space-y-1">
          {items.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between gap-2 rounded border border-white/10 bg-card/40 p-2 text-xs"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{a.filename}</div>
                <div className="font-mono text-[10px] text-muted-foreground">
                  {formatSize(a.size_bytes)} · {a.mime_type ?? "—"} ·{" "}
                  {new Date(a.created_at).toLocaleString()}
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button size="sm" variant="ghost" onClick={() => handleDownload(a)}>
                  Download
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => {
                    if (confirm(`Delete ${a.filename}?`)) remove.mutate(a);
                  }}
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
