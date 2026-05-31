import { type ReactNode, useEffect, useState } from "react";
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
  Sun,
  Moon,
  Menu,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const ADMIN_NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, group: "Overview" },
  { to: "/tasks", label: "Tasks", icon: CheckSquare, group: "Work" },
  { to: "/crm", label: "CRM", icon: Users, group: "Work" },
  { to: "/dev", label: "Dev Tracker", icon: Wrench, group: "Work" },
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

function NavList({ nav, pathname, onNavigate }: { nav: readonly NavItem[]; pathname: string; onNavigate?: () => void }) {
  const grouped = groupNav(nav);
  return (
    <>
      {grouped.map(([group, items]) => (
        <div key={group} className="mb-5">
          <div className="mb-1.5 px-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70">
            {group}
          </div>
          <div className="space-y-0.5">
            {items.map((item) => {
              const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={onNavigate}
                  className={cn(
                    "group relative flex min-h-11 items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-all",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-elegant"
                      : "text-sidebar-foreground/75 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-gradient-primary transition-opacity",
                      active ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <item.icon
                    className={cn(
                      "h-4 w-4 transition-colors",
                      active ? "text-primary" : "text-sidebar-foreground/60 group-hover:text-sidebar-foreground",
                    )}
                  />
                  <span className="font-medium">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

function BrandMark() {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-primary shadow-glow">
        <Sparkles className="h-4 w-4 text-primary-foreground" />
      </div>
      <div className="flex flex-col leading-tight">
        <span className="font-display text-sm font-semibold tracking-tight">PTOPS</span>
        <span className="font-mono text-[10px] text-muted-foreground">PizanTech · v0.1</span>
      </div>
    </div>
  );
}

export function AppShell({ children, requireAdmin = false }: { children: ReactNode; requireAdmin?: boolean }) {
  const { session, role, loading, user, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { theme, toggle } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile nav on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

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
  const initials = (user?.email ?? "?").slice(0, 2).toUpperCase();

  const userFooter = (
    <div className="border-t border-sidebar-border p-3">
      <div className="mb-2 flex items-center gap-2.5 rounded-lg bg-sidebar-accent/40 p-2.5">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-gradient-primary font-mono text-xs font-semibold text-primary-foreground">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium">{user?.email}</div>
          <div className="mt-0.5 inline-block rounded border border-border/60 px-1.5 py-0 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
            {role ?? "—"}
          </div>
        </div>
      </div>
      <div className="flex gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="flex-1 justify-start text-muted-foreground hover:text-foreground"
          onClick={async () => {
            await signOut();
            navigate({ to: "/login", replace: true });
          }}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 text-muted-foreground hover:text-foreground"
          onClick={toggle}
          aria-label={theme === "dark" ? "Switch to bright mode" : "Switch to dark mode"}
          title={theme === "dark" ? "Switch to bright mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen w-full">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar/80 text-sidebar-foreground backdrop-blur-xl md:flex">
        <div className="flex h-16 items-center border-b border-sidebar-border px-5">
          <BrandMark />
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <NavList nav={nav} pathname={pathname} />
        </nav>
        {userFooter}
      </aside>

      {/* Mobile top bar */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-sidebar-border bg-sidebar/95 px-3 backdrop-blur-xl md:hidden">
        <BrandMark />
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggle}
            aria-label={theme === "dark" ? "Switch to bright mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>
      </header>

      {/* Mobile drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="flex w-[85vw] max-w-xs flex-col border-r border-sidebar-border bg-sidebar p-0 text-sidebar-foreground"
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex h-14 items-center border-b border-sidebar-border px-4">
            <BrandMark />
          </div>
          <nav className="flex-1 overflow-y-auto px-3 py-4">
            <NavList nav={nav} pathname={pathname} onNavigate={() => setMobileOpen(false)} />
          </nav>
          <div style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>{userFooter}</div>
        </SheetContent>
      </Sheet>

      <main className="flex-1 overflow-x-hidden pt-14 md:pt-0">{children}</main>
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
    <div className="relative border-b border-border/60 px-4 py-4 md:px-8 md:py-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
      <div className="flex flex-col items-start gap-3 md:flex-row md:flex-wrap md:items-end md:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-semibold tracking-tight text-foreground md:text-2xl">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex w-full flex-wrap items-center gap-2 md:w-auto">{actions}</div>}
      </div>
    </div>
  );
}
