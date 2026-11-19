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

export function mergeRemoteProjectsWithLocal(
  localProjects: Project[],
  remoteProjects: Project[],
  hasPendingSync: (projectId: string) => boolean = () => false
): Project[] {
  const byId = new Map(localProjects.map((p) => [p.id, p]));

  for (const remote of remoteProjects) {
    if (hasPendingSync(remote.id)) {
      continue;
    }

    const local = byId.get(remote.id);
    if (local) {
      const localUpdatedMs = parseSyncTimestampMs(local.updatedAt);
      const remoteUpdatedMs = parseSyncTimestampMs(remote.updatedAt);
      if (localUpdatedMs > 0 && (remoteUpdatedMs === 0 || localUpdatedMs > remoteUpdatedMs + 1500)) {
        continue;
      }
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
              pdfDataUrl: rs.pdfDataUrl || localSheet?.pdfDataUrl,
            };
          })
        : local?.takeoffSheets || [generateGisPlotTakeoffSheet(remote)];

    byId.set(remote.id, {
      ...remote,
      takeoffSheets: hydratedSheets,
    });
  }

  return Array.from(byId.values());
}
