import type { Project, TakeoffSheet } from '../types/bunyan';
import { generateGisPlotTakeoffSheet } from '../utils/gisTakeoffGenerator';

export function parseSyncTimestampMs(ts: unknown): number {
  if (!ts) return 0;
  if (typeof ts === 'string') {
    const parsed = Date.parse(ts);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof ts === 'object') {
    const obj = ts as { toDate?: () => Date; seconds?: number };
    if (typeof obj.toDate === 'function') {
      return obj.toDate().getTime();
    }
    if (typeof obj.seconds === 'number') {
      return obj.seconds * 1000;
    }
  }
  return 0;
}

/**
 * Replaces local workspace project projections strictly with authoritative Firestore snapshots
 * while hydrating ephemeral SVG previews for blueprint sheets.
 */
export function mergeRemoteProjectsWithLocal(
  localProjects: Project[],
  remoteProjects: Project[],
  hasInFlightCommit: (projectId: string) => boolean = () => false
): Project[] {
  const localById = new Map(localProjects.map((p) => [p.id, p]));
  const result: Project[] = [];

  for (const remote of remoteProjects) {
    const local = localById.get(remote.id);
    if (hasInFlightCommit(remote.id) && local) {
      result.push(local);
      continue;
    }

    const localSheetsById = new Map((local?.takeoffSheets || []).map((s) => [s.id, s]));

    const hydratedSheets: TakeoffSheet[] =
      remote.takeoffSheets && remote.takeoffSheets.length > 0
        ? remote.takeoffSheets.map((rs) => {
            const localSheet = localSheetsById.get(rs.id);
            if (rs.sheetType === 'blueprint_svg' && !rs.svgContent) {
              const fallbackSvg = generateGisPlotTakeoffSheet(remote);
              return {
                ...rs,
                svgContent: localSheet?.svgContent || fallbackSvg.svgContent,
              };
            }
            return {
              ...rs,
              pdfDataUrl:
                rs.pdfDataUrl ||
                (localSheet?.pdfManifestId === rs.pdfManifestId
                  ? localSheet?.pdfDataUrl
                  : undefined),
            };
          })
        : [generateGisPlotTakeoffSheet(remote)];

    result.push({
      ...remote,
      takeoffSheets: hydratedSheets,
    });
  }

  return result;
}
