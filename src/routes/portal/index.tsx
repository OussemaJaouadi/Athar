import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Blocks, BookOpen, CircleAlert, Download, Gauge, Globe, History, KeyRound, Sparkles, TriangleAlert, Waypoints } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  RunStepButton,
  duration,
  plural,
} from "@/components/athar/collect-button";
import {
  Desk,
  DeskBar,
  DeskItem,
  DeskPane,
  PaneSection,
  deskBtn,
  deskTd,
  deskTh,
  useDeskKeys,
} from "@/components/athar/desk";
import { labTime, operationName } from "@/components/athar/lab";
import { RunStatus, StepStateBadge } from "@/components/athar/run-status";
import { DownloadChanges, DownloadList } from "@/components/athar/pipeline-downloads";
import { FactList, hasRows } from "@/components/athar/pipeline-facts";
import { StepAbout } from "@/components/athar/pipeline-steps";
import { cn } from "@/lib/utils";
import {
  getDownloadChanges,
  getFactRows,
  getPipelineState,
  listDownloads,
} from "#/server/api/ops";
import { getPipeline, getRunDetail, type RunChange } from "#/server/api/portal";
import type { StepState } from "#/server/pipeline/state";

// fact: a counted fact opened as the rows behind it; download: a download opened as what it changed (Collect).
type Search = { step?: string; run?: string; fact?: string; download?: number };

// Which operations ran each step: Build runs inside every Collect, and alone as Rebuild.
const RUNS_OF: Record<string, string[]> = {
  collect: ["collect"],
  rebuild: ["collect", "rebuild"],
  check: ["check"],
  prepare: ["prepare"],
  embed: ["embed"],
};
// The step name a run records for each of the five steps.
const STEP_OF: Record<string, string> = {
  collect: "collect",
  rebuild: "build",
  check: "check",
  prepare: "prepare",
  embed: "embed",
};
// The step a run belongs to, when a link opens the page on a run.
const KEY_OF_RUN: Record<string, string> = {
  collect: "collect",
  rebuild: "rebuild",
  check: "check",
  prepare: "prepare",
  embed: "embed",
};

export const Route = createFileRoute("/portal/")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    step: typeof s.step === "string" && s.step ? s.step : undefined,
    run: typeof s.run === "string" && s.run ? s.run : undefined,
    fact: typeof s.fact === "string" && s.fact ? s.fact : undefined,
    download:
      typeof s.download === "number" && s.download > 0
        ? Math.floor(s.download)
        : undefined,
  }),
  loaderDeps: ({ search }) => ({
    step: search.step,
    run: search.run,
    fact: search.fact,
    download: search.download,
  }),
  // The selected step: the one in the URL, else the step of a linked run, else the running one, else the first with
  // something to do, else Collect. Its pane shows the facts of the selected run, or of its last run.
  loader: async ({ deps }) => {
    const [state, data] = await Promise.all([
      getPipelineState(),
      getPipeline(),
    ]);
    const keys = state.steps.map((s) => s.operation);
    const linked = deps.run
      ? data.runs.find((r) => r.id === deps.run)
      : undefined;
    const key =
      (deps.step && keys.includes(deps.step) && deps.step) ||
      (linked && KEY_OF_RUN[linked.operation]) ||
      state.steps.find((s) => s.state === "running")?.operation ||
      state.steps.find((s) => s.next)?.operation ||
      keys[0];
    const step = state.steps.find((s) => s.operation === key)!;
    const runs = data.runs.filter((r) => RUNS_OF[key]?.includes(r.operation));
    const runId =
      linked && runs.some((r) => r.id === linked.id) ? linked.id : runs[0]?.id;
    const [detail, factResult, downloads, changes] = await Promise.all([
      runId ? getRunDetail({ data: runId }) : null,
      deps.fact && hasRows(deps.fact) ? getFactRows({ data: deps.fact }) : null,
      key === "collect" ? listDownloads() : [],
      key === "collect" && deps.download
        ? getDownloadChanges({ data: deps.download })
        : null,
    ]);
    return {
      state,
      data,
      key,
      step,
      runs,
      detail,
      factResult,
      downloads,
      changes,
    };
  },
  component: Pipeline,
});

const dateOnly = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
// The button name for a step's operation: Build is brought up to date by Rebuild.
const runLabel = (s: StepState) =>
  s.operation === "rebuild" ? "Rebuild" : s.label;

// One icon per step, the same in the list and in the pane, so a step is recognised before it is read.
const STEP_ICON: Record<string, typeof Download> = {
  collect: Download,
  rebuild: Blocks,
  check: Globe,
  prepare: Sparkles,
  embed: Waypoints,
};
// A step that needs the operator: its Run button becomes the pane's primary action.
const NEEDS_RUN = new Set(["stale", "never_run", "failed"]);

function Pipeline() {
  const {
    state,
    data,
    key,
    step,
    runs,
    detail,
    factResult,
    downloads,
    changes,
  } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/portal/" });
  const keys = state.steps.map((s) => s.operation);
  const running = state.steps.find((s) => s.state === "running");
  const nextStep = state.steps.find(
    (s) => s.next && s.state !== "not_configured",
  );

  const select = useCallback(
    (k: string) => navigate({ search: { step: k }, replace: true }),
    [navigate],
  );
  useDeskKeys({ ids: keys, current: key, select });

  // A step that starts running while the page is open is selected, so its counts can be followed.
  const seen = useRef(running?.operation);
  useEffect(() => {
    if (running && running.operation !== seen.current) {
      seen.current = running.operation;
      select(running.operation);
    }
    if (!running) seen.current = undefined;
  }, [running, select]);

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <DeskBar
        title="Status"
        facts={
          nextStep
            ? nextStep.next
            : data.download
              ? `Everything is up to date as of ${dateOnly(data.download.last_checked_at)}.`
              : "Nothing collected yet."
        }
        actions={
          nextStep ? (
            <RunStepButton
              primary
              operation={nextStep.operation}
              label={runLabel(nextStep)}
              disabled={!!running}
            />
          ) : (
            <RunStepButton operation="collect" label="Collect" disabled={!!running}>
              Check the registry now
            </RunStepButton>
          )
        }
      />
      <Desk
        storageKey="pipeline"
        showPaneOnNarrow={!!search.step}
        onBack={() => navigate({ search: {}, replace: true })}
        backLabel="All steps"
        list={
          <div role="list" aria-label="Steps">
            {state.steps.map((s, i) => {
              const Icon = STEP_ICON[s.operation] ?? Download;
              return (
                <div role="listitem" key={s.operation}>
                  <DeskItem
                    wrap
                    selected={s.operation === key}
                    onSelect={() => select(s.operation)}
                    title={<span className="font-medium">{s.label}</span>}
                    detail={
                      s.state === "not_configured"
                        ? "Optional. Rewrites descriptions for matching."
                        : (s.reasons[0] ?? s.counts).split(". ")[0].replace(/\.$/, "")
                    }
                    lead={
                      // The pipeline, drawn: a node per step and the line that joins them.
                      <span className="flex w-8 shrink-0 flex-col items-center self-stretch" aria-hidden>
                        <span className={cn("w-px flex-1", i > 0 ? "bg-edge" : "bg-transparent")} />
                        <span className="grid size-8 place-items-center rounded-full border border-edge bg-canvas text-ink">
                          <Icon className="size-4" strokeWidth={1.5} />
                        </span>
                        <span className={cn("w-px flex-1", i < state.steps.length - 1 ? "bg-edge" : "bg-transparent")} />
                      </span>
                    }
                    end={<StepStateBadge state={s.state} />}
                  />
                </div>
              );
            })}
          </div>
        }
        pane={
          <StepPane
            step={step}
            runs={runs}
            detail={detail}
            selectedRun={search.run}
            position={`Step ${keys.indexOf(key) + 1} of ${keys.length}`}
            busy={!!running}
            fact={search.fact}
            factResult={factResult}
            downloads={downloads}
            download={search.download}
            changes={changes}
          />
        }
      />
    </main>
  );
}

type Detail = NonNullable<Awaited<ReturnType<typeof getRunDetail>>>;
type RunItem = Awaited<ReturnType<typeof getPipeline>>["runs"][number];

// Short labels for the counted facts; the step's own sentence is the fallback (and the hover title).
const FACT: Record<string, string> = {
  entries_new: "rows not seen in any earlier download",
  exact_copies: "exact duplicate rows",
  no_description: "no description",
  listed_more_than_once: "listed more than once",
  other_sector: "listed under two sectors",
  other_name: "listed under two names",
  second_website: "two websites, first kept",
  website_text_removed: "extra text removed from a website",
  website_unreadable: "unreadable websites",
  label_unreadable: "unreadable label dates",
  label_before_creation: "labelled before founded",
  reachable: "answered",
  unreachable: "did not answer, asked twice",
  moved: "answered from another domain",
  turned: "changed status since the last check",
  social_not_checked: "social pages, not checked",
  no_website: "no website in the registry",
  embedded: "embedded by this run",
  up_to_date: "already up to date",
  from_prepared: "embedded from a prepared text",
  removed: "removed: no description any more",
  prepared: "prepared by this run",
};

function StepPane({
  step,
  runs,
  detail,
  selectedRun,
  position,
  busy,
  fact,
  factResult,
  downloads,
  download,
  changes,
}: {
  step: StepState;
  runs: RunItem[];
  detail: Detail | null;
  selectedRun?: string;
  position: string;
  busy: boolean;
  fact?: string;
  factResult: Awaited<ReturnType<typeof getFactRows>>;
  downloads: Awaited<ReturnType<typeof listDownloads>>;
  download?: number;
  changes: Awaited<ReturnType<typeof getDownloadChanges>>;
}) {
  const navigate = useNavigate({ from: "/portal/" });
  // Opening a count or a download keeps the step and run in the URL, so Back returns to the same pane.
  const open = (extra: { fact?: string; download?: number }) =>
    navigate({
      search: { step: step.operation, run: selectedRun, ...extra },
      replace: false,
    });
  const close = () =>
    navigate({
      search: { step: step.operation, run: selectedRun },
      replace: false,
    });
  const stepName = STEP_OF[step.operation];
  const facts = (detail?.steps ?? [])
    .filter((s) => s.step === stepName)
    .flatMap((s) => s.notes.filter((n) => n.count > 0));
  const failure =
    detail &&
    (detail.run.status === "failed" || detail.run.status === "interrupted")
      ? (detail.run.error ?? "No message was recorded.")
      : null;
  const notConfigured = step.state === "not_configured";
  const StepIcon = STEP_ICON[step.operation] ?? Download;
  const [view, setView] = useState<"overview" | "runs" | "how">("overview");
  const factNote = fact ? facts.find((n) => n.code === fact) : undefined;
  const firstDownload = downloads.length
    ? Math.min(...downloads.map((d) => d.id))
    : null;

  return (
    <DeskPane
      title={
        <span className="inline-flex items-center gap-2.5">
          <StepIcon className="size-5 shrink-0" strokeWidth={1.5} aria-hidden />
          {step.label}
        </span>
      }
      statement={<StepStateBadge state={step.state} />}
      position={position}
      headerEnd={
        notConfigured ? (
          <Link to="/portal/keys" className={deskBtn}>
            <KeyRound aria-hidden />
            Add an AI key
          </Link>
        ) : (
          <RunStepButton
            primary={NEEDS_RUN.has(step.state)}
            operation={step.operation}
            label={runLabel(step)}
            disabled={busy}
          />
        )
      }
    >
      {fact ? (
        <FactList
          label={
            factNote
              ? (FACT[factNote.code] ?? factNote.text)
              : (FACT[fact] ??
                fact.replace(/^unreachable:/, "did not answer: "))
          }
          counted={factNote?.count ?? 0}
          countedOn={factNote && detail ? detail.run.started_at : null}
          result={factResult}
          onBack={close}
        />
      ) : download !== undefined && step.operation === "collect" ? (
        <DownloadChanges
          download={downloads.find((d) => d.id === download)}
          changes={changes}
          baseline={download === firstDownload}
          onBack={close}
        />
      ) : (
        <>
          <div role="tablist" aria-label="What to show about this step" className="-mt-1 flex gap-1 border-b border-hairline">
            {(
              [
                ["overview", "Overview", Gauge],
                ["runs", runs.length ? `Runs · ${runs.length}` : "Runs", History],
                ["how", "How it works", BookOpen],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={view === id}
                onClick={() => setView(id)}
                className={cn(
                  "-mb-px inline-flex h-9 items-center gap-2 border-b-2 px-3 text-[0.875rem] whitespace-nowrap transition-colors duration-150 motion-reduce:transition-none",
                  view === id ? "border-ink font-medium text-ink" : "border-transparent text-ink-2 hover:text-ink",
                )}
              >
                <Icon className="size-4" strokeWidth={1.5} aria-hidden />
                {label}
              </button>
            ))}
          </div>
          {view === "how" ? (
            <StepAbout operation={step.operation} />
          ) : view === "runs" ? (
          <PaneSection title="Every run of this step" icon={History}>
            {runs.length ? (
              <table className="w-full border-collapse tabular-nums">
                <thead>
                  <tr>
                    {["Started", "Operation", "Took", "Status"].map((h) => (
                      <th key={h} scope="col" className={deskTh}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => {
                    const on = r.id === (selectedRun ?? detail?.run.id);
                    return (
                      <tr
                        key={r.id}
                        className={cn(
                          "cursor-pointer hover:bg-surface",
                          on && "bg-surface",
                        )}
                        onClick={() => {
                          setView("overview");
                          navigate({
                            search: { step: step.operation, run: r.id },
                            replace: true,
                          });
                        }}
                      >
                        <td
                          className={cn(
                            deskTd,
                            on && "shadow-[inset_3px_0_0_var(--ink)]",
                          )}
                        >
                          <button
                            type="button"
                            className="text-start"
                            aria-current={on ? "true" : undefined}
                            onClick={() =>
                              navigate({
                                search: { step: step.operation, run: r.id },
                                replace: true,
                              })
                            }
                          >
                            {labTime(r.started_at)}
                          </button>
                        </td>
                        <td className={deskTd}>{operationName(r.operation)}</td>
                        <td className={deskTd}>
                          {duration(r.started_at, r.finished_at) ?? "running"}
                        </td>
                        <td className={deskTd}>
                          <RunStatus status={r.status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p className="text-[0.875rem] text-ink">
                This step has never run.
              </p>
            )}
          </PaneSection>
          ) : (
            <>
          <PaneSection title="Where it stands" icon={Gauge}>
            <p className="max-w-[75ch] text-[0.9375rem] text-ink">{step.counts}</p>
            {step.total > 0 && (
              <div
                className="mt-2.5 flex h-2 w-full max-w-[520px] overflow-hidden rounded-full bg-surface-raised"
                role="img"
                aria-label={`${step.current} of ${step.total} done and up to date`}
              >
                <span className="bg-ok" style={{ width: `${(step.current / step.total) * 100}%` }} />
                <span className="bg-warn" style={{ width: `${(step.outOfDate / step.total) * 100}%` }} />
              </div>
            )}
            <p className="mt-1.5 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[0.875rem] text-ink tabular-nums">
              <span>
                <span className="font-medium">{step.current.toLocaleString("en-GB")}</span>
                <span className="text-ink-2">
                  {" "}
                  of {step.total.toLocaleString("en-GB")} done and up to date
                </span>
              </span>
              {step.outOfDate > 0 && (
                <span>
                  {plural(step.outOfDate, "out of date", "out of date")}
                </span>
              )}
              {step.missing > 0 && (
                <span>{plural(step.missing, "never done", "never done")}</span>
              )}
            </p>
          </PaneSection>

          {(step.reasons.length > 0 || step.next) && (
            <PaneSection
              title={step.reasons.length ? "Why it is not current" : "Next"}
              icon={TriangleAlert}
              className="rounded-[6px] bg-warn-bg px-3.5 py-3"
            >
              <ul className="grid gap-1 text-[0.875rem] text-ink">
                {step.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
              {step.next && !notConfigured && (
                <p className="mt-2 text-[0.875rem] text-ink">{step.next}</p>
              )}
            </PaneSection>
          )}

          {detail && (
            <PaneSection
              icon={History}
              title={`What ${detail.run.id === runs[0]?.id ? "the last run" : "this run"} found · ${labTime(detail.run.started_at)}`}
            >
              {failure && (
                <p
                  role="alert"
                  className="mb-2 flex items-start gap-2 border-s-[3px] border-destructive ps-2.5 text-[0.875rem] text-ink"
                >
                  <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>{failure.replace(/[.\s]+$/, "")}.</span>
                </p>
              )}
              {detail.run.operation === "collect" &&
                detail.run.status === "done" &&
                step.operation === "collect" && (
                  <p className="mb-2 text-[0.875rem] text-ink">
                    {changeSentence(detail.run.change)}
                  </p>
                )}
              {detail.steps.length > 0 && (
                <p className="mb-2 text-[0.875rem] text-ink tabular-nums">
                  <span className="text-[0.8125rem] text-ink-2">Steps of this run: </span>
                  {detail.steps.map((st, i) => (
                    <span key={st.position}>
                      {i > 0 && <span className="text-ink-2"> → </span>}
                      {operationName(st.step)}
                      <span className="text-ink-2">
                        {" "}
                        {st.status === "done"
                          ? (duration(st.started_at, st.finished_at) ?? "")
                          : st.status === "running"
                            ? "running"
                            : st.status}
                      </span>
                    </span>
                  ))}
                </p>
              )}
              {facts.length ? (
                <ul className="grid max-w-[880px] gap-x-10 md:grid-cols-2">
                  {facts.map((n) => (
                    <li
                      key={n.code}
                      title={n.text}
                      className="border-b border-hairline text-[0.875rem]"
                    >
                      {hasRows(n.code) ? (
                        <button
                          type="button"
                          onClick={() => open({ fact: n.code })}
                          className="grid w-full grid-cols-[3.5rem_minmax(0,1fr)] items-baseline gap-3 py-[7px] text-start hover:bg-surface"
                        >
                          <span className="text-end font-medium text-glaze tabular-nums underline">
                            {n.count.toLocaleString("en-GB")}
                          </span>
                          <span className="text-ink">
                            {FACT[n.code] ?? n.text}
                          </span>
                        </button>
                      ) : (
                        <span className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-baseline gap-3 py-[7px]">
                          <span className="text-end font-medium text-ink tabular-nums">
                            {n.count.toLocaleString("en-GB")}
                          </span>
                          <span className="text-ink">
                            {FACT[n.code] ?? n.text}
                          </span>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                !failure && (
                  <p className="text-[0.875rem] text-ink">
                    Nothing counted for this step in that run.
                  </p>
                )
              )}
            </PaneSection>
          )}

          {step.operation === "collect" && (
            <PaneSection
              icon={Download}
              title={
                downloads.length
                  ? `Downloads · ${downloads.length}`
                  : "Downloads"
              }
            >
              <DownloadList downloads={downloads} onOpen={(id) => open({ download: id })} />
            </PaneSection>
          )}
            </>
          )}
        </>
      )}
    </DeskPane>
  );
}

/** What a Collect did to the registry, as one short sentence. */
function changeSentence(change: RunChange) {
  switch (change.kind) {
    case "stored": {
      const s = change.startups;
      if (change.download === 1 || (s && s.changed === 0 && s.unchanged === 0))
        return "First download: everything is new.";
      const parts = [
        `${plural(change.entriesNew, "new entry", "new entries")}`,
        ...(change.entriesWithdrawn
          ? [`${change.entriesWithdrawn} no longer published`]
          : []),
        ...(s
          ? [
              `startups ${s.created} new, ${s.changed} changed, ${s.unchanged} unchanged`,
            ]
          : []),
      ];
      return `${parts.join(" · ")}.`;
    }
    case "confirmed":
      return `Same rows as the download of ${change.sameAs ? dateOnly(change.sameAs) : "the run before"}; nothing new to store.`;
    case "legacy":
      return "Made by the pipeline before v2; what it stored was replaced.";
    default:
      return "Nothing to compare.";
  }
}
