import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
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
    avgIndelFreq: 0, 
    avgSubFreq: 0,
    avgInsertionFreq: 0,
    avgDeletionFreq: 0
  };
  private charts: Chart[] = [];

  constructor(
    private fb: FormBuilder,
    private analysisService: AnalysisService,
    private cdr: ChangeDetectorRef 
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
          if (this.useMock) {
            this.handleAnalysisComplete(res);
          } else {
            this.startPolling(res.task_id);
          }
        },
        error: (err) => {
          this.error = err.message;
          this.isLoading = false;
          this.cdr.detectChanges();
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
      },
      error: () => {
        this.error = 'Lost connection to status endpoint.';
        this.isLoading = false;
        this.destroy$.next();
        this.cdr.detectChanges();
      }
    });
  }

  private handleAnalysisComplete(res: AnalysisResponse) {
    console.log('[DEBUG] --- RAW RESPONSE PATH VERIFICATION ---');
    console.log('[DEBUG] Response Object:', res);
    console.log('[DEBUG] results array length:', res.results?.length);
    
    try {
      this.result = res;
      this.calculateMetrics();
      
      this.progress = 100;
      this.progressStage = 'Analysis Complete';
      this.isLoading = false; 
      
      this.addLog('Dashboard updated with results.');
      this.cdr.detectChanges(); 
      
      setTimeout(() => {
        const element = document.getElementById('resultsSection');
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
          console.log('[DEBUG] Scrolled to resultsSection element.');
        }
      }, 300);

      setTimeout(() => {
        try {
          this.createCharts();
        } catch (ce) {
          console.error('[DEBUG] createCharts failed:', ce);
        }
        this.cdr.detectChanges();
        
        // Final sanity check
        console.log('[DEBUG] --- FINAL UI METRICS ---');
        console.log('[DEBUG] metrics.totalReads:', this.metrics.totalReads);
        console.log('[DEBUG] metrics.alignedReads:', this.metrics.alignedReads);
      }, 500);

    } catch (e: any) {
      console.error('[DEBUG] handleAnalysisComplete critical error:', e);
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  private calculateMetrics() {
    if (!this.result || !this.result.results) {
      console.warn('[DEBUG] calculateMetrics returning early: no results array found.');
      return;
    }
    
    let totalReads = 0, alignedReads = 0, totalIndelFreq = 0, totalSubFreq = 0;
    let totalInsFreq = 0, totalDelFreq = 0, count = 0;
    
    this.result.results.forEach((file, fIdx) => {
      console.log(`[DEBUG] Mapping File #${fIdx}: ${file.sample_name || file.fastq_file}`);
      (file.target_results || []).forEach((target, tIdx) => {
        if (target.summary) {
          const s = target.summary;
          // Support both snake_case and camelCase for maximum path resilience
          const tReads = s.total_reads ?? (s as any).totalReads ?? 0;
          const aReads = s.matched_reads ?? s.aligned_reads ?? (s as any).alignedReads ?? 0;
          const iPerc = s.indel_percent ?? s.indel_freq ?? 0;
          const sPerc = s.sub_percent ?? s.sub_freq ?? 0;
          const insPerc = s.insertion_percent ?? 0;
          const delPerc = s.deletion_percent ?? 0;

          console.log(`[DEBUG]   Target #${tIdx} (${target.target_id}): reads=${tReads}, aligned=${aReads}, indel=${iPerc}%`);

          totalReads += tReads;
          alignedReads += aReads;
          totalIndelFreq += iPerc;
          totalSubFreq += sPerc;
          totalInsFreq += insPerc;
          totalDelFreq += delPerc;
          count++;
        }
      });
    });
    
    this.metrics = {
      totalReads, alignedReads,
      avgIndelFreq: count > 0 ? totalIndelFreq / count : 0,
      avgSubFreq: count > 0 ? totalSubFreq / count : 0,
      avgInsertionFreq: count > 0 ? totalInsFreq / count : 0,
      avgDeletionFreq: count > 0 ? totalDelFreq / count : 0
    };
    console.log('[DEBUG] Final Calculated Metrics Object:', this.metrics);
  }

  private destroyCharts() { this.charts.forEach(c => c.destroy()); this.charts = []; }

  private createCharts() {
    if (!this.result || !this.result.results) return;

    const indelCtx = document.getElementById('indelChart') as HTMLCanvasElement;
    if (indelCtx) {
      this.charts.push(new Chart(indelCtx, {
        type: 'bar',
        data: {
          labels: this.result.results.map(f => f.sample_name || f.fastq_file.split('/').pop()),
          datasets: [{
            label: 'Avg Indel %',
            data: this.result.results.map(f => {
              const targets = f.target_results || [];
              return targets.length > 0 ? targets.reduce((acc, t) => acc + (t.summary.indel_percent ?? t.summary.indel_freq ?? 0), 0) / targets.length : 0;
            }),
            backgroundColor: '#36a2eb'
          }]
        },
        options: { responsive: true, maintainAspectRatio: false }
      }));
    }

    const pieCtx = document.getElementById('mutationPieChart') as HTMLCanvasElement;
    if (pieCtx) {
      const globalBreakdown = { wildtype: 0, substitution: 0, insertion: 0, deletion: 0, mixed: 0 };
      this.result.results.forEach(f => {
        (f.target_results || []).forEach(t => {
          if (t.breakdown) {
            globalBreakdown.wildtype += (t.breakdown.wildtype || 0);
            globalBreakdown.substitution += (t.breakdown.substitution || 0);
            globalBreakdown.insertion += (t.breakdown.insertion || 0);
            globalBreakdown.deletion += (t.breakdown.deletion || 0);
            globalBreakdown.mixed += (t.breakdown.mixed || 0);
          }
        });
      });

      this.charts.push(new Chart(pieCtx, {
        type: 'pie',
        data: {
          labels: ['Wildtype', 'Substitution', 'Insertion', 'Deletion', 'Mixed'],
          datasets: [{
            data: [
              globalBreakdown.wildtype, globalBreakdown.substitution,
              globalBreakdown.insertion, globalBreakdown.deletion, globalBreakdown.mixed
            ],
            backgroundColor: ['#2ecc71', '#3498db', '#e67e22', '#e74c3c', '#9b59b6']
          }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: 'Mutation Distribution' } } }
      }));
    }

    const donutCtx = document.getElementById('donutChart') as HTMLCanvasElement;
    if (donutCtx) {
      let mod = 0, unmod = 0;
      this.result.results.forEach(f => (f.target_results || []).forEach(t => { mod += (t.summary.modified || 0); unmod += (t.summary.unmodified || 0); }));
      this.charts.push(new Chart(donutCtx, {
        type: 'doughnut',
        data: { labels: ['Edited', 'Unedited'], datasets: [{ data: [mod, unmod], backgroundColor: ['#ff6384', '#cccccc'] }] },
        options: { responsive: true, maintainAspectRatio: false }
      }));
    }
  }

  get summaryTableData() {
    if (!this.result || !this.result.results) return [];
    return this.result.results.flatMap(f => 
      (f.target_results || []).map(t => ({
        sample: f.sample_name || f.fastq_file.split('/').pop(),
        target: t.target_id,
        total: t.summary.total_reads ?? (t.summary as any).totalReads ?? 0,
        matched: t.summary.matched_reads ?? t.summary.aligned_reads ?? 0,
        indel: t.summary.indel_percent ?? t.summary.indel_freq ?? 0,
        sub: t.summary.sub_percent ?? t.summary.sub_freq ?? 0,
        insertion: t.summary.insertion_percent ?? 0,
        deletion: t.summary.deletion_percent ?? 0,
        efficiency: t.summary.editing_efficiency ?? 0
      }))
    );
  }
}
