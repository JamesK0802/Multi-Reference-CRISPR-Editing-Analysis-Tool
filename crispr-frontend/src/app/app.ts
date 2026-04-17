import { Component, OnInit, OnDestroy, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { AnalysisService, TaskStatus } from './services/analysis.service';
import { AnalysisResponse, AnalysisBreakdown } from './models/analysis.model';
import { Chart } from 'chart.js/auto';
import { Subject, timer } from 'rxjs';
import { takeUntil, switchMap } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit, OnDestroy {
  analysisForm!: FormGroup;
  selectedFiles: File[] = [];
  isDragging = false;
  
  // State
  result: AnalysisResponse | null = null;
  error: string | null = null;
  isLoading = false;
  useMock = false;
  
  // Progress State
  progress = 0;
  progressStage = '';
  debugLogs: string[] = []; 
  private destroy$ = new Subject<void>();

  metrics = { 
    totalReads: 0, 
    alignedReads: 0, 
    avgOutOfFrame: 0,
    avgInFrame: 0,
    avgNoIndel: 0,
    avgSubstitution: 0
  };
  private charts: Chart[] = [];

  constructor(
    private fb: FormBuilder,
    private analysisService: AnalysisService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone
  ) {}

  ngOnInit() {
    this.initForm();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  addLog(msg: string) {
    const timestamp = new Date().toLocaleTimeString();
    this.debugLogs.unshift(`[${timestamp}] ${msg}`);
    if (this.debugLogs.length > 20) this.debugLogs.pop();
    this.cdr.detectChanges();
  }

  private initForm() {
    this.analysisForm = this.fb.group({
      dataType: ['single-end'],
      interestRegion: [90, [Validators.required, Validators.min(60), Validators.max(120)]],
      phredThreshold: [10],
      indelThreshold: [1.0],
      targets: this.fb.array([this.createTargetGroup()])
    });
  }

  private createTargetGroup(): FormGroup {
    return this.fb.group({
      target_id: ['', Validators.required],
      gRNA: ['', Validators.required],
      reference_sequence: ['', Validators.required]
    });
  }

  get targets() { return this.analysisForm.get('targets') as FormArray; }
  addTarget() { this.targets.push(this.createTargetGroup()); }
  removeTarget(index: number) { if (this.targets.length > 1) this.targets.removeAt(index); }

  onFileSelected(event: any) { this.addFiles(event.target.files); }
  onFileDropped(event: DragEvent) {
    event.preventDefault();
    this.isDragging = false;
    if (event.dataTransfer?.files) this.addFiles(event.dataTransfer.files);
  }
  onDragOver(event: DragEvent) { event.preventDefault(); this.isDragging = true; }
  onDragLeave(event: DragEvent) { event.preventDefault(); this.isDragging = false; }

  private addFiles(files: FileList) {
    for (let i = 0; i < files.length; i++) {
      if (files[i].name.match(/\.(fastq|fq)$/)) this.selectedFiles.push(files[i]);
    }
  }

  removeFile(index: number) { this.selectedFiles.splice(index, 1); }

  toggleMockMode() {
    this.useMock = !this.useMock;
    this.analysisService.setMockMode(this.useMock);
    this.addLog(`Mock mode toggled: ${this.useMock}`);
  }

  runAnalysis() {
    try {
      if (this.analysisForm.invalid || (this.selectedFiles.length === 0 && !this.useMock)) {
        this.error = 'Validation failed. Check files and parameters.';
        this.cdr.detectChanges();
        return;
      }

      this.debugLogs = [];
      this.addLog('Starting analysis workflow...');
      this.error = null;
      this.result = null;
      this.destroyCharts();
      this.isLoading = true;
      this.progress = 0;
      
      // Force change detection immediately so UI shows "Loading..." state before HTTP request blocks
      this.cdr.detectChanges();

      const formData = new FormData();
      if (this.selectedFiles.length > 0) {
        this.selectedFiles.forEach(f => formData.append('files', f, f.name));
      }
      
      const rawValue = this.analysisForm.value;
      formData.append('data_type', rawValue.dataType);
      formData.append('interest_region', (rawValue.interestRegion || 90).toString());
      formData.append('phred_threshold', (rawValue.phredThreshold || 10).toString());
      formData.append('indel_threshold', (rawValue.indelThreshold || 1.0).toString());
      formData.append('targets', JSON.stringify(rawValue.targets));

      this.analysisService.runAnalysis(formData).subscribe({
        next: (res: any) => {
          this.ngZone.run(() => {
            if (this.useMock) {
              this.handleAnalysisComplete(res);
            } else {
              this.startPolling(res.task_id);
            }
          });
        },
        error: (err) => {
          this.ngZone.run(() => {
            this.error = err.message;
            this.isLoading = false;
            this.cdr.detectChanges();
          });
        }
      });
    } catch (e: any) {
      this.error = e.message;
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  private startPolling(taskId: string) {
    timer(0, 1500).pipe(
      takeUntil(this.destroy$),
      switchMap(() => this.analysisService.getTaskStatus(taskId))
    ).subscribe({
      next: (status: TaskStatus) => {
        this.ngZone.run(() => {
          this.progress = status.progress;
          this.progressStage = status.stage;
          if (status.status === 'failed') {
            this.error = status.error || 'Backend analysis failed.';
            this.isLoading = false;
            this.destroy$.next();
          } else if (status.progress === 100 && status.result) {
            this.handleAnalysisComplete(status.result);
            this.destroy$.next();
          }
          this.cdr.detectChanges();
        });
      },
      error: () => {
        this.ngZone.run(() => {
          this.error = 'Lost connection to status endpoint.';
          this.isLoading = false;
          this.destroy$.next();
          this.cdr.detectChanges();
        });
      }
    });
  }

  private handleAnalysisComplete(res: AnalysisResponse) {
    this.ngZone.run(() => {
      console.log('[DEBUG] --- RAW RESPONSE PATH VERIFICATION ---');
      console.log('[DEBUG] Response Object:', res);
      
      try {
        this.result = res;
        this.selectedRowIndex = 0;
        this.refreshDashboard();
        
        this.progress = 100;
        this.progressStage = 'Analysis Complete';
        this.isLoading = false; 
        
        this.addLog('Dashboard updated with results.');
        this.cdr.detectChanges(); 
        
        setTimeout(() => {
          const element = document.getElementById('resultsSection');
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 300);

        setTimeout(() => {
          this.cdr.detectChanges();
        }, 500);

      } catch (e: any) {
        console.error('[DEBUG] handleAnalysisComplete critical error:', e);
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  selectedRowIndex: number = 0;

  get flatTargets() {
    if (!this.result || !this.result.results) return [];
    return this.result.results.flatMap(f =>
      (f.target_results || []).map(t => ({ file: f, target: t }))
    );
  }

  get summaryTableData() {
    return this.flatTargets.map((item, index) => ({
      index,
      sample: item.file.sample_name || item.file.fastq_file.split('/').pop(),
      target: item.target.target_id,
      total: item.target.summary.total_reads || 0,
      matched: item.target.summary.matched_reads || 0,
      outOfFrame: item.target.summary.out_of_frame_pct || 0,
      inFrame: item.target.summary.in_frame_pct || 0,
      noIndel: item.target.summary.no_indel_pct || 0,
      substitution: item.target.summary.substitution_pct || 0
    }));
  }

  selectRow(index: number) {
    this.selectedRowIndex = index;
    this.refreshDashboard();
  }

  selectedTarget: any = null;

  private refreshDashboard() {
    if (!this.result || !this.result.results) {
      console.warn('[DEBUG] refreshDashboard: no results array found.');
      return;
    }

    const flat = this.flatTargets;
    if (flat.length === 0) return;

    if (this.selectedRowIndex >= flat.length || this.selectedRowIndex < 0) {
      this.selectedRowIndex = 0;
    }

    const selectedFile = flat[this.selectedRowIndex].file;
    this.selectedTarget = flat[this.selectedRowIndex].target;

    this.metrics = {
      totalReads: this.selectedTarget.summary.total_reads || 0,
      alignedReads: this.selectedTarget.summary.matched_reads || 0,
      avgOutOfFrame: this.selectedTarget.summary.out_of_frame_pct || 0,
      avgInFrame: this.selectedTarget.summary.in_frame_pct || 0,
      avgNoIndel: this.selectedTarget.summary.no_indel_pct || 0,
      avgSubstitution: this.selectedTarget.summary.substitution_pct || 0,
    };

    // ── Debug log ──────────────────────────────────────────────────────────
    console.log('[DEBUG] refreshDashboard ===========================');
    console.log(`  Selected Target: ${this.selectedTarget.target_id}`);
    console.log(`  total_reads: ${this.metrics.totalReads}`);
    console.log(`  aligned_reads: ${this.metrics.alignedReads}`);
    console.log(`  Out-of-frame %: ${this.metrics.avgOutOfFrame.toFixed(2)}%`);
    console.log('[DEBUG] ============================================');

    // Force Angular to update the view immediately with new metrics
    this.cdr.detectChanges();

    // Automatically update charts for selected target too
    // Give DOM a microtask to ensure canvas exists if first loaded
    setTimeout(() => {
      this.updateChartsForSelected();
      this.cdr.detectChanges();
    }, 50);
  }

  private destroyCharts() { 
    this.charts.forEach(c => c.destroy()); 
    this.charts = []; 
  }

  private updateChartsForSelected() {
    this.destroyCharts();

    const flat = this.flatTargets;
    if (flat.length === 0) return;
    const selectedData = flat[this.selectedRowIndex].target;
    // For bar charts, we still want to show all targets for easy comparison
    const indelCtx = document.getElementById('indelChart') as HTMLCanvasElement;
    if (indelCtx) {
      this.charts.push(new Chart(indelCtx, {
        type: 'bar',
        data: {
          labels: flat.map(item => `${item.file.sample_name || item.file.fastq_file.split('/').pop()} (${item.target.target_id})`),
          datasets: [
            {
              label: 'Out-of-frame %',
              data: flat.map(item => item.target.summary.out_of_frame_pct || 0),
              backgroundColor: '#e74c3c'
            },
            {
              label: 'In-frame %',
              data: flat.map(item => item.target.summary.in_frame_pct || 0),
              backgroundColor: '#e67e22'
            }
          ]
        },
        options: { 
          responsive: true, 
          maintainAspectRatio: false,
          scales: { x: { stacked: true }, y: { stacked: true } }
        }
      }));
    }

    // Pie chart -> ONLY selected target
    const pieCtx = document.getElementById('mutationPieChart') as HTMLCanvasElement;
    if (pieCtx && selectedData.breakdown) {
      this.charts.push(new Chart(pieCtx, {
        type: 'pie',
        data: {
          labels: ['No Indel', 'Substitution', 'In-frame', 'Out-of-frame'],
          datasets: [{
            data: [
              selectedData.breakdown.no_indel || 0, 
              selectedData.breakdown.substitution || 0,
              selectedData.breakdown.in_frame || 0, 
              selectedData.breakdown.out_of_frame || 0
            ],
            backgroundColor: ['#2ecc71', '#3498db', '#e67e22', '#e74c3c']
          }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: `Mutation Distribution (${selectedData.target_id})` } } }
      }));
    }

    // Donut chart -> ONLY selected target
    const donutCtx = document.getElementById('donutChart') as HTMLCanvasElement;
    if (donutCtx && selectedData.summary) {
      this.charts.push(new Chart(donutCtx, {
        type: 'doughnut',
        data: { 
          labels: ['Edited', 'Unedited'], 
          datasets: [{ 
            data: [selectedData.summary.modified || 0, selectedData.summary.unmodified || 0], 
            backgroundColor: ['#ff6384', '#cccccc'] 
          }] 
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: `Editing Efficiency (${selectedData.target_id})` } } }
      }));
    }
  }
}
