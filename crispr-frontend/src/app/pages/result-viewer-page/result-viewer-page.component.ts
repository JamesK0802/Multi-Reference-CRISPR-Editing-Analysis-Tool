import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppStateService } from '../../services/app-state.service';
import { ResultDashboardComponent } from '../../components/result-dashboard/result-dashboard.component';
import { ExcelExportService, ExportParams, ScopeData } from '../../services/excel-export.service';
import { GeneResult, MultiReferenceResponse } from '../../models/analysis.model';

@Component({
  selector: 'app-result-viewer-page',
  standalone: true,
  imports: [CommonModule, ResultDashboardComponent],
  templateUrl: './result-viewer-page.component.html'
})
export class ResultViewerPageComponent implements OnInit {
  constructor(
    public state: AppStateService,
    private excelExportService: ExcelExportService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.state.activateSlot('viewer');
  }

  onExcelDropped(event: DragEvent) {
    event.preventDefault();
    this.state.isDragging = false;
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) this.loadExcelResult(files[0]);
  }

  onExcelSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) this.loadExcelResult(input.files[0]);
  }

  onDragOver(event: DragEvent) { event.preventDefault(); this.state.isDragging = true; }
  onDragLeave(event: DragEvent) { event.preventDefault(); this.state.isDragging = false; }

  async loadExcelResult(file: File) {
    try {
      this.state.addLog(`Loading excel file: ${file.name}`);
      const data = await this.excelExportService.importFromExcel(file);
      
      this.state.ngZone.run(() => {
        this.state.lastRunParams = data.params as ExportParams;
        this.state.allFileResults = [];
        
        const mergedScope = data.scopes.find(s => s.sheetName === 'Merged');
        if (mergedScope) {
          this.state.mergedGenes = mergedScope.genes;
          this.state.totalMergedRawReads = mergedScope.readFlow.rawReads;
          this.state.totalMergedPhredPassed = mergedScope.readFlow.phredPassed;
          this.state.totalMergedAnchorMatched = mergedScope.readFlow.anchorMatched;
          this.state.totalMergedAmbiguous = mergedScope.readFlow.ambiguousReads;
        } else {
          this.state.mergedGenes = [];
        }

        const fileScopes = data.scopes.filter(s => s.sheetName !== 'Merged');
        for (const scope of fileScopes) {
          this.state.allFileResults.push({
            fastq_file: scope.sheetName,
            multi_reference_result: {
              debug: {
                total_reads_parsed: scope.readFlow.rawReads,
                phred_passed_count: scope.readFlow.phredPassed,
                anchor_matched_count: scope.readFlow.anchorMatched
              },
              ambiguous_read_count: scope.readFlow.ambiguousReads,
              genes: scope.genes
            }
          });
        }

        this.state.isMultiReference = true;
        this.state.multiFileCount = fileScopes.length;
        this.state.selectedScopeIndex = -1;
        this.state.updateVisibleGenes();
        
        this.cdr.detectChanges(); // Force *ngIf to update
        this.state.resultsUpdated$.next();

        this.state.addLog(`Excel report imported successfully.`);
      });
    } catch (e: any) {
      console.error('Excel import failed:', e);
      this.state.addLog(`Excel import failed: ${e.message}`);
    }
  }
}
