import { useDeferredValue, useEffect, useState } from "react";
import { Input, Modal, toast } from "@heroui/react";
import { Download, Search, Star, TrendingUp } from "lucide-react";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import {
  isGitHubRepositorySource,
  type MarketplaceSkill,
  type SkillAvailability,
  type SkillMarketplaceId,
  type SkillMarketplaceResult,
  type SkillScanResult,
} from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import { Button, PixelLoader, Select, ToggleSwitch } from "@/renderer/components/common";
import { skillTargetRequest, type SkillTarget } from "./skillTargets";

type MarketplaceSort = "rank" | "trending" | "name" | "installs";

function recentInstalls(skill: MarketplaceSkill): number {
  return skill.weeklyInstalls?.at(-1) ?? 0;
}

function marketplaceMetricTotal(
  marketplace: SkillMarketplaceId,
  skills: MarketplaceSkill[],
): number {
  if (marketplace === "skills-directory") {
    const starsBySource = new Map<string, number>();
    for (const skill of skills) {
      if (skill.stars === undefined) continue;
      const source = skill.source.toLowerCase();
      starsBySource.set(source, Math.max(starsBySource.get(source) ?? 0, skill.stars));
    }
    return [...starsBySource.values()].reduce((total, stars) => total + stars, 0);
  }
  return skills.reduce((total, skill) => total + (skill.installs ?? 0), 0);
}

export function SkillMarketplaceModal(props: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  target: SkillTarget;
  targetLabel: string;
  scan: SkillScanResult;
  onInstalled: () => Promise<void>;
}) {
  const { i18n, t } = useLingui();
  const [marketplace, setMarketplace] = useState<SkillMarketplaceId>("skills-sh");
  const [catalog, setCatalog] = useState<SkillMarketplaceResult>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("all");
  const [sort, setSort] = useState<MarketplaceSort>("rank");
  const [availability, setAvailability] = useState<SkillAvailability>("shared");
  const [officialOnly, setOfficialOnly] = useState(false);
  const [installing, setInstalling] = useState<string>();
  const deferredQuery = useDeferredValue(query.trim());
  const remoteQuery = marketplace === "skills-directory" ? deferredQuery || undefined : undefined;

  useEffect(() => {
    if (!props.isOpen) return;
    let active = true;
    setLoading(true);
    setError(false);
    void readBridge()
      .listSkillMarketplace({
        marketplace,
        sort: "rank",
        ...(remoteQuery ? { query: remoteQuery } : {}),
      })
      .then((result) => {
        if (active) setCatalog(result);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [marketplace, props.isOpen, remoteQuery]);

  useEffect(() => {
    if (props.isOpen) return;
    setQuery("");
    setSource("all");
    setSort("rank");
    setAvailability("shared");
    setOfficialOnly(false);
  }, [props.isOpen]);

  const currentCatalog = catalog?.marketplace === marketplace ? catalog : undefined;
  const skills = currentCatalog?.skills ?? [];
  const installableSkills = skills.filter((skill) => isGitHubRepositorySource(skill.source));
  const sources = [...new Set(installableSkills.map((skill) => skill.source))].toSorted();
  const normalizedQuery = (
    marketplace === "skills-directory" ? deferredQuery : query.trim()
  ).toLowerCase();
  const visibleSkills = installableSkills
    .filter(
      (skill) =>
        (source === "all" || skill.source === source) &&
        (!officialOnly || skill.official) &&
        `${skill.name} ${skill.description ?? ""} ${skill.source}`
          .toLowerCase()
          .includes(normalizedQuery),
    )
    .toSorted((left, right) => {
      if (sort === "name") return left.name.localeCompare(right.name);
      if (sort === "trending") return recentInstalls(right) - recentInstalls(left);
      if (sort === "installs") {
        return (right.installs ?? right.stars ?? 0) - (left.installs ?? left.stars ?? 0);
      }
      return left.rank - right.rank;
    });
  const displayedSkills = visibleSkills.slice(0, 200);
  const managedFolders = new Set(
    props.scan.skills
      .filter((skill) => skill.origin === "managed" && skill.scope === props.target.scope)
      .filter((skill) => (skill.availability ?? "shared") === availability)
      .map((skill) => skill.folderName.toLowerCase()),
  );
  const formatNumber = (value: number) => new Intl.NumberFormat(i18n.locale).format(value);
  const metricTotal = marketplaceMetricTotal(marketplace, installableSkills);

  const install = async (skill: MarketplaceSkill) => {
    setInstalling(skill.id);
    try {
      await readBridge().installMarketplaceSkill({
        marketplace: skill.marketplace,
        marketplaceSkillId: skill.id,
        destinationScope: props.target.scope,
        availability,
        replace: false,
        ...skillTargetRequest(props.target),
      });
      toast.success(t`Installed ${skill.name}.`);
      await props.onInstalled();
    } catch {
      toast.danger(t`Couldn't install ${skill.name}.`);
    } finally {
      setInstalling(undefined);
    }
  };

  const marketplaceOptions = [
    { id: "skills-sh", label: t`Skills.sh` },
    { id: "skills-directory", label: t`Skills Directory` },
  ];
  const availabilityOptions = [
    { id: "shared", label: t`All agent apps` },
    { id: "poracode", label: t`Poracode only` },
  ];
  const sourceOptions = [
    { id: "all", label: t`All sources` },
    ...sources.map((id) => ({ id, label: id })),
  ];
  const sortOptions = [
    { id: "rank", label: t`Marketplace rank` },
    { id: "installs", label: t`Most popular` },
    { id: "trending", label: t`Trending now` },
    { id: "name", label: t`Name` },
  ];

  return (
    <Modal.Backdrop isOpen={props.isOpen} onOpenChange={props.onOpenChange}>
      <Modal.Container placement="center" scroll="inside" size="lg">
        <Modal.Dialog className="sm:max-w-[880px]">
          <Modal.CloseTrigger />
          <Modal.Header>
            <div>
              <Modal.Heading>
                <Trans>Skills marketplace</Trans>
              </Modal.Heading>
              <p className="mt-0.5 text-xs text-muted">
                <Trans>Install managed skills into {props.targetLabel}.</Trans>
              </p>
            </div>
          </Modal.Header>
          <Modal.Body className="flex h-[min(42rem,75vh)] min-h-96 flex-col gap-3 p-4">
            <div className="flex items-center gap-3">
              <Select
                aria-label={t`Skill marketplace source`}
                className="w-56"
                options={marketplaceOptions}
                value={marketplace}
                onChange={(value) => {
                  setMarketplace(value === "skills-directory" ? value : "skills-sh");
                  setSource("all");
                }}
              />
              <Select
                aria-label={t`Skill availability`}
                className="w-44"
                options={availabilityOptions}
                value={availability}
                onChange={(value) => setAvailability(value === "poracode" ? "poracode" : "shared")}
              />
              <p className="text-xs text-muted">
                {marketplace === "skills-sh" ? (
                  <Trans>Open leaderboard with install and trend metrics.</Trans>
                ) : marketplace === "skills-directory" ? (
                  <Trans>Public registry with verified sources and GitHub metrics.</Trans>
                ) : null}
              </p>
            </div>

            {error && !currentCatalog ? (
              <div className="flex min-h-48 flex-1 items-center justify-center text-sm text-muted">
                <Trans>The skills marketplace couldn't be loaded.</Trans>
              </div>
            ) : !currentCatalog ? (
              <div className="flex min-h-48 flex-1 items-center justify-center gap-2 text-sm text-muted">
                <PixelLoader size="xs" />
                <Trans>Loading marketplace…</Trans>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2 rounded-xl border border-[var(--hairline)] bg-surface-secondary p-3 text-center">
                  <Metric value={formatNumber(currentCatalog.total)} label={t`Skills`} />
                  <Metric value={formatNumber(sources.length)} label={t`Sources`} />
                  <Metric
                    value={formatNumber(metricTotal)}
                    label={marketplace === "skills-sh" ? t`Total installs` : t`GitHub stars`}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted" />
                    <Input
                      aria-label={t`Search marketplace skills`}
                      className="w-full pl-9"
                      placeholder={t`Search skills or sources...`}
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                  </div>
                  <Select
                    aria-label={t`Filter marketplace by source`}
                    className="w-52"
                    options={sourceOptions}
                    value={source}
                    onChange={setSource}
                  />
                  <Select
                    aria-label={t`Sort marketplace skills`}
                    className="w-44"
                    options={sortOptions}
                    value={sort}
                    onChange={(value) =>
                      setSort(
                        value === "name" || value === "trending" || value === "installs"
                          ? value
                          : "rank",
                      )
                    }
                  />
                </div>
                <div className="flex items-center justify-between px-1">
                  <ToggleSwitch isSelected={officialOnly} onChange={setOfficialOnly}>
                    <Trans>Official sources only</Trans>
                  </ToggleSwitch>
                  <span className="text-xs text-muted">
                    {loading ? <PixelLoader className="mr-2 inline-flex" size="xs" /> : null}
                    <Trans>
                      Showing{" "}
                      <Plural value={displayedSkills.length} one="# skill" other="# skills" />
                    </Trans>
                  </span>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-[var(--hairline)]">
                  {displayedSkills.length === 0 ? (
                    <div className="flex h-full min-h-48 items-center justify-center px-6 text-center text-sm text-muted">
                      <Trans>No marketplace skills match these filters.</Trans>
                    </div>
                  ) : (
                    displayedSkills.map((skill) => {
                      const installed = managedFolders.has(skill.skillId.toLowerCase());
                      return (
                        <div
                          key={`${skill.marketplace}:${skill.id}`}
                          className="flex min-h-16 items-center gap-3 border-b border-[var(--hairline)] px-3 py-2 last:border-b-0"
                        >
                          <div className="w-9 shrink-0 text-center text-xs font-medium text-muted">
                            #{skill.rank}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm font-medium text-foreground">
                                {skill.name}
                              </span>
                              {skill.official ? (
                                <span className="flex shrink-0 items-center gap-1 rounded bg-accent-soft px-1.5 py-0.5 text-[10px] text-accent-soft-foreground">
                                  <Star className="size-3" />
                                  <Trans>Official</Trans>
                                </span>
                              ) : null}
                              {skill.securityGrade ? (
                                <span className="shrink-0 rounded bg-success-soft px-1.5 py-0.5 text-[10px] text-success-soft-foreground">
                                  <Trans>Grade {skill.securityGrade}</Trans>
                                </span>
                              ) : null}
                            </div>
                            <p className="truncate font-mono text-xs text-muted">{skill.source}</p>
                            {skill.description ? (
                              <p className="truncate text-xs text-muted">{skill.description}</p>
                            ) : null}
                          </div>
                          <div className="flex shrink-0 items-center gap-4 text-xs text-muted">
                            <span
                              className="flex items-center gap-1"
                              title={
                                skill.installs !== undefined ? t`Total installs` : t`GitHub stars`
                              }
                            >
                              {skill.installs !== undefined ? (
                                <Download className="size-3.5" />
                              ) : (
                                <Star className="size-3.5" />
                              )}
                              {formatNumber(skill.installs ?? skill.stars ?? 0)}
                            </span>
                            {skill.weeklyInstalls ? (
                              <span
                                className="flex min-w-16 items-center gap-1"
                                title={t`Recent installs`}
                              >
                                <TrendingUp className="size-3.5" />
                                {formatNumber(recentInstalls(skill))}
                              </span>
                            ) : null}
                          </div>
                          <Button
                            size="sm"
                            variant={installed ? "tertiary" : "secondary"}
                            isDisabled={installed || installing !== undefined}
                            isPending={installing === skill.id}
                            onPress={() => void install(skill)}
                          >
                            {installed ? <Trans>Installed</Trans> : <Trans>Install</Trans>}
                          </Button>
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

function Metric(props: { value: string; label: string }) {
  return (
    <div>
      <div className="text-lg font-semibold text-foreground">{props.value}</div>
      <div className="text-xs text-muted">{props.label}</div>
    </div>
  );
}
