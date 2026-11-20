import { useCallback, useEffect, useState } from "react";
import { BookOpen, Compass, Cpu, FlaskConical, GraduationCap, Inbox, Menu, RotateCcw, Truck, X } from "lucide-react";
import { ArchitectureGuide } from "./components/ArchitectureGuide";
import { BookingsLedger } from "./components/BookingsLedger";
import { CircuitsCatalog } from "./components/CircuitsCatalog";
import { DispatchDesk } from "./components/DispatchDesk";
import { EngineAndTests } from "./components/EngineAndTests";
import { FleetAndGuides } from "./components/FleetAndGuides";
import { LoraTrainingPlaybook } from "./components/LoraTrainingPlaybook";
import type {
  BookingRecord,
  CircuitRecord,
  HealthResponse,
  NavSection,
  PendingApprovalItem,
} from "./types";

const NAV_ITEMS: Array<{ id: NavSection; label: string; icon: typeof Inbox }> = [
  { id: "dispatch", label: "Quotes & Approvals", icon: Inbox },
  { id: "bookings", label: "Bookings", icon: BookOpen },
  { id: "fleet", label: "Vehicles & Guides", icon: Truck },
  { id: "circuits", label: "Parks & Rates", icon: Compass },
  { id: "engine", label: "System & Checks", icon: FlaskConical },
  { id: "training", label: "Model Training", icon: Cpu },
  { id: "guide", label: "AI & System Guide", icon: GraduationCap },
];

export default function App() {
  const [section, setSection] = useState<NavSection>("dispatch");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [approvals, setApprovals] = useState<PendingApprovalItem[]>([]);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [circuits, setCircuits] = useState<CircuitRecord[]>([]);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [resetting, setResetting] = useState(false);

  const refreshData = useCallback(async () => {
    const [appRes, bkRes, cirRes, hRes] = await Promise.all([
      fetch("/api/approvals"),
      fetch("/api/bookings"),
      fetch("/api/circuits"),
      fetch("/api/health"),
    ]);
    if (appRes.ok) setApprovals((await appRes.json()) as PendingApprovalItem[]);
    if (bkRes.ok) setBookings((await bkRes.json()) as BookingRecord[]);
    if (cirRes.ok) setCircuits((await cirRes.json()) as CircuitRecord[]);
    if (hRes.ok) setHealth((await hRes.json()) as HealthResponse);
  }, []);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  async function handleResetDemo() {
    setResetting(true);
    try {
      const res = await fetch("/api/admin/reset", { method: "POST" });
      if (res.ok) {
        await refreshData();
      }
    } finally {
      setResetting(false);
    }
  }

  const activeLabel = NAV_ITEMS.find((n) => n.id === section)?.label ?? "Quotes & Approvals";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Desktop Sidebar (240px) */}
      <aside className="hidden lg:flex lg:w-60 lg:flex-col lg:fixed lg:inset-y-0 bg-gradient-to-b from-sky-100 via-sky-100/90 to-sky-200/80 border-r border-sky-200">
        <div className="h-14 px-5 flex items-center border-b border-sky-200/80">
          <span className="text-base font-bold tracking-tight text-sky-950 whitespace-nowrap">
            Safari Dispatch OS
          </span>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={`w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? "bg-sky-700 text-white shadow-xs"
                    : "text-sky-900 hover:bg-sky-200/70 hover:text-sky-950"
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Icon className={`w-4 h-4 shrink-0 ${active ? "text-white" : "text-sky-700"}`} />
                  <span>{item.label}</span>
                </span>
                {item.id === "dispatch" && approvals.length > 0 && (
                  <span
                    className={`font-mono text-xs tabular-nums font-semibold ${
                      active ? "text-amber-200" : "text-amber-700"
                    }`}
                  >
                    {approvals.length}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Mobile Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div className="fixed inset-0 bg-slate-900/40" onClick={() => setMobileNavOpen(false)} />
          <aside className="relative w-64 max-w-full bg-gradient-to-b from-sky-100 via-sky-100/90 to-sky-200/80 h-full border-r border-sky-200 flex flex-col z-50">
            <div className="h-14 px-4 flex items-center justify-between border-b border-sky-200/80">
              <span className="text-base font-bold text-sky-950">Safari Dispatch OS</span>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="p-1.5 text-sky-800 hover:text-sky-950"
                aria-label="Close navigation"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="p-3 space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = section === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSection(item.id);
                      setMobileNavOpen(false);
                    }}
                    className={`w-full flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                      active
                        ? "bg-sky-700 text-white shadow-xs"
                        : "text-sky-900 hover:bg-sky-200/70 hover:text-sky-950"
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon className={`w-4 h-4 shrink-0 ${active ? "text-white" : "text-sky-700"}`} />
                      <span>{item.label}</span>
                    </span>
                    {item.id === "dispatch" && approvals.length > 0 && (
                      <span
                        className={`font-mono text-xs tabular-nums font-semibold ${
                          active ? "text-amber-200" : "text-amber-700"
                        }`}
                      >
                        {approvals.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content Viewport */}
      <div className="flex-1 lg:pl-60 flex flex-col min-w-0">
        <header className="h-14 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-8 sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden p-1.5 -ml-1.5 text-slate-600 hover:text-slate-900"
              aria-label="Open navigation"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm truncate">
              <span className="text-slate-500 hidden sm:inline">Nairobi Safari Desk</span>
              <span className="text-slate-400 hidden sm:inline" aria-hidden="true">/</span>
              <h1 className="font-semibold text-slate-900 truncate">{activeLabel}</h1>
            </div>
          </div>

          <button
            type="button"
            disabled={resetting}
            onClick={() => void handleResetDemo()}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {resetting ? "Resetting..." : "Reset Sample Data"}
          </button>
        </header>

        <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto">
          {section === "dispatch" && (
            <DispatchDesk approvals={approvals} health={health} onWorkflowComplete={refreshData} />
          )}
          {section === "bookings" && (
            <BookingsLedger bookings={bookings} onNavigateToDispatch={() => setSection("dispatch")} />
          )}
          {section === "fleet" && <FleetAndGuides />}
          {section === "circuits" && <CircuitsCatalog circuits={circuits} />}
          {section === "engine" && <EngineAndTests health={health} onRefreshHealth={refreshData} />}
          {section === "training" && <LoraTrainingPlaybook />}
          {section === "guide" && <ArchitectureGuide />}
        </main>
      </div>
    </div>
  );
}
