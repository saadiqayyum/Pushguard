import Link from "next/link";
import { NewScanDialog } from "@/components/new-scan-dialog";
import { aiKeyOptions, scansPage, withUser } from "@/lib/db";
import { pageTenant } from "@/lib/tenant";
import { TableShell } from "@/components/table-shell";
import { TableColumns, SCAN_COLUMNS } from "@/components/table-columns";
import { TableToolbar } from "@/components/table-toolbar";
import { TableBody, TableCell, TableRow } from "@/components/ui/table";
import { formatTimestamp } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Pager } from "@/components/pager";
import { installUrl } from "@/lib/install-url";
import { parsePaging } from "@/lib/paging";
import { SCAN_LIMITS } from "@/lib/scan";

export const dynamic = "force-dynamic";

// One branch when the scan asked for one, or when every repository landed on
// the same one. Nothing when they differ, because a single label would be a lie.
function scanBranch(scan: {
  branch: string | null;
  scanned: { branch: string }[];
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
  const view = await pageTenant();
  const current = view.current;
  const [{ rows, total }, aiKeys] = await withUser(view.login, () =>
    Promise.all([
      scansPage(view.login, paging),
      current?.role === "admin"
        ? aiKeyOptions(current.org)
        : Promise.resolve([]),
    ]),
  );
  const running = rows.find(
    (scan) => scan.status === "queued" || scan.status === "running",
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Scans"
        actions={
          <NewScanDialog
            installUrl={installUrl()}
            aiKeys={aiKeys}
            disabled={Boolean(running)}
            note={`${SCAN_LIMITS.perDay} scans a day, up to ${SCAN_LIMITS.repos} repositories each`}
          />
        }
      />

      <div className="space-y-4">
        <TableToolbar count={total} noun="scan">
          {running && (
            <span role="status" className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">
                {running.target}
              </span>{" "}
              {running.status}
            </span>
          )}
        </TableToolbar>

        <TableShell>
          <TableColumns columns={SCAN_COLUMNS} />
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center text-sm text-muted-foreground"
                >
                  No scans
                </TableCell>
              </TableRow>
            )}
            {rows.map((scan) => (
              <TableRow key={scan.id}>
                <TableCell>
                  <Link
                    href={`/dashboard/scans/${scan.id}`}
                    className="font-medium wrap-anywhere"
                  >
                    {scan.target}
                  </Link>
                  <span className="mt-1 block text-xs text-muted-foreground md:hidden">
                    {scan.repos.length}{" "}
                    {scan.repos.length === 1 ? "repository" : "repositories"} ·{" "}
                    {formatTimestamp(scan.createdAt)}
                  </span>
                </TableCell>
                <TableCell className="hidden font-mono text-xs wrap-anywhere text-muted-foreground lg:table-cell">
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
                      <span className="tabular-nums">
                        {scan.findings.length}
                      </span>
                    )
                  ) : (
                    <span className="text-muted-foreground">{scan.status}</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </TableShell>
      </div>

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
