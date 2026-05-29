import { type ReactNode, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  CheckSquare,
  Users,
  Wrench,
  FileText,
  BookOpen,
  BarChart3,
  Settings,
  LogOut,
  Loader2,
  Sparkles,
  Menu,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const ADMIN_NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, group: "Overview" },
  { to: "/tasks", label: "Tasks", icon: CheckSquare, group: "Work" },
  { to: "/crm", label: "CRM", icon: Users, group: "Work" },
  { to: "/dev", label: "Dev Tracker", icon: Wrench, group: "Work" },
  { to: "/briefing", label: "Briefings", icon: FileText, group: "Knowledge" },
  { to: "/context", label: "Context", icon: BookOpen, group: "Knowledge" },
  { to: "/reports", label: "Reports", icon: BarChart3, group: "Knowledge" },
  { to: "/settings", label: "Settings", icon: Settings, group: "System" },
] as const;

const DEV_NAV = [{ to: "/dev", label: "Dev Tracker", icon: Wrench, group: "Work" }] as const;

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; group: string };

function groupNav(items: readonly NavItem[]) {
  const map = new Map<string, NavItem[]>();
  for (const item of items) {
    const arr = map.get(item.group) ?? [];
    arr.push(item);
    map.set(item.group, arr);
  }
  return Array.from(map.entries());
}

export function AppShell({ children, requireAdmin = false }: { children: ReactNode; requireAdmin?: boolean }) {
  const { session, role, loading, user, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [navOpen, setNavOpen] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!session) {
    navigate({ to: "/login", replace: true });
    return null;
  }

  if (requireAdmin && role !== "admin") {
    navigate({ to: "/dev", replace: true });
    return null;
  }

  const nav = role === "admin" ? ADMIN_NAV : DEV_NAV;
  const grouped = groupNav(nav as readonly NavItem[]);
  const initials = (user?.email ?? "?").slice(0, 2).toUpperCase();
  const current = nav.find((item) =>
    item.to === "/" ? pathname === "/" : pathname.startsWith(item.to),
  );

  return (
    <div className="flex min-h-screen w-full flex-col">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl">
        <div className="flex h-16 items-center gap-3 px-6">
          <Dialog open={navOpen} onOpenChange={setNavOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="gap-2 border-border/60 bg-card/60 hover:bg-accent/60"
              >
                <Menu className="h-4 w-4" />
                <span className="hidden font-medium sm:inline">Menu</span>
              </Button>
            </DialogTrigger>
            <DialogContent
              className="max-w-xl gap-0 overflow-hidden border-border/60 bg-card/95 p-0 shadow-elegant backdrop-blur-xl"
              showCloseButton={false}
            >
              <div className="flex items-center gap-3 border-b border-border/60 px-5 py-4">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-primary shadow-glow">
                  <Sparkles className="h-4 w-4 text-primary-foreground" />
                </div>
                <div className="flex flex-col leading-tight">
                  <span className="font-display text-sm font-semibold tracking-tight">PTOPS</span>
                  <span className="font-mono text-[10px] text-muted-foreground">PizanTech · v0.1</span>
                </div>
              </div>
              <div className="max-h-[70vh] overflow-y-auto px-4 py-4">
                {grouped.map(([group, items]) => (
                  <div key={group} className="mb-4">
                    <div className="mb-1.5 px-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70">
                      {group}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {items.map((item) => {
                        const active =
                          item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
                        return (
                          <Link
                            key={item.to}
                            to={item.to}
                            onClick={() => setNavOpen(false)}
                            className={cn(
                              "group flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition-all",
                              active
                                ? "border-primary/40 bg-accent text-accent-foreground shadow-glow"
                                : "border-border/50 bg-card/40 text-foreground/80 hover:border-primary/30 hover:bg-accent/60 hover:text-foreground",
                            )}
                          >
                            <item.icon
                              className={cn(
                                "h-4 w-4 transition-colors",
                                active ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
                              )}
                            />
                            <span className="font-medium">{item.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </DialogContent>
          </Dialog>

          <Link to="/" className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-primary shadow-glow">
              <Sparkles className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <span className="font-display text-sm font-semibold tracking-tight">PTOPS</span>
          </Link>

          {current && (
            <div className="ml-2 hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
              <span>/</span>
              <span className="font-medium text-foreground">{current.label}</span>
            </div>
          )}

          <div className="ml-auto flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2 pl-1.5 pr-2.5">
                  <div className="grid h-7 w-7 place-items-center rounded-md bg-gradient-primary font-mono text-[10px] font-semibold text-primary-foreground">
                    {initials}
                  </div>
                  <span className="hidden text-xs text-muted-foreground sm:inline">
                    {role ?? "—"}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="flex flex-col gap-0.5">
                  <span className="truncate text-xs">{user?.email}</span>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {role ?? "—"}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => navigate({ to: "/settings" })}>
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={async () => {
                    await signOut();
                    navigate({ to: "/login", replace: true });
                  }}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-x-hidden">{children}</main>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="relative border-b border-border/60 px-8 py-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
