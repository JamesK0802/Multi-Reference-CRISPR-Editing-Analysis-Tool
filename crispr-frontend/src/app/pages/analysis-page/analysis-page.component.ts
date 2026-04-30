import { Component, ChangeDetectorRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { AppStateService } from '../../services/app-state.service';
import { ResultDashboardComponent } from '../../components/result-dashboard/result-dashboard.component';
import { ExportParams } from '../../services/excel-export.service';

@Component({
  selector: 'app-analysis-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, ResultDashboardComponent],
  templateUrl: './analysis-page.component.html'
})
export class AnalysisPageComponent implements OnInit {
  constructor(
    public state: AppStateService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit() {
    this.state.activateSlot('analysis');
  }

  onFileSelected(event: any) {
    const files = event.target.files;
    for (let i = 0; i < files.length; i++) {
      if (files[i].name.match(/\.(fastq|fq)$/)) this.state.selectedFiles.push(files[i]);
    }
  }

  onFileDropped(event: DragEvent) {
    event.preventDefault();
    this.state.isDragging = false;
    if (event.dataTransfer?.files) {
      const files = event.dataTransfer.files;
      for (let i = 0; i < files.length; i++) {
        if (files[i].name.match(/\.(fastq|fq)$/)) this.state.selectedFiles.push(files[i]);
      }
    }
  }

  onDragOver(event: DragEvent) { event.preventDefault(); this.state.isDragging = true; }
  onDragLeave(event: DragEvent) { event.preventDefault(); this.state.isDragging = false; }
  removeFile(i: number) { this.state.selectedFiles.splice(i, 1); }

  runAnalysis() {
    const rawValue = this.state.analysisForm.value;
    const formInvalid = this.state.analysisForm.get('genes')?.invalid || this.state.analysisForm.get('interestRegion')?.invalid;

    if (formInvalid || this.state.selectedFiles.length === 0) {
      this.state.error = 'Validation failed. Check files and parameters.';
      return;
    }

    this.state.resetAnalysis();

    const formData = new FormData();
    this.state.selectedFiles.forEach(f => formData.append('files', f, f.name));
    formData.append('data_type', 'single-end');
    formData.append('interest_region', (rawValue.interestRegion || 90).toString());

    const phredVal = (rawValue.phredLevel || 1) * 10;
    const indelVal = (rawValue.indelPercent || 1) * 1.0;
    const marginVal = (rawValue.marginPercent || 2) / 100;

    formData.append('phred_threshold', phredVal.toString());
    formData.append('indel_threshold', indelVal.toString());
    formData.append('is_multi_reference', 'true');
    formData.append('assignment_margin_threshold', marginVal.toString());

    this.state.lastRunParams = {
      windowSize: rawValue.interestRegion || 90,
      phredThreshold: phredVal,
      indelThreshold: indelVal,
      assignmentMargin: (rawValue.marginPercent || 2),
      analyzeAmbiguous: rawValue.analyzeAmbiguous || false,
      rescueAmbiguous: rawValue.rescueAmbiguous || false,
      dataType: 'single-end',
      fileCount: this.state.selectedFiles.length
    };

    const genesPayload = rawValue.genes.map((g: any, gi: number) => ({
      gene: g.gene_name?.trim() || `G${gi + 1}`,
      sequence: g.gene_reference,
      targets: g.geneTargets.map((t: any, ti: number) => ({
        target_id: t.target_id?.trim() || `T${ti + 1}`,
        sgrna_seq: t.gRNA,
        reference_seq: g.gene_reference,
        window_size: rawValue.interestRegion || 90
      }))
    }));
    formData.append('targets', JSON.stringify(genesPayload));
    formData.append('analyze_ambiguous', rawValue.analyzeAmbiguous ? 'true' : 'false');
    formData.append('rescue_ambiguous', rawValue.rescueAmbiguous ? 'true' : 'false');

    this.state.runAnalysis(formData);
  }
}
