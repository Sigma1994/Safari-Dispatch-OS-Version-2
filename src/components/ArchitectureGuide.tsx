import { useMemo, useState } from "react";
import { BookOpen, Briefcase, Code2, Cpu, Search } from "lucide-react";
import {
  computeArchitectureGuideWordCount,
  GLOSSARY_ENTRIES,
  GUIDE_CHAPTERS,
  TECH_STACK_MATRIX,
  type GuideChapter,
} from "../data/aiArchitectureGuideData";
import {
  ConcurrencyToctouVisual,
  ConstrainedDecodingVisual,
  EndToEndPipelineVisual,
  QloraMatrixVisual,
} from "./ArchitectureGuideVisuals";

type AudienceView = "both" | "executive" | "engineer";

function renderChapterVisual(visualId?: GuideChapter["visualId"]) {
  if (!visualId) return null;
  if (visualId === "pipeline") return <EndToEndPipelineVisual />;
  if (visualId === "nlu_decoding") return <ConstrainedDecodingVisual />;
  if (visualId === "concurrency_toctou") return <ConcurrencyToctouVisual />;
  if (visualId === "qlora_adapters") return <QloraMatrixVisual />;
  return null;
}

export function ArchitectureGuide() {
  const [audience, setAudience] = useState<AudienceView>("both");
  const [activeChapterId, setActiveChapterId] = useState<string>(GUIDE_CHAPTERS[0].id);
  const [glossaryQuery, setGlossaryQuery] = useState("");

  const totalWords = useMemo(() => computeArchitectureGuideWordCount(), []);
  const totalMinutes = useMemo(
    () => GUIDE_CHAPTERS.reduce((sum, ch) => sum + ch.readingMinutes, 0),
    []
  );

  const filteredGlossary = useMemo(() => {
    const q = glossaryQuery.trim().toLowerCase();
    if (!q) return GLOSSARY_ENTRIES;
    return GLOSSARY_ENTRIES.filter(
      (g) =>
        g.term.toLowerCase().includes(q) ||
        g.plainMeaning.toLowerCase().includes(q) ||
        g.whereUsed.toLowerCase().includes(q)
    );
  }, [glossaryQuery]);

  function jumpToChapter(id: string) {
    setActiveChapterId(id);
    const el = document.getElementById(`guide-chapter-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Banner & Audience Selector */}
      <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="space-y-1.5 max-w-3xl">
            <div className="text-xs font-mono font-semibold uppercase tracking-wider text-emerald-700">
              End-to-End AI &amp; Backend Engineering Handbook
            </div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900">
              How Safari Dispatch OS Works: From Raw Swahili Inquiry to Confirmed Trip
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              A complete step-by-step crash course teaching every AI/ML technique and backend engineering pattern inside
              this application—written so both <strong className="text-slate-900 font-medium">executives</strong> evaluating
              risk/ROI and <strong className="text-slate-900 font-medium">newbie AI engineers</strong> reading the codebase can
              understand the entire system end to end.
            </p>
          </div>

          {/* Reader Mode Switch */}
          <div className="space-y-1.5 shrink-0">
            <div className="text-xs font-medium text-slate-500">Reading Lens</div>
            <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-1 text-xs">
              {(
                [
                  { id: "both", label: "Complete Guide", icon: BookOpen },
                  { id: "executive", label: "Executive View", icon: Briefcase },
                  { id: "engineer", label: "AI Engineer View", icon: Code2 },
                ] as const
              ).map((opt) => {
                const Icon = opt.icon;
                const active = audience === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setAudience(opt.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded font-medium transition-colors ${
                      active
                        ? "bg-white text-slate-900 shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Summary KPI Strip */}
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div className="rounded-md bg-slate-50 border border-slate-200 p-3.5">
            <dt className="text-slate-500">Handbook Depth</dt>
            <dd className="mt-1 text-base font-bold font-mono tabular-nums text-slate-900">
              {totalWords.toLocaleString("en-US")} words
            </dd>
          </div>
          <div className="rounded-md bg-slate-50 border border-slate-200 p-3.5">
            <dt className="text-slate-500">Chapters &amp; Visuals</dt>
            <dd className="mt-1 text-base font-bold font-mono tabular-nums text-slate-900">
              {GUIDE_CHAPTERS.length} modules · 4 diagrams
            </dd>
          </div>
          <div className="rounded-md bg-slate-50 border border-slate-200 p-3.5">
            <dt className="text-slate-500">Estimated Read Time</dt>
            <dd className="mt-1 text-base font-bold font-mono tabular-nums text-slate-900">
              ~{totalMinutes} minutes
            </dd>
          </div>
          <div className="rounded-md bg-slate-50 border border-slate-200 p-3.5">
            <dt className="text-slate-500">Architecture Pattern</dt>
            <dd className="mt-1 text-sm font-semibold text-emerald-800">
              Neuro-Symbolic Agent + ACID Locks
            </dd>
          </div>
        </dl>
      </section>

      {/* Tech & ML Stack Matrix */}
      <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">
            At-a-Glance Blueprint: Every AI, ML &amp; Backend Layer
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            How neural models, orchestration graphs, SQL pricing rules, and safety guardrails divide responsibility.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="py-2 pr-3 font-medium">System Layer</th>
                <th className="py-2 pr-3 font-medium">Category</th>
                <th className="py-2 pr-3 font-medium">Technology / Technique</th>
                <th className="py-2 pr-3 font-medium">Role in Safari Dispatch OS</th>
                <th className="py-2 font-medium">Why It Was Chosen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {TECH_STACK_MATRIX.map((row) => (
                <tr key={row.layer} className="hover:bg-slate-50 align-top">
                  <td className="py-2.5 pr-3 font-medium text-slate-900 whitespace-nowrap">{row.layer}</td>
                  <td className="py-2.5 pr-3 font-mono text-emerald-800 whitespace-nowrap">{row.category}</td>
                  <td className="py-2.5 pr-3 font-mono text-slate-800">{row.technology}</td>
                  <td className="py-2.5 pr-3 text-slate-700 leading-relaxed">{row.roleInApp}</td>
                  <td className="py-2.5 text-slate-600 leading-relaxed">{row.whyChosen}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Main Layout: Sticky TOC Rail + Long-Form Chapters */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Sticky Chapter Navigator */}
        <aside className="lg:col-span-3 lg:sticky lg:top-20 bg-white border border-slate-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Curriculum Chapters
            </h3>
            <span className="font-mono text-xs text-slate-400 tabular-nums">01–10</span>
          </div>
          <nav className="space-y-1">
            {GUIDE_CHAPTERS.map((ch) => {
              const active = activeChapterId === ch.id;
              return (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => jumpToChapter(ch.id)}
                  className={`w-full text-left px-2.5 py-2 rounded-md text-xs transition-colors flex items-start gap-2 ${
                    active
                      ? "bg-emerald-50 text-emerald-900 font-medium"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <span className="font-mono text-[11px] tabular-nums text-emerald-700 shrink-0 mt-0.5">
                    {ch.number}
                  </span>
                  <span className="leading-snug">{ch.title}</span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => {
                setActiveChapterId("glossary");
                document.getElementById("guide-glossary")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className={`w-full text-left px-2.5 py-2 rounded-md text-xs transition-colors flex items-start gap-2 ${
                activeChapterId === "glossary"
                  ? "bg-emerald-50 text-emerald-900 font-medium"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <span className="font-mono text-[11px] tabular-nums text-emerald-700 shrink-0 mt-0.5">11</span>
              <span className="leading-snug">AI &amp; Backend Glossary</span>
            </button>
          </nav>
        </aside>

        {/* Chapters Stream */}
        <div className="lg:col-span-9 space-y-6">
          {GUIDE_CHAPTERS.map((chapter) => (
            <article
              key={chapter.id}
              id={`guide-chapter-${chapter.id}`}
              className="bg-white border border-slate-200 rounded-lg p-6 space-y-5 scroll-mt-20"
            >
              {/* Chapter Header */}
              <header className="space-y-2 border-b border-slate-100 pb-4">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-emerald-700">CHAPTER {chapter.number}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">{chapter.readingMinutes} min read</span>
                  </div>
                  <div className="font-mono text-[11px] text-slate-500">
                    {chapter.aiConcepts.join(" · ")}
                  </div>
                </div>
                <h3 className="text-lg font-bold text-slate-900 leading-snug">{chapter.title}</h3>
                <p className="text-sm text-slate-600">{chapter.subtitle}</p>
              </header>

              {/* Executive Brief & Business Impact */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                <div className="md:col-span-8 rounded-md bg-slate-50 border border-slate-200 p-4 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                    <Briefcase className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Executive Takeaway</span>
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed">{chapter.executiveSummary}</p>
                </div>
                <div className="md:col-span-4 rounded-md bg-emerald-50/60 border border-emerald-200 p-4 space-y-1.5">
                  <div className="text-xs font-semibold text-emerald-900">Business Impact</div>
                  <p className="text-xs font-mono text-emerald-800 leading-relaxed">
                    {chapter.businessImpactMetric}
                  </p>
                </div>
              </div>

              {/* Plain-English Mental Model */}
              <div className="rounded-md border border-slate-200 bg-white p-4 space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                  <Cpu className="w-3.5 h-3.5 text-slate-600" />
                  <span>Plain-English Intuition (Newbie Mental Model)</span>
                </div>
                <p className="text-xs text-slate-700 leading-relaxed">{chapter.beginnerAnalogy}</p>
              </div>

              {/* Embedded Diagram when applicable */}
              {renderChapterVisual(chapter.visualId)}

              {/* Detailed Technical & Conceptual Sections */}
              {audience !== "executive" && (
                <div className="space-y-5 pt-1">
                  {chapter.sections.map((sec) => (
                    <section key={sec.heading} className="space-y-3">
                      <h4 className="text-sm font-semibold text-slate-900">{sec.heading}</h4>
                      <div className="space-y-2.5">
                        {sec.body.map((paragraph, idx) => (
                          <p key={idx} className="text-sm text-slate-700 leading-relaxed">
                            {paragraph}
                          </p>
                        ))}
                      </div>

                      {sec.formulaBox && (
                        <div className="rounded-md bg-slate-50 border border-slate-200 p-4 space-y-1.5">
                          <div className="text-xs font-semibold text-slate-900">{sec.formulaBox.label}</div>
                          <div className="font-mono text-xs text-emerald-800 bg-white border border-slate-200 rounded px-3 py-2 overflow-x-auto">
                            {sec.formulaBox.expression}
                          </div>
                          <p className="text-xs text-slate-600 leading-relaxed">{sec.formulaBox.explanation}</p>
                        </div>
                      )}

                      {sec.codeExample && (
                        <div className="space-y-1.5">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                            <span className="font-medium text-slate-700">{sec.codeExample.title}</span>
                            <span className="font-mono">{sec.codeExample.fileRef}</span>
                          </div>
                          <pre className="p-3.5 rounded-md bg-slate-900 text-slate-100 text-xs overflow-x-auto leading-relaxed">
                            <code>{sec.codeExample.snippet}</code>
                          </pre>
                        </div>
                      )}
                    </section>
                  ))}
                </div>
              )}

              {/* Key Takeaways Footer */}
              <footer className="border-t border-slate-100 pt-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-900">Key Engineering &amp; Product Takeaways</span>
                  <span className="text-[11px] font-mono text-slate-500">
                    Code touchpoints: {chapter.backendComponents.join(", ")}
                  </span>
                </div>
                <ul className="space-y-1.5 text-xs text-slate-700 list-disc pl-4 leading-relaxed">
                  {chapter.keyTakeaways.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </footer>
            </article>
          ))}

          {/* Interactive Glossary */}
          <section
            id="guide-glossary"
            className="bg-white border border-slate-200 rounded-lg p-6 space-y-4 scroll-mt-20"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  11. Quick Reference Glossary (AI, ML &amp; Backend Terms)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Filter any term to see its plain-English meaning and exact location in Safari Dispatch OS.
                </p>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={glossaryQuery}
                  onChange={(e) => setGlossaryQuery(e.target.value)}
                  placeholder="Filter terms (e.g. TOCTOU, LoRA)"
                  className="w-full rounded-md border border-slate-200 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-200">
                    <th className="py-2 pr-3 font-medium">Concept / Term</th>
                    <th className="py-2 pr-3 font-medium">Plain-English Meaning</th>
                    <th className="py-2 font-medium">Where Applied in Codebase</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredGlossary.map((g) => (
                    <tr key={g.term} className="hover:bg-slate-50 align-top">
                      <td className="py-2.5 pr-3 font-semibold text-slate-900 whitespace-nowrap">{g.term}</td>
                      <td className="py-2.5 pr-3 text-slate-700 leading-relaxed">{g.plainMeaning}</td>
                      <td className="py-2.5 font-mono text-slate-600">{g.whereUsed}</td>
                    </tr>
                  ))}
                  {filteredGlossary.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-6 text-center text-slate-500">
                        No glossary entries match &ldquo;{glossaryQuery}&rdquo;.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
