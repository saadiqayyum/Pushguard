import Link from "next/link";
import { redirect } from "next/navigation";
import { NewScanDialog } from "@/components/new-scan-dialog";
import { memberScopes } from "@/lib/auth";
import { installationForDisplay } from "@/lib/db";
import { resolveTenant } from "@/lib/tenant";
import { TableShell } from "@/components/table-shell";
import { TableToolbar } from "@/components/table-toolbar";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatTimestamp } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Pager } from "@/components/pager";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { installUrl } from "@/lib/install-url";
import { parsePaging } from "@/lib/paging";
import { SCAN_LIMITS } from "@/lib/scan";

export const dynamic = "force-dynamic";

// One branch when the scan asked for one, or when every repository landed on
// the same one. Nothing when they differ, because a single label would be a lie.
function scanBranch(scan: {
  branch?: string;
  scanned?: { branch: string }[];
}): string | null {
  if (scan.branch) return scan.branch;
  const names = new Set((scan.scanned ?? []).map((read) => read.branch));
  return names.size === 1 ? [...names][0] : null;
}

export default async function ScansPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const paging = parsePaging(await searchParams);
  const session = await auth();
  if (!session?.user) redirect("/signin");

  const login = session.login || session.user.name || "";

  // The keys this account has saved, so a scan can name which one pays.
  const tenant = await resolveTenant(memberScopes(session));
  const settings = tenant.current
    ? await installationForDisplay(tenant.current.org)
    : null;
  const aiKeys = (settings?.aiKeys ?? []).map((entry) => ({
    id: entry.id,
    label: entry.label,
    model: entry.model,
  }));

  const [rows, total] = await Promise.all([
    db.scans()
      .find({ owner: login })
      .sort({ createdAt: -1 })
      .skip(paging.skip)
      .limit(paging.perPage)
      .toArray(),
    db.scans().countDocuments({ owner: login }),
  ]);
  const running = rows.find(
    (scan) => scan.status === "queued" || scan.status === "running",
  );

  return (
    <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8 space-y-6">
      <PageHeader
        title="Scans"
        description="Read a repository on demand instead of waiting for the next push."
      />

      {running && (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{running.target}</span>{" "}
          is still {running.status}. One scan runs at a time; this page updates
          when it finishes.
        </p>
      )}

      <TableToolbar
        count={total}
        noun="scan"
        primary={
          !running && (
            <NewScanDialog
              installUrl={installUrl()}
              aiKeys={aiKeys}
              note={`${SCAN_LIMITS.perDay} scans a day, up to ${SCAN_LIMITS.repos} repositories each. The list comes from GitHub: it holds exactly the repositories you can read.`}
            />
          )
        }
      />

      <TableShell>
        <TableHeader>
          <TableRow>
            <TableHead>Target</TableHead>
            <TableHead className="hidden lg:table-cell">Branch</TableHead>
            <TableHead className="hidden md:table-cell">Read</TableHead>
            <TableHead className="hidden md:table-cell">Started</TableHead>
            <TableHead className="text-right">Findings</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={5}
                className="text-center text-sm text-muted-foreground"
              >
                No scans yet. Pick an account to read every repository you can
                access in it.
              </TableCell>
            </TableRow>
          )}
          {rows.map((scan) => (
            <TableRow key={scan._id}>
              <TableCell>
                <Link
                  href={`/dashboard/scans/${scan._id}`}
                  className="font-medium"
                >
                  {scan.target}
                </Link>
                <span className="mt-1 block text-xs text-muted-foreground md:hidden">
                  {scan.repos.length}{" "}
                  {scan.repos.length === 1 ? "repository" : "repositories"} ·{" "}
                  {formatTimestamp(scan.createdAt)}
                </span>
              </TableCell>
              <TableCell className="hidden font-mono text-xs whitespace-nowrap text-muted-foreground lg:table-cell">
                {scanBranch(scan) ?? "—"}
              </TableCell>
              <TableCell className="hidden text-xs whitespace-nowrap text-muted-foreground md:table-cell">
                {scan.repos.length}{" "}
                {scan.repos.length === 1 ? "repository" : "repositories"}
                {scan.filed.length > 0 && ` · ${scan.filed.length} reported`}
              </TableCell>
              <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                {formatTimestamp(scan.createdAt)}
              </TableCell>
              <TableCell className="text-right text-sm">
                {scan.status === "done" ? (
                  scan.findings.length === 0 ? (
                    <span className="text-muted-foreground">clean</span>
                  ) : (
                    scan.findings.length
                  )
                ) : (
                  <span className="text-muted-foreground">{scan.status}</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </TableShell>

      <Pager
        page={paging.page}
        perPage={paging.perPage}
        total={total}
        hasMore={paging.skip + rows.length < total}
        basePath="/dashboard/scans"
      />
    </div>
  );
}
