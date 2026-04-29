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
}
