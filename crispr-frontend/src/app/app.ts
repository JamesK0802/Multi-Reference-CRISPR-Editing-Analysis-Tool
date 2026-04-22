import { Component, OnInit, OnDestroy, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { AnalysisService, TaskStatus } from './services/analysis.service';
import { AnalysisResponse, AnalysisBreakdown, GeneResult, MultiReferenceResponse,
         BenchmarkRow, BenchmarkResult, SplitPreview, SplitPreviewRow, CutSiteInfo } from './models/analysis.model';
import { Chart } from 'chart.js/auto';
import { Subject, timer, interval } from 'rxjs';
import { takeUntil, switchMap } from 'rxjs/operators';

// ── Progress event shape from backend stage strings ──────────────────────────
interface ProgressInfo {
  fileIndex: number;
  fileTotal: number;
  geneIndex: number;
  geneTotal: number;
  targetIndex: number;
  targetTotal: number;
  message: string;
}

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

  // ── Core state ─────────────────────────────────────────────────────────────
  result: any | null = null;
  error: string | null = null;
  isLoading = false;

  // ── Mode selection ────────────────────────────────────────────────────────
  assignmentMarginThreshold = 3;

  // ── View state ────────────────────────────────────────────────────────────
  showAnalysis = true;
  showBenchmark = false;

  multiFileCount = 0;        // how many FASTQ files were in the response

  // ── Analysis result rendering state ──
  isMultiReference = false;
  genes: GeneResult[] = [];
  selectedGeneIndex = 0;
  ambiguousReadCount = 0;

  // ── Scope state ────────────────────────────────────────────────────────────
  mergedGenes: GeneResult[] = [];
  totalMergedAmbiguous = 0;
  allFileResults: any[] = [];
  selectedScopeIndex = -1; // -1 = All, 0..N = File index

  get currentGene(): GeneResult | null {
    return this.genes.length > 0 ? this.genes[this.selectedGeneIndex] : null;
  }

  selectGene(index: number) {
    this.ngZone.run(() => {
      this.selectedGeneIndex = index;
      this.selectedRowIndex = 0;
      this.destroyCharts();
      this.refreshDashboard();
      this.cdr.detectChanges();
    });
  }

  selectScope(index: number) {
    this.ngZone.run(() => {
      this.selectedScopeIndex = index;
      this.updateVisibleGenes();
      this.cdr.detectChanges();
    });
  }

  private updateVisibleGenes() {
    const prevGeneName = this.currentGene?.gene;

    if (this.selectedScopeIndex === -1) {
      this.genes = this.mergedGenes;
      this.ambiguousReadCount = this.totalMergedAmbiguous;
    } else {
      const fileRes = this.allFileResults[this.selectedScopeIndex];
      const mrd = fileRes.multi_reference_result;
      this.genes = mrd.genes || [];
      this.ambiguousReadCount = mrd.ambiguous_read_count || 0;
    }

    if (prevGeneName) {
      const newIdx = this.genes.findIndex((g: GeneResult) => g.gene === prevGeneName);
      this.selectedGeneIndex = newIdx !== -1 ? newIdx : 0;
    } else {
      this.selectedGeneIndex = 0;
    }

    this.selectedRowIndex = 0;
    this.destroyCharts();
    this.refreshDashboard();
    this.cdr.detectChanges();
  }

  getScopeName(index: number): string {
    if (index === -1) return 'All';
    const path = this.allFileResults[index].fastq_file;
    return path.split('/').pop() || path;
  }

  // ── Progress ───────────────────────────────────────────────────────────────
  progress = 0;
  progressDisplay = 0;          // smoothed display value
  progressStage = '';
  progressInfo: ProgressInfo | null = null;
  private progressAnimId: any = null;
  debugLogs: string[] = [];
  private destroy$ = new Subject<void>();

  // ── Metrics ────────────────────────────────────────────────────────────────
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

  ngOnInit() { this.initForm(); }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.progressAnimId) clearInterval(this.progressAnimId);
  }

  addLog(msg: string) {
    const ts = new Date().toLocaleTimeString();
    this.debugLogs.unshift(`[${ts}] ${msg}`);
    if (this.debugLogs.length > 25) this.debugLogs.pop();
    this.cdr.detectChanges();
  }

  toggleAnalysis() {
    this.showAnalysis = !this.showAnalysis;
    this.cdr.detectChanges();
  }

  toggleBenchmark() {
    this.showBenchmark = !this.showBenchmark;
    this.cdr.detectChanges();
  }

  // ── Smooth progress animation ──────────────────────────────────────────────
  private setProgress(target: number, stage: string) {
    this.ngZone.run(() => {
      this.progress = target;
      this.progressStage = stage;
      if (this.progressAnimId) {
        clearInterval(this.progressAnimId);
        this.progressAnimId = null;
      }
      this.progressAnimId = setInterval(() => {
        this.ngZone.run(() => {
          const diff = this.progress - this.progressDisplay;
          if (Math.abs(diff) < 0.5) {
            this.progressDisplay = this.progress;
            if (this.progressAnimId) {
              clearInterval(this.progressAnimId);
              this.progressAnimId = null;
            }
          } else {
            this.progressDisplay = Math.round(this.progressDisplay + diff * 0.2);
          }
          this.cdr.detectChanges();
        });
      }, 60);
      this.cdr.detectChanges();
    });
  }

  // Parse structured progress stage string from backend
  private parseProgressStage(stage: string, percent: number) {
    // The backend sends strings like:
    //   "Processing sample 1 of 2 (Multi-Reference)"
    //   "Gene 2/4 – Target 1/3"
    // We parse what we can and build a ProgressInfo
    const info: ProgressInfo = {
      fileIndex: 0, fileTotal: 0,
      geneIndex: 0, geneTotal: 0,
      targetIndex: 0, targetTotal: 0,
      message: stage
    };
    const fileMatch = stage.match(/sample\s+(\d+)\s+of\s+(\d+)/i);
    if (fileMatch) {
      info.fileIndex = parseInt(fileMatch[1]);
      info.fileTotal = parseInt(fileMatch[2]);
    }
    this.progressInfo = info;
    this.setProgress(percent, stage);
  }

  // ── Form ───────────────────────────────────────────────────────────────────
  private initForm() {
    this.analysisForm = this.fb.group({
      interestRegion: [90, [Validators.required, Validators.min(60), Validators.max(120)]],
      phredThreshold: [10],
      indelThreshold: [1.0],
      genes: this.fb.array([this.createGeneGroup()])
    });
  }

  // Single-ref target
  private createTargetGroup(): FormGroup {
    return this.fb.group({
      target_id: ['', Validators.required],
      gRNA: ['', Validators.required],
      reference_sequence: ['', Validators.required]
    });
  }

  // Multi-ref gene block (has its own reference + nested target list)
  private createGeneGroup(): FormGroup {
    return this.fb.group({
      gene_name: [''],
      gene_reference: ['', Validators.required],
      geneTargets: this.fb.array([this.createGeneTargetGroup()])
    });
  }

  private createGeneTargetGroup(): FormGroup {
    return this.fb.group({
      target_id: [''],
      gRNA: ['', Validators.required]
    });
  }

  // ── Multi-ref gene helpers (Unified) ──────────────────────────────────────
  get geneBlocks() { return this.analysisForm.get('genes') as FormArray; }
  addGene() {
    this.ngZone.run(() => {
      this.geneBlocks.push(this.createGeneGroup());
      this.cdr.detectChanges();
    });
  }

  removeGene(i: number) {
    this.ngZone.run(() => {
      if (this.geneBlocks.length > 1) {
        this.geneBlocks.removeAt(i);
        this.cdr.detectChanges();
      }
    });
  }

  getGeneTargets(geneIndex: number): FormArray {
    return this.geneBlocks.at(geneIndex).get('geneTargets') as FormArray;
  }

  addGeneTarget(geneIndex: number) {
    this.ngZone.run(() => {
      this.getGeneTargets(geneIndex).push(this.createGeneTargetGroup());
      this.cdr.detectChanges();
    });
  }

  removeGeneTarget(geneIndex: number, targetIndex: number) {
    this.ngZone.run(() => {
      const arr = this.getGeneTargets(geneIndex);
      if (arr.length > 1) {
        arr.removeAt(targetIndex);
        this.cdr.detectChanges();
      }
    });
  }

  // ── File handling ──────────────────────────────────────────────────────────
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
  removeFile(i: number) { this.selectedFiles.splice(i, 1); }

  toggleMockMode() {
    this.addLog(`Mock mode is no longer supported.`);
  }

  // ── Run analysis ───────────────────────────────────────────────────────────
  runAnalysis() {
    try {
      const formInvalid = this.analysisForm.get('genes')?.invalid || this.analysisForm.get('interestRegion')?.invalid;

      if (formInvalid || this.selectedFiles.length === 0) {
        this.error = 'Validation failed. Check files and parameters.';
        this.cdr.detectChanges();
        return;
      }

      this.debugLogs = [];
      this.error = null;
      this.result = null;
      this.genes = [];
      this.isMultiReference = false;
      this.destroyCharts();
      this.isLoading = true;
      this.progressDisplay = 0;
      this.setProgress(5, 'Uploading files…');
      this.cdr.detectChanges();

      const rawValue = this.analysisForm.value;
      const formData = new FormData();

      if (this.selectedFiles.length > 0) {
        this.selectedFiles.forEach(f => formData.append('files', f, f.name));
      }

      formData.append('data_type', 'single-end');
      formData.append('interest_region', (rawValue.interestRegion || 90).toString());
      formData.append('phred_threshold', (rawValue.phredThreshold || 10).toString());
      formData.append('indel_threshold', (rawValue.indelThreshold || 1.0).toString());
      formData.append('is_multi_reference', 'true');
      formData.append('assignment_margin_threshold', (this.assignmentMarginThreshold / 100).toString());

      // Unified gene payload
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
      this.addLog(`Unified Analysis: ${genesPayload.length} gene(s), ${genesPayload.reduce((s: number, g: any) => s + g.targets.length, 0)} total target(s)`);

      this.analysisService.runAnalysis(formData).subscribe({
        next: (res: any) => {
          this.ngZone.run(() => {
              this.setProgress(10, 'Request accepted – queued…');
              this.startPolling(res.task_id);
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

  // ── Polling ────────────────────────────────────────────────────────────────
  private startPolling(taskId: string) {
    timer(0, 1200).pipe(
      takeUntil(this.destroy$),
      switchMap(() => this.analysisService.getTaskStatus(taskId))
    ).subscribe({
      next: (status: TaskStatus) => {
        this.ngZone.run(() => {
          this.parseProgressStage(status.stage || '', status.progress || 0);
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

  // ── Handle completed response ──────────────────────────────────────────────
  private handleAnalysisComplete(res: any) {
    this.ngZone.run(() => {
      console.log('[MULTIREF DEBUG] ======= RAW BACKEND RESPONSE =======');
      console.log(JSON.stringify(res, null, 2));
      console.log('[MULTIREF DEBUG] metadata:', res?.metadata);

      try {
        const metaFlag = res?.metadata?.is_multi_reference === true;
        // Collect genes across ALL file results (multi-file support)
        const allResults: any[] = res?.results ?? [];
        console.log('[MULTIREF DEBUG] result count:', allResults.length);

        // Unified result handling
        this.isMultiReference = true;
        this.result = null;
        this.multiFileCount = allResults.length;

        // Merge gene results across files: same gene name → accumulate assigned_read_count
        const geneMap = new Map<string, GeneResult>();
        let totalAmbiguous = 0;

        for (const fileResult of allResults) {
          const mrd: MultiReferenceResponse | undefined = fileResult?.multi_reference_result;
          if (!mrd) continue;
          totalAmbiguous += mrd.ambiguous_read_count ?? 0;
          for (const geneRes of (mrd.genes ?? [])) {
            if (geneMap.has(geneRes.gene)) {
              const existing = geneMap.get(geneRes.gene)!;
              
              // CRITICAL BUG FIX: If the new file result actually has analyzed reads for this gene,
              // and the current 'existing' one is empty (or has fewer reads), update the analysis_result.
              const newTotal = geneRes.analysis_result?.targets?.[0]?.summary?.total_reads ?? 0;
              const curTotal = existing.analysis_result?.targets?.[0]?.summary?.total_reads ?? 0;
              
              if (newTotal > curTotal) {
                existing.analysis_result = geneRes.analysis_result;
              }
              
              existing.assigned_read_count += geneRes.assigned_read_count;
            } else {
              // Deep copy to prevent reference issues
              geneMap.set(geneRes.gene, JSON.parse(JSON.stringify(geneRes)));
            }
          }
        }

        this.mergedGenes = Array.from(geneMap.values());
        this.totalMergedAmbiguous = totalAmbiguous;
        this.allFileResults = allResults;
        this.selectedScopeIndex = -1;

        this.updateVisibleGenes();
        this.addLog(`Analysis complete: ${this.mergedGenes.length} gene(s) across ${this.multiFileCount} sample(s)`);

        this.refreshDashboard();
        this.setProgress(100, 'Analysis Complete ✓');
        this.isLoading = false;
        this.cdr.detectChanges();

        setTimeout(() => {
          const el = document.getElementById('resultsSection');
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 300);
        setTimeout(() => this.cdr.detectChanges(), 500);

      } catch (e: any) {
        console.error('[MULTIREF DEBUG] handleAnalysisComplete error:', e);
        this.error = String(e);
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  // ── Table / Dashboard ──────────────────────────────────────────────────────
  selectedRowIndex = 0;

  get flatTargets() {
    if (!this.currentGene) return [];
    return (this.currentGene.analysis_result.targets || []).map(t => ({
      file: { fastq_file: '', sample_name: this.currentGene!.gene, target_results: [] as any[] },
      target: t
    }));
  }

  get summaryTableData() {
    return this.flatTargets.map((item, index) => ({
      index,
      sample: this.currentGene?.gene ?? 'Gene',
      target: item.target.target_id,
      total: item.target.summary?.total_reads ?? 0,
      matched: item.target.summary?.matched_reads ?? 0,
      outOfFrame: item.target.summary?.out_of_frame_pct ?? 0,
      inFrame: item.target.summary?.in_frame_pct ?? 0,
      noIndel: item.target.summary?.no_indel_pct ?? 0,
      substitution: item.target.summary?.substitution_pct ?? 0
    }));
  }

  selectRow(i: number) {
    this.selectedRowIndex = i;
    this.refreshDashboard();
  }

  selectedTarget: any = null;

  private refreshDashboard() {
    this.ngZone.run(() => {
      const gene = this.currentGene;
      if (!gene?.analysis_result?.targets?.length) return;
      const targets = gene.analysis_result.targets;
      const idx = Math.min(this.selectedRowIndex, targets.length - 1);
      this.selectedTarget = targets[idx];

      if (!this.selectedTarget) {
        this.cdr.detectChanges();
        return;
      }

      this.metrics = {
        totalReads: this.selectedTarget.summary?.total_reads ?? 0,
        alignedReads: this.selectedTarget.summary?.matched_reads ?? 0,
        avgOutOfFrame: this.selectedTarget.summary?.out_of_frame_pct ?? 0,
        avgInFrame: this.selectedTarget.summary?.in_frame_pct ?? 0,
        avgNoIndel: this.selectedTarget.summary?.no_indel_pct ?? 0,
        avgSubstitution: this.selectedTarget.summary?.substitution_pct ?? 0,
      };

      this.cdr.detectChanges();

      // Ensure DOM has settled before looking for chart canvases/annotation scrolling
      setTimeout(() => {
        this.ngZone.run(() => {
          this.updateChartsForSelected();
          this.centerAnnotation();
          this.cdr.detectChanges();
          // Final check to ensure UI reflects the latest state
          this.cdr.markForCheck();
        });
      }, 64); // Slightly longer than one frame to ensure stability
    });
  }

  private centerAnnotation() {
    // We target the unified-anno-container which has overflow-x: auto
    const container = document.querySelector('.unified-anno-container');
    if (!container || !this.selectedTarget) return;

    // Grid details from CSS: .base-box width is 13px
    const cutIdx = this.selectedTarget.cut_site_index || 0;
    const stickyLeftWidth = 150; // .sticky-left width
    const baseWidth = 13;
    const padding = 15; // .seq-center padding-left

    // Approximate x-position of the cut site in the scrollable content
    const xPos = stickyLeftWidth + (cutIdx * baseWidth) + padding;
    
    // Target scroll position to keep cut site in the center of the viewport
    const viewportWidth = container.clientWidth;
    const targetScroll = xPos - (viewportWidth / 2);

    container.scrollLeft = Math.max(0, targetScroll);
  }

  // ── Charts ─────────────────────────────────────────────────────────────────
  private destroyCharts() {
    this.charts.forEach(c => c.destroy());
    this.charts = [];
  }

  private updateChartsForSelected() {
    this.destroyCharts();

    const flat = this.flatTargets;
    if (!flat.length || !this.selectedTarget) return;

    // Safe fallback if selectedRowIndex is out of range
    const safeIdx = Math.min(this.selectedRowIndex, flat.length - 1);
    const selectedData = flat[safeIdx].target;

    // Bar chart — all targets in current view
    const indelCtx = document.getElementById('indelChart') as HTMLCanvasElement;
    if (indelCtx) {
      this.charts.push(new Chart(indelCtx, {
        type: 'bar',
        data: {
          labels: flat.map(item =>
            this.isMultiReference
              ? item.target.target_id
              : `${item.file.sample_name || item.file.fastq_file.split('/').pop()} (${item.target.target_id})`
          ),
          datasets: [
            {
              label: 'Out-of-frame %',
              data: flat.map(item => item.target.summary?.out_of_frame_pct ?? 0),
              backgroundColor: '#e74c3c'
            },
            {
              label: 'In-frame %',
              data: flat.map(item => item.target.summary?.in_frame_pct ?? 0),
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

    // Pie chart
    const pieCtx = document.getElementById('mutationPieChart') as HTMLCanvasElement;
    if (pieCtx && selectedData?.breakdown) {
      this.charts.push(new Chart(pieCtx, {
        type: 'pie',
        data: {
          labels: ['No Indel', 'Substitution', 'In-frame', 'Out-of-frame'],
          datasets: [{
            data: [
              selectedData.breakdown.no_indel ?? 0,
              selectedData.breakdown.substitution ?? 0,
              selectedData.breakdown.in_frame ?? 0,
              selectedData.breakdown.out_of_frame ?? 0
            ],
            backgroundColor: ['#2ecc71', '#3498db', '#e67e22', '#e74c3c']
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { title: { display: true, text: `Mutation Distribution (${selectedData.target_id})` } }
        }
      }));
    }

    // Donut chart
    const donutCtx = document.getElementById('donutChart') as HTMLCanvasElement;
    if (donutCtx && selectedData?.summary) {
      this.charts.push(new Chart(donutCtx, {
        type: 'doughnut',
        data: {
          labels: ['Edited', 'Unedited'],
          datasets: [{
            data: [selectedData.summary.modified ?? 0, selectedData.summary.unmodified ?? 0],
            backgroundColor: ['#ff6384', '#cccccc']
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { title: { display: true, text: `Editing Efficiency (${selectedData.target_id})` } }
        }
      }));
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BENCHMARK TAB STATE
  // ══════════════════════════════════════════════════════════════════════════

  /** Which top-level tab is active: 'analysis' | 'benchmark' */
  activeTab: 'analysis' | 'benchmark' = 'analysis';

  // ── Benchmark Parameters ──────────────────────────────────────────────────
  benchPhred  = 10;
  benchWindow = 90;
  benchMargin = 3;

  // ── Benchmark Dataset rows ────────────────────────────────────────────────
  benchRows: BenchmarkRow[] = [this.emptyBenchRow()];

  emptyBenchRow(): BenchmarkRow {
    return { file: null, geneName: '', targetName: '', referenceSequence: '', grnaSequence: '' };
  }

  addBenchRow()    { this.benchRows.push(this.emptyBenchRow()); }
  removeBenchRow(i: number) { if (this.benchRows.length > 1) this.benchRows.splice(i, 1); }

  onBenchFileSelected(event: any, i: number) {
    const f = event.target.files?.[0];
    if (f && f.name.match(/\.(fastq|fq)$/i)) this.benchRows[i].file = f;
  }

  // ── Benchmark State ───────────────────────────────────────────────────────
  benchIsLoading  = false;
  benchProgress   = 0;
  benchProgressDisplay = 0;
  benchStage      = '';
  benchError: string | null = null;

  splitPreview: SplitPreview | null = null;
  trainResult:  BenchmarkResult | null = null;
  testResult:   BenchmarkResult | null = null;
  private benchDestroy$ = new Subject<void>();
  private benchProgressAnimId: any = null;

  private setBenchProgress(target: number, stage: string) {
    this.ngZone.run(() => {
      this.benchProgress = target;
      this.benchStage    = stage;
      if (this.benchProgressAnimId) {
        clearInterval(this.benchProgressAnimId);
        this.benchProgressAnimId = null;
      }
      this.benchProgressAnimId = setInterval(() => {
        this.ngZone.run(() => {
          const diff = this.benchProgress - this.benchProgressDisplay;
          if (Math.abs(diff) < 0.3) {
            this.benchProgressDisplay = this.benchProgress;
            if (this.benchProgressAnimId) {
              clearInterval(this.benchProgressAnimId);
              this.benchProgressAnimId = null;
            }
          } else {
            this.benchProgressDisplay += diff * 0.25;
            // Round for cleaner UI if needed, but not strictly necessary for percent
          }
          this.cdr.detectChanges();
          this.cdr.markForCheck();
        });
      }, 64);
      this.cdr.detectChanges();
    });
  }

  private validateBenchRows(): boolean {
    for (const r of this.benchRows) {
      if (!r.file || !r.referenceSequence.trim() || !r.grnaSequence.trim()) {
        this.benchError = 'All rows must have a FASTQ file, reference sequence, and gRNA.';
        this.cdr.detectChanges();
        return false;
      }
    }
    this.benchError = null;
    return true;
  }

  private buildBenchFormData(subset?: string): FormData {
    const fd = new FormData();
    const meta: any[] = [];
    this.benchRows.forEach((r, idx) => {
      fd.append('files', r.file!, r.file!.name);
      meta.push({ 
        gene: r.geneName?.trim() || `G${idx + 1}`, 
        target: r.targetName?.trim() || `T${idx + 1}`,
        reference: r.referenceSequence, 
        grna: r.grnaSequence 
      });
    });
    fd.append('dataset', JSON.stringify(meta));
    fd.append('phred',   this.benchPhred.toString());
    fd.append('window',  this.benchWindow.toString());
    fd.append('margin',  (this.benchMargin / 100).toString());
    if (subset) fd.append('subset', subset);
    return fd;
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  buildSplitPreview() {
    if (!this.validateBenchRows()) return;
    this.splitPreview      = null;
    this.benchError        = null;
    this.benchIsLoading    = true;
    this.benchProgressDisplay = 0;
    this.setBenchProgress(10, 'Computing split preview…');
    this.cdr.detectChanges();

    const fd = this.buildBenchFormData();
    this.analysisService.benchmarkSplitPreview(fd).subscribe({
      next: (res) => this.ngZone.run(() => {
        this.splitPreview         = res;
        this.benchIsLoading       = false;
        this.benchProgressDisplay = 100;
        this.setBenchProgress(100, 'Split preview ready');
        this.cdr.detectChanges();
      }),
      error: (err) => this.ngZone.run(() => {
        this.benchError           = err?.error?.detail || err?.message || 'Split preview failed.';
        this.benchIsLoading       = false;
        this.benchProgressDisplay = 0;
        this.setBenchProgress(0, '');
        this.cdr.detectChanges();
      })
    });
  }

  runTrainBenchmark() { this.runBench('train'); }
  runTestBenchmark()  { this.runBench('test');  }

  private runBench(subset: 'train' | 'test') {
    if (!this.validateBenchRows()) return;
    this.benchError           = null;
    this.benchIsLoading       = true;
    this.benchProgressDisplay = 0;
    this.benchDestroy$.next();
    this.setBenchProgress(5, `Starting ${subset} benchmark…`);
    this.cdr.detectChanges();

    const fd = this.buildBenchFormData(subset);
    this.analysisService.runBenchmark(fd).subscribe({
      next: (res) => this.ngZone.run(() => {
        this.setBenchProgress(10, 'Queued — polling for results…');
        this.startBenchPolling(res.task_id, subset);
      }),
      error: (err) => this.ngZone.run(() => {
        this.benchError           = err?.error?.detail || err?.message || 'Failed to start benchmark.';
        this.benchIsLoading       = false;
        this.benchProgressDisplay = 0;
        this.cdr.detectChanges();
      })
    });
  }

  private startBenchPolling(taskId: string, subset: 'train' | 'test') {
    timer(0, 1200).pipe(
      takeUntil(this.benchDestroy$),
      switchMap(() => this.analysisService.getTaskStatus(taskId))
    ).subscribe({
      next: (status) => this.ngZone.run(() => {
        this.setBenchProgress(status.progress || 0, status.stage || '');
        if (status.status === 'failed') {
          this.benchError           = status.error || 'Benchmark failed.';
          this.benchIsLoading       = false;
          this.benchProgressDisplay = 0;
          this.benchDestroy$.next();
        } else if (status.progress === 100 && status.result) {
          if (subset === 'train') this.trainResult = status.result;
          else                    this.testResult  = status.result;
          this.benchIsLoading       = false;
          this.benchProgressDisplay = 100;
          this.benchDestroy$.next();
        }
        this.cdr.detectChanges();
      }),
      error: () => this.ngZone.run(() => {
        this.benchError           = 'Lost connection to status endpoint.';
        this.benchIsLoading       = false;
        this.benchProgressDisplay = 0;
        this.benchDestroy$.next();
        this.cdr.detectChanges();
      })
    });
  }
}
