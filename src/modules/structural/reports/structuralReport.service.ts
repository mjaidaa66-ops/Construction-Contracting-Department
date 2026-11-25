import type {
  NormalizedStructuralDataset,
  StructuralReportDocument,
} from '../types/structural-results.types';

export function generateStructuralReport(params: {
  dataset: NormalizedStructuralDataset;
  reportType?: StructuralReportDocument['reportType'];
}): StructuralReportDocument {
  const { dataset, reportType = 'IMPORT_AUDIT' } = params;
  const nowIso = new Date().toISOString();
  const { model, revision, validation } = dataset;

  const lines: string[] = [
    `# AL BUNYAN — Structural Intelligence Engineering Report (${reportType})`,
    '',
    `- **Report ID**: \`rpt_${revision.id}\``,
    `- **Project ID**: \`${model.projectId}\``,
    `- **Revision**: #${revision.revisionNumber} (\`${revision.id}\`)`,
    `- **Generated At (UTC)**: ${nowIso}`,
    `- **Source Application**: ${model.sourceApplication} (${model.sourceVersion})`,
    `- **Source File Reference**: ${model.sourceFileReference}`,
    `- **Units**: Original \`${model.originalUnits}\` -> Normalized \`${model.normalizedUnits}\``,
    `- **Overall Reliability Classification**: **${validation.reliability}**`,
    `- **Validation Result**: ${validation.status} (${validation.errorCount} Errors, ${validation.warningCount} Warnings)`,
    '',
    '## Extracted Structural Inventory',
    `- Stories: ${dataset.stories.length}`,
    `- Grid Systems: ${dataset.grids.length}`,
    `- Joint/Point Nodes: ${dataset.nodes.length}`,
    `- Frame Elements: ${dataset.frames.length}`,
    `- Area Elements: ${dataset.areas.length}`,
    `- Materials: ${dataset.materials.length}`,
    `- Section Properties: ${dataset.sections.length}`,
    `- Load Patterns: ${dataset.loadPatterns.length}`,
    `- Load Cases: ${dataset.loadCases.length}`,
    `- Load Combinations: ${dataset.loadCombinations.length}`,
    '',
    '## Validation Findings',
  ];

  if (validation.issues.length === 0) {
    lines.push('- Zero integrity or consistency issues detected.');
  } else {
    for (const issue of validation.issues) {
      lines.push(
        `- [${issue.severity}] \`${issue.code}\` (${issue.entityType} \`${issue.entityId}\`): ${issue.messageEn}`
      );
    }
  }

  lines.push(
    '',
    '## Phase 1 Engineering Boundary Notice',
    '- Automated FEA execution and code-check post-processing remain Phase 2 capabilities unless explicitly populated from source ETABS tables.'
  );

  return {
    id: `rpt_${revision.id}_${reportType.toLowerCase()}`,
    ownerId: model.ownerId,
    projectId: model.projectId,
    revisionId: revision.id,
    reportType,
    titleAr:
      reportType === 'VALIDATION_SUMMARY'
        ? `تقرير التحقق الإنشائي — المراجعة #${revision.revisionNumber}`
        : reportType === 'MODEL_INVENTORY'
        ? `حصر عناصر النموذج الإنشائي — المراجعة #${revision.revisionNumber}`
        : `تقرير تدقيق استيراد ETABS — المراجعة #${revision.revisionNumber}`,
    titleEn:
      reportType === 'VALIDATION_SUMMARY'
        ? `Structural Validation Report — Rev #${revision.revisionNumber}`
        : reportType === 'MODEL_INVENTORY'
        ? `Structural Model Inventory — Rev #${revision.revisionNumber}`
        : `ETABS Import Audit Report — Rev #${revision.revisionNumber}`,
    generatedAt: nowIso,
    reliability: validation.reliability,
    markdownContent: lines.join('\n'),
    metrics: {
      stories: dataset.stories.length,
      grids: dataset.grids.length,
      nodes: dataset.nodes.length,
      frames: dataset.frames.length,
      areas: dataset.areas.length,
      materials: dataset.materials.length,
      sections: dataset.sections.length,
      loadPatterns: dataset.loadPatterns.length,
      loadCases: dataset.loadCases.length,
      loadCombinations: dataset.loadCombinations.length,
      validationErrors: validation.errorCount,
      validationWarnings: validation.warningCount,
    },
  };
}
