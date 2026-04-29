import { Injectable } from '@angular/core';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { GeneResult } from '../models/analysis.model';

// ── Exported parameter snapshot ──────────────────────────────────────────────
export interface ExportParams {
  windowSize: number;
  phredThreshold: number;
  indelThreshold: number;
  assignmentMargin: number;
  analyzeAmbiguous: boolean;
  rescueAmbiguous: boolean;
  dataType: string;
  fileCount: number;
}

// ── Per-scope read flow data ─────────────────────────────────────────────────
export interface ReadFlowData {
  rawReads: number;
  phredPassed: number;
  anchorMatched: number;
  assignedReads: number;
  ambiguousReads: number;
}

// ── One scope of results (merged or per-file) ────────────────────────────────
export interface ScopeData {
  sheetName: string;
  readFlow: ReadFlowData;
  genes: GeneResult[];
}

@Injectable({ providedIn: 'root' })
export class ExcelExportService {

  // ── Shared style constants ───────────────────────────────────────────────
  private readonly HEADER_FILL: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2C3E50' } };
  private readonly HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  private readonly SECTION_FILL: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF34495E' } };
  private readonly SECTION_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
  private readonly PARAM_LABEL_FILL: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2F7' } };
  private readonly STRIPE_FILL: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F9FA' } };
  private readonly BORDER_THIN: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
    bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
    left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
    right: { style: 'thin', color: { argb: 'FFE0E0E0' } }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // Public entry point
  // ═══════════════════════════════════════════════════════════════════════════
  async exportToExcel(params: ExportParams, scopes: ScopeData[]): Promise<void> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'CRISPR Analysis Tool';
    wb.created = new Date();

    for (const scope of scopes) {
      this.buildSheet(wb, scope, params);
    }

    // Add hidden data sheet for perfect restoration in Result Viewer
    const dataSheet = wb.addWorksheet('.metadata', { state: 'hidden' });
    const jsonData = JSON.stringify({ params, scopes });
    const chunkSize = 30000; // Excel cell limit is ~32k
    for (let i = 0; i < jsonData.length; i += chunkSize) {
      dataSheet.addRow([jsonData.substring(i, i + chunkSize)]);
    }

    const buf = await wb.xlsx.writeBuffer();
    const now = new Date();
    const ts = now.getFullYear().toString()
      + String(now.getMonth() + 1).padStart(2, '0')
      + String(now.getDate()).padStart(2, '0')
      + '-'
      + String(now.getHours()).padStart(2, '0')
      + String(now.getMinutes()).padStart(2, '0');
    saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      `crispr-analysis-report-${ts}.xlsx`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Build one worksheet
  // ═══════════════════════════════════════════════════════════════════════════
  private buildSheet(wb: ExcelJS.Workbook, scope: ScopeData, params: ExportParams): void {
    // Excel sheet names: max 31 chars, no special chars
    const safeName = scope.sheetName.replace(/[\\/*?[\]:]/g, '_').substring(0, 31);
    const ws = wb.addWorksheet(safeName);

    // Column widths
    ws.columns = [
      { width: 22 }, // A
      { width: 18 }, // B
      { width: 14 }, // C
      { width: 14 }, // D
      { width: 16 }, // E
      { width: 14 }, // F
      { width: 14 }, // G
      { width: 14 }, // H
      { width: 14 }, // I
    ];

    let row = 1;

    // ── Section 1: Parameters ──────────────────────────────────────────────
    row = this.writeSection(ws, row, '1. Analysis Parameters');
    const paramPairs: [string, string | number][] = [
      ['Window Size (bp)', params.windowSize],
      ['Phred Threshold', params.phredThreshold],
      ['Indel Threshold (%)', params.indelThreshold],
      ['Assignment Margin (%)', params.assignmentMargin],
      ['Analyze Ambiguous Reads', params.analyzeAmbiguous ? 'Yes' : 'No'],
      ['Rescue Ambiguous Reads', params.rescueAmbiguous ? 'Yes' : 'No'],
      ['Data Type', params.dataType],
      ['Number of FASTQ Files', params.fileCount],
    ];
    for (const [label, value] of paramPairs) {
      const r = ws.getRow(row);
      r.getCell(1).value = label;
      r.getCell(1).font = { bold: true, size: 10 };
      r.getCell(1).fill = this.PARAM_LABEL_FILL;
      r.getCell(1).border = this.BORDER_THIN;
      r.getCell(2).value = value;
      r.getCell(2).border = this.BORDER_THIN;
      row++;
    }
    row++;

    // ── Section 2: Read Flow Summary ───────────────────────────────────────
    row = this.writeSection(ws, row, '2. Read Flow Summary');
    const flowPairs: [string, number | string][] = [
      ['Raw Reads', scope.readFlow.rawReads],
      ['Reads after Phred Filtering', scope.readFlow.phredPassed],
      ['Anchor Matched', scope.readFlow.anchorMatched],
      ['Assigned Reads', scope.readFlow.assignedReads],
      ['Final Ambiguous Reads', scope.readFlow.ambiguousReads],
    ];
    for (const [label, value] of flowPairs) {
      const r = ws.getRow(row);
      r.getCell(1).value = label;
      r.getCell(1).font = { bold: true, size: 10 };
      r.getCell(1).fill = this.PARAM_LABEL_FILL;
      r.getCell(1).border = this.BORDER_THIN;
      r.getCell(2).value = value;
      r.getCell(2).numFmt = '#,##0';
      r.getCell(2).border = this.BORDER_THIN;
      row++;
    }
    row++;

    // ── Section 3: Per-Class Summary ───────────────────────────────────────
    row = this.writeSection(ws, row, '3. Per-Class Summary');
    const summaryHeaderRow = row;

    // Collect flattened summary data & record where each gene's detail section starts
    // (we'll fill detail hyperlinks after writing section 4)
    const summaryHeaders = ['Gene', 'Source', 'Target', 'Total Reads', 'Aligned Reads',
      'Out-of-frame %', 'In-frame %', 'No Indel %', 'Substitution %'];
    const hdr = ws.getRow(row);
    summaryHeaders.forEach((h, i) => {
      const c = hdr.getCell(i + 1);
      c.value = h;
      c.fill = this.HEADER_FILL;
      c.font = this.HEADER_FONT;
      c.border = this.BORDER_THIN;
      c.alignment = { horizontal: 'center' };
    });
    row++;

    // We will record the row numbers where each gene detail section begins
    const geneSummaryRows: { geneName: string; row: number; detailRow?: number }[] = [];

    for (const gene of scope.genes) {
      const sourceType = gene.is_rescued_derived ? 'Rescued' : gene.is_ambiguous_derived ? 'Ambiguous' : 'Normal';
      const targets = gene.analysis_result?.targets ?? [];

      if (targets.length === 0) {
        // Gene with no targets (e.g. gRNA not found)
        const r = ws.getRow(row);
        r.getCell(1).value = gene.gene;
        r.getCell(2).value = sourceType;
        r.getCell(3).value = 'N/A';
        r.getCell(4).value = gene.assigned_read_count;
        r.getCell(4).numFmt = '#,##0';
        for (let i = 5; i <= 9; i++) { r.getCell(i).value = 'N/A'; }
        this.applyRowBorders(r, 9);
        if (geneSummaryRows.length % 2 === 1) this.applyStripe(r, 9);
        geneSummaryRows.push({ geneName: gene.gene, row });
        row++;
      } else {
        for (const target of targets) {
          const s = target.summary;
          const r = ws.getRow(row);
          r.getCell(1).value = gene.gene;
          r.getCell(2).value = sourceType;
          r.getCell(3).value = target.target_id;
          r.getCell(4).value = s?.total_reads ?? 0;
          r.getCell(4).numFmt = '#,##0';
          r.getCell(5).value = s?.aligned_reads ?? 0;
          r.getCell(5).numFmt = '#,##0';
          r.getCell(6).value = s?.out_of_frame_pct ?? 0;
          r.getCell(6).numFmt = '0.00"%"';
          r.getCell(7).value = s?.in_frame_pct ?? 0;
          r.getCell(7).numFmt = '0.00"%"';
          r.getCell(8).value = s?.no_indel_pct ?? 0;
          r.getCell(8).numFmt = '0.00"%"';
          r.getCell(9).value = s?.substitution_pct ?? 0;
          r.getCell(9).numFmt = '0.00"%"';
          this.applyRowBorders(r, 9);
          if (geneSummaryRows.length % 2 === 1) this.applyStripe(r, 9);
          // Only push once per gene (first target)
          if (targets.indexOf(target) === 0) {
            geneSummaryRows.push({ geneName: gene.gene, row });
          }
          row++;
        }
      }
    }
    row += 2;

    // ── Section 4: Detailed Analysis ──────────────────────────────────────
    row = this.writeSection(ws, row, '4. Detailed Analysis');
    row++;

    for (const gene of scope.genes) {
      const entryIdx = geneSummaryRows.findIndex(e => e.geneName === gene.gene);
      if (entryIdx !== -1) {
        geneSummaryRows[entryIdx].detailRow = row;
      }

      // Gene header
      const geneHeaderRow = ws.getRow(row);
      ws.mergeCells(row, 1, row, 9);
      geneHeaderRow.getCell(1).value = `Gene: ${gene.gene}`;
      geneHeaderRow.getCell(1).font = { bold: true, size: 12, color: { argb: 'FF2C3E50' } };
      geneHeaderRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDFE6ED' } } as ExcelJS.FillPattern;
      row++;

      const sourceType = gene.is_rescued_derived ? 'Rescued' : gene.is_ambiguous_derived ? 'Ambiguous' : 'Normal';
      ws.getRow(row).getCell(1).value = 'Source Type:';
      ws.getRow(row).getCell(1).font = { bold: true, size: 10 };
      ws.getRow(row).getCell(2).value = sourceType;
      row++;
      ws.getRow(row).getCell(1).value = 'Assigned Reads:';
      ws.getRow(row).getCell(1).font = { bold: true, size: 10 };
      ws.getRow(row).getCell(2).value = gene.assigned_read_count;
      ws.getRow(row).getCell(2).numFmt = '#,##0';
      row += 2;

      const targets = gene.analysis_result?.targets ?? [];
      for (const target of targets) {
        // Target sub-header
        const tRow = ws.getRow(row);
        ws.mergeCells(row, 1, row, 9);
        tRow.getCell(1).value = `Target: ${target.target_id}`;
        tRow.getCell(1).font = { bold: true, size: 11, color: { argb: 'FF2980B9' } };
        row++;

        // Metrics
        const s = target.summary;
        const metricPairs: [string, number | string][] = [
          ['Total Reads', s?.total_reads ?? 'N/A'],
          ['Aligned Reads', s?.aligned_reads ?? 'N/A'],
          ['Out-of-frame %', s?.out_of_frame_pct != null ? `${s.out_of_frame_pct}%` : 'N/A'],
          ['In-frame %', s?.in_frame_pct != null ? `${s.in_frame_pct}%` : 'N/A'],
          ['No Indel %', s?.no_indel_pct != null ? `${s.no_indel_pct}%` : 'N/A'],
          ['Substitution %', s?.substitution_pct != null ? `${s.substitution_pct}%` : 'N/A'],
        ];
        for (const [k, v] of metricPairs) {
          const r = ws.getRow(row);
          r.getCell(1).value = k;
          r.getCell(1).font = { bold: true, size: 10 };
          r.getCell(1).fill = this.PARAM_LABEL_FILL;
          r.getCell(1).border = this.BORDER_THIN;
          r.getCell(2).value = v;
          if (typeof v === 'number') r.getCell(2).numFmt = '#,##0';
          r.getCell(2).border = this.BORDER_THIN;
          row++;
        }
        row++;

        // Annotation Groups
        if (target.top_groups && target.top_groups.length > 0) {
          const agHdr = ws.getRow(row);
          const agHeaders = ['Rank', 'Type', 'Read Count', 'Percentage', 'Net Indel', 'Sequence'];
          agHeaders.forEach((h, i) => {
            const c = agHdr.getCell(i + 1);
            c.value = h;
            c.fill = this.HEADER_FILL;
            c.font = this.HEADER_FONT;
            c.border = this.BORDER_THIN;
            c.alignment = { horizontal: 'center' };
          });
          row++;

          for (const grp of target.top_groups) {
            const r = ws.getRow(row);
            r.getCell(1).value = grp.group_rank;
            r.getCell(1).alignment = { horizontal: 'center' };
            r.getCell(2).value = grp.classification;
            r.getCell(3).value = grp.read_count;
            r.getCell(3).numFmt = '#,##0';
            r.getCell(4).value = grp.read_pct != null ? `${grp.read_pct}%` : 'N/A';
            r.getCell(5).value = grp.net_indel;
            r.getCell(6).value = grp.read_inner || 'N/A';
            r.getCell(6).font = { name: 'Courier New', size: 9 };
            this.applyRowBorders(r, 6);
            if (target.top_groups.indexOf(grp) % 2 === 1) this.applyStripe(r, 6);
            row++;
          }
        }
        row++;
      }
      row++;
    }

    // ── Back-fill hyperlinks from Summary → Detail ────────────────────────
    for (const entry of geneSummaryRows) {
      if (entry.detailRow) {
        const summaryCell = ws.getRow(entry.row).getCell(1);
        summaryCell.value = {
          text: entry.geneName,
          hyperlink: `#'${safeName}'!A${entry.detailRow}`
        } as ExcelJS.CellHyperlinkValue;
        summaryCell.font = { bold: true, color: { argb: 'FF2980B9' }, underline: true, size: 10 };
      }
    }

    // Freeze header row area
    ws.views = [{ state: 'frozen', ySplit: summaryHeaderRow, xSplit: 0 }];
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  private writeSection(ws: ExcelJS.Worksheet, row: number, title: string): number {
    const r = ws.getRow(row);
    ws.mergeCells(row, 1, row, 9);
    r.getCell(1).value = title;
    r.getCell(1).fill = this.SECTION_FILL;
    r.getCell(1).font = this.SECTION_FONT;
    r.getCell(1).alignment = { horizontal: 'left' };
    r.height = 26;
    return row + 1;
  }

  private applyRowBorders(r: ExcelJS.Row, cols: number): void {
    for (let i = 1; i <= cols; i++) {
      r.getCell(i).border = this.BORDER_THIN;
    }
  }

  private applyStripe(r: ExcelJS.Row, cols: number): void {
    for (let i = 1; i <= cols; i++) {
      r.getCell(i).fill = this.STRIPE_FILL;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Import from Excel (Reconstruct State)
  // ═══════════════════════════════════════════════════════════════════════════
  async importFromExcel(file: File): Promise<{ params: Partial<ExportParams>, scopes: ScopeData[] }> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());

    const scopes: ScopeData[] = [];
    const params: Partial<ExportParams> = {};

    // ── Strategy A: Try reading from hidden metadata sheet (100% fidelity) ───
    const metaSheet = wb.getWorksheet('.metadata');
    if (metaSheet) {
      let jsonStr = '';
      metaSheet.eachRow(row => {
        const val = row.getCell(1).text;
        if (val) jsonStr += val;
      });
      try {
        const restored = JSON.parse(jsonStr);
        if (restored.params && restored.scopes) {
          console.log('Restored state from hidden metadata sheet.');
          return restored;
        }
      } catch (e) {
        console.warn('Failed to parse metadata sheet, falling back to visual parsing.', e);
      }
    }

    // ── Strategy B: Fallback to visual row parsing ───────────────────────────
    wb.worksheets.forEach(ws => {
      if (ws.name === '.metadata') return; // Skip internal sheet

      const scope: ScopeData = {
        sheetName: ws.name,
        readFlow: { rawReads: 0, phredPassed: 0, anchorMatched: 0, assignedReads: 0, ambiguousReads: 0 },
        genes: []
      };

      let currentSection = 0;
      let currentGene: GeneResult | null = null;
      let currentTarget: any = null;
      let inAnnotationGroup = false;

      ws.eachRow((row) => {
        const cell1 = row.getCell(1).text?.trim();
        if (!cell1) {
          inAnnotationGroup = false;
          return;
        }

        if (cell1.startsWith('1. Analysis Parameters')) { currentSection = 1; return; }
        if (cell1.startsWith('2. Read Flow Summary')) { currentSection = 2; return; }
        if (cell1.startsWith('3. Per-Class Summary')) { currentSection = 3; return; }
        if (cell1.startsWith('4. Detailed Analysis')) { currentSection = 4; return; }

        // Section 1: Parameters (only parse from Merged sheet)
        if (currentSection === 1 && ws.name === 'Merged') {
          const val = row.getCell(2).value;
          if (cell1 === 'Window Size (bp)') params.windowSize = Number(val);
          if (cell1 === 'Phred Threshold') params.phredThreshold = Number(val);
          if (cell1 === 'Indel Threshold (%)') params.indelThreshold = Number(val);
          if (cell1 === 'Assignment Margin (%)') params.assignmentMargin = Number(val);
          if (cell1 === 'Analyze Ambiguous Reads') params.analyzeAmbiguous = (val === 'Yes');
          if (cell1 === 'Rescue Ambiguous Reads') params.rescueAmbiguous = (val === 'Yes');
          if (cell1 === 'Data Type') params.dataType = val as string;
          if (cell1 === 'Number of FASTQ Files') params.fileCount = Number(val);
        }

        // Section 2: Read Flow
        if (currentSection === 2) {
          const valStr = row.getCell(2).text;
          const val = Number(valStr.replace(/,/g, '')) || 0;
          if (cell1 === 'Raw Reads') scope.readFlow.rawReads = val;
          if (cell1 === 'Reads after Phred Filtering') scope.readFlow.phredPassed = val;
          if (cell1 === 'Anchor Matched') scope.readFlow.anchorMatched = val;
          if (cell1 === 'Assigned Reads') scope.readFlow.assignedReads = val;
          if (cell1 === 'Final Ambiguous Reads') scope.readFlow.ambiguousReads = val;
        }

        // Section 4: Detailed Analysis
        if (currentSection === 4) {
          if (cell1.startsWith('Gene: ')) {
            const gName = cell1.replace('Gene: ', '').trim();
            currentGene = {
              gene: gName,
              assigned_read_count: 0,
              is_rescued_derived: false,
              is_ambiguous_derived: false,
              ambiguous_excluded: false,
              analysis_result: { targets: [] }
            };
            scope.genes.push(currentGene as GeneResult);
            inAnnotationGroup = false;
            return;
          }

          if (!currentGene) return;

          if (cell1 === 'Source Type:') {
            const src = row.getCell(2).text;
            if (src === 'Rescued') currentGene.is_rescued_derived = true;
            if (src === 'Ambiguous') currentGene.is_ambiguous_derived = true;
            return;
          }
          if (cell1 === 'Assigned Reads:') {
            currentGene.assigned_read_count = Number(row.getCell(2).text.replace(/,/g, '')) || 0;
            return;
          }

          if (cell1.startsWith('Target: ')) {
            const tName = cell1.replace('Target: ', '').trim();
            currentTarget = {
              target_id: tName,
              summary: { total_reads: 0, matched_reads: 0, aligned_reads: 0, unedited_reads: 0, edited_reads: 0 },
              top_groups: []
            };
            currentGene.analysis_result!.targets!.push(currentTarget);
            inAnnotationGroup = false;
            return;
          }

          if (!currentTarget) return;

          if (!inAnnotationGroup) {
            const valStr = row.getCell(2).text.replace(/,/g, '').replace(/%/g, '');
            const numVal = parseFloat(valStr) || 0;
            
            if (cell1 === 'Total Reads') currentTarget.summary.total_reads = numVal;
            if (cell1 === 'Aligned Reads') currentTarget.summary.aligned_reads = numVal;
            if (cell1 === 'Out-of-frame %') currentTarget.summary.out_of_frame_pct = numVal;
            if (cell1 === 'In-frame %') currentTarget.summary.in_frame_pct = numVal;
            if (cell1 === 'No Indel %') currentTarget.summary.no_indel_pct = numVal;
            if (cell1 === 'Substitution %') currentTarget.summary.substitution_pct = numVal;

            if (cell1 === 'Rank' && row.getCell(2).text === 'Type') {
              inAnnotationGroup = true;
              return;
            }
          } else {
            // Table Headers: ['Rank', 'Type', 'Read Count', 'Percentage', 'Net Indel', 'Sequence'];
            const rankStr = cell1;
            const rank = parseInt(rankStr);
            if (isNaN(rank)) {
              inAnnotationGroup = false;
              return;
            }

            const grp = {
              group_rank: rank,
              classification: row.getCell(2).text || 'Unknown',
              read_count: Number(row.getCell(3).text.replace(/,/g, '')) || 0,
              read_pct: parseFloat(row.getCell(4).text.replace(/%/g, '')) || 0,
              net_indel: Number(row.getCell(5).text) || 0,
              read_inner: row.getCell(6).text || '',
              representative_read: ''
            };
            currentTarget.top_groups.push(grp);
          }
        }
      });

      scopes.push(scope);
    });

    return { params, scopes };
  }
}
