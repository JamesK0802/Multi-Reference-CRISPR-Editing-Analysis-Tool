import { Injectable, NgZone } from '@angular/core';
import { FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { BehaviorSubject, Subject, timer } from 'rxjs';
import { takeUntil, switchMap } from 'rxjs/operators';
import { AnalysisService, TaskStatus } from './analysis.service';
import { ExcelExportService, ExportParams, ScopeData } from './excel-export.service';
import { GeneResult, MultiReferenceResponse, BenchmarkRow, BenchmarkResult, SplitPreview } from '../models/analysis.model';
import { Chart } from 'chart.js/auto';

interface ProgressInfo {
  fileIndex: number; fileTotal: number;
  geneIndex: number; geneTotal: number;
  targetIndex: number; targetTotal: number;
  message: string;
}

/** Independent result data container */
export interface ResultSlot {
  genes: GeneResult[];
  mergedGenes: GeneResult[];
  selectedGeneIndex: number;
  ambiguousReadCount: number;
  totalMergedAmbiguous: number;
  totalRawReads: number;
  totalMergedRawReads: number;
  totalPhredPassed: number;
  totalMergedPhredPassed: number;
  totalAnchorMatched: number;
  totalMergedAnchorMatched: number;
  allFileResults: any[];
  lastRunParams: ExportParams | null;
  selectedScopeIndex: number;
  isMultiReference: boolean;
  multiFileCount: number;
  selectedRowIndex: number;
  selectedTarget: any;
  metrics: { totalReads: number; alignedReads: number; avgOutOfFrame: number; avgInFrame: number; avgNoIndel: number; avgSubstitution: number; };
  isLoading: boolean;
  error: string | null;
  result: any | null;
}

function emptySlot(): ResultSlot {
  return {
    genes: [], mergedGenes: [], selectedGeneIndex: 0, ambiguousReadCount: 0,
    totalMergedAmbiguous: 0, totalRawReads: 0, totalMergedRawReads: 0,
    totalPhredPassed: 0, totalMergedPhredPassed: 0,
    totalAnchorMatched: 0, totalMergedAnchorMatched: 0,
    allFileResults: [], lastRunParams: null, selectedScopeIndex: -1,
    isMultiReference: false, multiFileCount: 0, selectedRowIndex: 0, selectedTarget: null,
    metrics: { totalReads: 0, alignedReads: 0, avgOutOfFrame: 0, avgInFrame: 0, avgNoIndel: 0, avgSubstitution: 0 },
    isLoading: false, error: null, result: null
  };
}

@Injectable({ providedIn: 'root' })
export class AppStateService {
  analysisForm!: FormGroup;
  selectedFiles: File[] = [];
  isDragging = false;

  // ── Separate result slots ──────────────────────────────────────────────────
  analysisSlot: ResultSlot = emptySlot();
  viewerSlot: ResultSlot = emptySlot();
  activeMode: 'analysis' | 'viewer' = 'analysis';

  // ── Active display state (points to the active slot) ──
  get slot(): ResultSlot {
    return this.activeMode === 'analysis' ? this.analysisSlot : this.viewerSlot;
  }

  // ── Progress (Reactive) ────────────────────────────────────────────────────
  progress$ = new BehaviorSubject<number>(0);
  progressDisplay$ = new BehaviorSubject<number>(0);
  progressStage$ = new BehaviorSubject<string>('');

  progressInfo: ProgressInfo | null = null;
  private progressAnimId: any = null;
  debugLogs: string[] = [];
  private destroy$ = new Subject<void>();
  private charts: Chart[] = [];

  // ── Benchmark State ───────────────────────────────────────────────────────
  benchPhred = 10; benchWindow = 90; benchMargin = 3;
  benchRows: BenchmarkRow[] = [{ file: null, geneName: '', targetName: '', referenceSequence: '', grnaSequence: '' }];
  benchIsLoading = false;
  benchProgress$ = new BehaviorSubject<number>(0);
  benchProgressDisplay$ = new BehaviorSubject<number>(0);
  benchStage$ = new BehaviorSubject<string>('');
  benchError: string | null = null;
  splitPreview: SplitPreview | null = null;
  trainResult: BenchmarkResult | null = null;
  testResult: BenchmarkResult | null = null;
  private benchDestroy$ = new Subject<void>();
  private benchProgressAnimId: any = null;
  resultsUpdated$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private analysisService: AnalysisService,
    private excelExportService: ExcelExportService,
    public ngZone: NgZone
  ) { this.initForm(); }

  // ── Slot activation ────────────────────────────────────────────────────────
  activateSlot(mode: 'analysis' | 'viewer') {
    this.activeMode = mode;
  }

  // ── Convenience getters (read from active slot) ────────────────────────────
  get genes() { return this.slot.genes; }
  set genes(v) { this.slot.genes = v; }
  get mergedGenes() { return this.slot.mergedGenes; }
  set mergedGenes(v) { this.slot.mergedGenes = v; }
  get selectedGeneIndex() { return this.slot.selectedGeneIndex; }
  set selectedGeneIndex(v) { this.slot.selectedGeneIndex = v; }
  get ambiguousReadCount() { return this.slot.ambiguousReadCount; }
  set ambiguousReadCount(v) { this.slot.ambiguousReadCount = v; }
  get totalMergedAmbiguous() { return this.slot.totalMergedAmbiguous; }
  set totalMergedAmbiguous(v) { this.slot.totalMergedAmbiguous = v; }
  get totalRawReads() { return this.slot.totalRawReads; }
  set totalRawReads(v) { this.slot.totalRawReads = v; }
  get totalMergedRawReads() { return this.slot.totalMergedRawReads; }
  set totalMergedRawReads(v) { this.slot.totalMergedRawReads = v; }
  get totalPhredPassed() { return this.slot.totalPhredPassed; }
  set totalPhredPassed(v) { this.slot.totalPhredPassed = v; }
  get totalMergedPhredPassed() { return this.slot.totalMergedPhredPassed; }
  set totalMergedPhredPassed(v) { this.slot.totalMergedPhredPassed = v; }
  get totalAnchorMatched() { return this.slot.totalAnchorMatched; }
  set totalAnchorMatched(v) { this.slot.totalAnchorMatched = v; }
  get totalMergedAnchorMatched() { return this.slot.totalMergedAnchorMatched; }
  set totalMergedAnchorMatched(v) { this.slot.totalMergedAnchorMatched = v; }
  get allFileResults() { return this.slot.allFileResults; }
  set allFileResults(v) { this.slot.allFileResults = v; }
  get lastRunParams() { return this.slot.lastRunParams; }
  set lastRunParams(v) { this.slot.lastRunParams = v; }
  get selectedScopeIndex() { return this.slot.selectedScopeIndex; }
  set selectedScopeIndex(v) { this.slot.selectedScopeIndex = v; }
  get isMultiReference() { return this.slot.isMultiReference; }
  set isMultiReference(v) { this.slot.isMultiReference = v; }
  get multiFileCount() { return this.slot.multiFileCount; }
  set multiFileCount(v) { this.slot.multiFileCount = v; }
  get selectedRowIndex() { return this.slot.selectedRowIndex; }
  set selectedRowIndex(v) { this.slot.selectedRowIndex = v; }
  get selectedTarget() { return this.slot.selectedTarget; }
  set selectedTarget(v) { this.slot.selectedTarget = v; }
  get metrics() { return this.slot.metrics; }
  set metrics(v) { this.slot.metrics = v; }
  get isLoading() { return this.slot.isLoading; }
  set isLoading(v) { this.slot.isLoading = v; }
  get error() { return this.slot.error; }
  set error(v) { this.slot.error = v; }
  get result() { return this.slot.result; }
  set result(v) { this.slot.result = v; }

  get currentGene(): GeneResult | null {
    return this.genes.length > 0 ? this.genes[this.selectedGeneIndex] : null;
  }
  get normalGenes(): GeneResult[] { return this.genes.filter(g => !g.is_ambiguous_derived && !g.is_rescued_derived); }
  get rescuedGenes(): GeneResult[] { return this.genes.filter(g => g.is_rescued_derived); }
  get ambiguousGenes(): GeneResult[] { return this.genes.filter(g => g.is_ambiguous_derived); }

  // ── Form ───────────────────────────────────────────────────────────────────
  private initForm() {
    this.analysisForm = this.fb.group({
      interestRegion: [90, [Validators.required, Validators.min(10), Validators.max(500)]],
      phredThreshold: [20, [Validators.required, Validators.min(1), Validators.max(1000)]],
      rescueThreshold: [20, [Validators.required, Validators.min(1), Validators.max(1000)]],
      marginPercent: [10, [Validators.required, Validators.min(0), Validators.max(100)]],
      indelPercent: [2, [Validators.required, Validators.min(0), Validators.max(100)]],
      analyzeAmbiguous: [false], rescueAmbiguous: [false],
      genes: this.fb.array([this.createGeneGroup()])
    });
    this.analysisForm.get('analyzeAmbiguous')?.valueChanges.subscribe(val => {
      if (!val) this.analysisForm.get('rescueAmbiguous')?.setValue(false, { emitEvent: false });
    });
  }
  private createGeneGroup(): FormGroup {
    return this.fb.group({ gene_name: [''], gene_reference: ['', Validators.required], geneTargets: this.fb.array([this.createGeneTargetGroup()]) });
  }
  private createGeneTargetGroup(): FormGroup {
    return this.fb.group({ target_id: [''], gRNA: ['', Validators.required] });
  }
  get geneBlocks() { return this.analysisForm.get('genes') as FormArray; }
  addGene() { this.geneBlocks.push(this.createGeneGroup()); }
  removeGene(i: number) { if (this.geneBlocks.length > 1) this.geneBlocks.removeAt(i); }
  getGeneTargets(gi: number): FormArray { return this.geneBlocks.at(gi).get('geneTargets') as FormArray; }
  addGeneTarget(gi: number) { this.getGeneTargets(gi).push(this.createGeneTargetGroup()); }
  removeGeneTarget(gi: number, ti: number) { const a = this.getGeneTargets(gi); if (a.length > 1) a.removeAt(ti); }

  // ── Logging ────────────────────────────────────────────────────────────────
  addLog(msg: string) {
    const ts = new Date().toLocaleTimeString();
    this.debugLogs.unshift(`[${ts}] ${msg}`);
    if (this.debugLogs.length > 25) this.debugLogs.pop();
  }

  // ── Progress ───────────────────────────────────────────────────────────────
  setProgress(target: number, stage: string) {
    this.ngZone.run(() => {
      this.progress$.next(target);
      this.progressStage$.next(stage);

      if (this.progressAnimId) { clearInterval(this.progressAnimId); this.progressAnimId = null; }

      this.progressAnimId = setInterval(() => {
        this.ngZone.run(() => {
          const current = this.progressDisplay$.value;
          const goal = this.progress$.value;
          const diff = goal - current;

          if (Math.abs(diff) < 0.5) {
            this.progressDisplay$.next(goal);
            if (this.progressAnimId) { clearInterval(this.progressAnimId); this.progressAnimId = null; }
          } else {
            this.progressDisplay$.next(current + diff * 0.2);
          }
        });
      }, 60);
    });
  }

  setBenchProgress(target: number, stage: string) {
    this.ngZone.run(() => {
      this.benchProgress$.next(target);
      this.benchStage$.next(stage);

      if (this.benchProgressAnimId) { clearInterval(this.benchProgressAnimId); this.benchProgressAnimId = null; }

      this.benchProgressAnimId = setInterval(() => {
        this.ngZone.run(() => {
          const current = this.benchProgressDisplay$.value;
          const goal = this.benchProgress$.value;
          const diff = goal - current;

          if (Math.abs(diff) < 0.3) {
            this.benchProgressDisplay$.next(goal);
            if (this.benchProgressAnimId) { clearInterval(this.benchProgressAnimId); this.benchProgressAnimId = null; }
          } else {
            this.benchProgressDisplay$.next(current + diff * 0.25);
          }
        });
      }, 64);
    });
  }

  // ── Analysis execution ─────────────────────────────────────────────────────
  runAnalysis(formData: FormData) {
    this.activateSlot('analysis');
    this.isLoading = true;
    this.setProgress(5, 'Uploading files…');
    this.analysisService.runAnalysis(formData).subscribe({
      next: (res: any) => { this.ngZone.run(() => { this.setProgress(10, 'Request accepted – queued…'); this.startPolling(res.task_id); }); },
      error: (err) => { this.ngZone.run(() => { this.error = err.message; this.isLoading = false; }); }
    });
  }

  private startPolling(taskId: string) {
    timer(0, 1200).pipe(takeUntil(this.destroy$), switchMap(() => this.analysisService.getTaskStatus(taskId))).subscribe({
      next: (status: TaskStatus) => {
        this.ngZone.run(() => {
          this.parseProgressStage(status.stage || '', status.progress || 0);
          if (status.status === 'failed') { this.error = status.error || 'Backend analysis failed.'; this.isLoading = false; this.destroy$.next(); }
          else if (status.progress === 100 && status.result) {
            this.handleAnalysisComplete(status.result, () => { this.setProgress(100, 'Analysis Complete ✓'); setTimeout(() => { this.ngZone.run(() => { this.isLoading = false; }); }, 800); });
            this.destroy$.next();
          }
        });
      },
      error: () => { this.ngZone.run(() => { this.error = 'Lost connection to status endpoint.'; this.isLoading = false; this.destroy$.next(); }); }
    });
  }

  private parseProgressStage(stage: string, percent: number) {
    const info: ProgressInfo = { fileIndex: 0, fileTotal: 0, geneIndex: 0, geneTotal: 0, targetIndex: 0, targetTotal: 0, message: stage };
    const m = stage.match(/sample\s+(\d+)\s+of\s+(\d+)/i);
    if (m) { info.fileIndex = parseInt(m[1]); info.fileTotal = parseInt(m[2]); }
    this.progressInfo = info; this.setProgress(percent, stage);
  }

  // ── Handle completed response ──────────────────────────────────────────────
  handleAnalysisComplete(res: any, callback?: () => void) {
    const allResults: any[] = res?.results ?? [];
    this.isMultiReference = true; this.result = null; this.multiFileCount = allResults.length;
    const geneMap = new Map<string, GeneResult>();
    let totalAmb = 0, totalRaw = 0, totalPhred = 0, totalAnchor = 0;
    for (const fileResult of allResults) {
      const mrd: MultiReferenceResponse | undefined = fileResult?.multi_reference_result;
      if (!mrd) continue;
      totalAmb += mrd.ambiguous_read_count ?? 0;
      totalRaw += mrd.debug?.total_reads_parsed ?? 0;
      totalPhred += mrd.debug?.phred_passed_count ?? 0;
      totalAnchor += mrd.debug?.anchor_matched_count ?? 0;
      for (const geneRes of (mrd.genes ?? [])) {
        if (geneMap.has(geneRes.gene)) {
          const ex = geneMap.get(geneRes.gene)!;
          ex.assigned_read_count += geneRes.assigned_read_count;
          if (ex.analysis_result?.targets && geneRes.analysis_result?.targets) {
            ex.analysis_result.targets.forEach((extT: any, tidx: number) => {
              const newT = geneRes.analysis_result.targets[tidx]; if (!newT) return;
              const s1 = extT.summary, s2 = newT.summary;
              const b1 = extT.breakdown || { out_of_frame: 0, in_frame: 0, no_indel: 0, substitution: 0 };
              const b2 = newT.breakdown || { out_of_frame: 0, in_frame: 0, no_indel: 0, substitution: 0 };
              b1.out_of_frame += b2.out_of_frame || 0; b1.in_frame += b2.in_frame || 0;
              b1.no_indel += b2.no_indel || 0; b1.substitution += b2.substitution || 0;
              extT.breakdown = b1;
              s1.total_reads += s2.total_reads; s1.matched_reads += s2.matched_reads; s1.aligned_reads += s2.aligned_reads;
              const ta = s1.aligned_reads || 1;
              const pct = (v: number) => Math.round((v / ta) * 10000) / 100;
              const tni = b1.no_indel + b1.substitution;
              s1.out_of_frame_pct = pct(b1.out_of_frame); s1.in_frame_pct = pct(b1.in_frame);
              s1.no_indel_pct = pct(tni); s1.substitution_pct = pct(b1.substitution);
              s1.modified = b1.out_of_frame + b1.in_frame; s1.unmodified = tni;
              s1.editing_efficiency = Math.round(((s1.modified) / (s1.total_reads || 1)) * 10000) / 100;
              if (newT.top_groups && extT.top_groups) {
                const gm = new Map<string, any>();
                [...extT.top_groups, ...newT.top_groups].forEach(g => { if (gm.has(g.read_inner)) { gm.get(g.read_inner).read_count += g.read_count; } else { gm.set(g.read_inner, { ...g }); } });
                const mg = Array.from(gm.values()).sort((a, b) => b.read_count - a.read_count).slice(0, 10);
                mg.forEach((g, i) => { g.group_rank = i + 1; g.read_pct = pct(g.read_count); });
                extT.top_groups = mg;
              }
            });
          }
        } else { geneMap.set(geneRes.gene, JSON.parse(JSON.stringify(geneRes))); }
      }
    }
    this.mergedGenes = Array.from(geneMap.values());
    this.totalMergedAmbiguous = totalAmb; this.totalMergedRawReads = totalRaw;
    this.totalMergedPhredPassed = totalPhred; this.totalMergedAnchorMatched = totalAnchor;
    this.allFileResults = allResults; this.selectedScopeIndex = -1;
    this.updateVisibleGenes();
    this.resultsUpdated$.next();
    if (callback) callback();
  }

  updateVisibleGenes() {
    const prev = this.currentGene?.gene;
    if (this.selectedScopeIndex === -1) {
      this.genes = this.mergedGenes; this.ambiguousReadCount = this.totalMergedAmbiguous;
      this.totalRawReads = this.totalMergedRawReads; this.totalPhredPassed = this.totalMergedPhredPassed;
      this.totalAnchorMatched = this.totalMergedAnchorMatched;
    } else {
      const mrd = this.allFileResults[this.selectedScopeIndex].multi_reference_result;
      this.genes = mrd.genes || []; this.ambiguousReadCount = mrd.ambiguous_read_count || 0;
      this.totalRawReads = mrd.debug?.total_reads_parsed || 0;
      this.totalPhredPassed = mrd.debug?.phred_passed_count || 0;
      this.totalAnchorMatched = mrd.debug?.anchor_matched_count || 0;
    }
    if (prev) { const ni = this.genes.findIndex((g: GeneResult) => g.gene === prev); this.selectedGeneIndex = ni !== -1 ? ni : 0; }
    else { this.selectedGeneIndex = 0; }
    this.selectedRowIndex = 0;
  }

  destroyCharts() { this.charts.forEach(c => c.destroy()); this.charts = []; }
  addChart(chart: Chart) { this.charts.push(chart); }
  getScopeName(i: number): string { if (i === -1) return 'All'; const p = this.allFileResults[i].fastq_file; return p.split('/').pop() || p; }

  clearProgress() {
    this.progress$.next(0);
    this.progressDisplay$.next(0);
    this.progressStage$.next('');
    if (this.progressAnimId) { clearInterval(this.progressAnimId); this.progressAnimId = null; }
  }

  clearBenchProgress() {
    this.benchProgress$.next(0);
    this.benchProgressDisplay$.next(0);
    this.benchStage$.next('');
    if (this.benchProgressAnimId) { clearInterval(this.benchProgressAnimId); this.benchProgressAnimId = null; }
  }

  /** Reset analysis slot completely — used by "New Analysis" button */
  newAnalysis() {
    this.activateSlot('analysis');
    this.analysisSlot = emptySlot();
    this.destroyCharts();
    this.clearProgress();
    this.debugLogs = [];
    this.selectedFiles = [];
  }

  /** Reset viewer slot completely — used by "New Viewer" button */
  newViewer() {
    this.activateSlot('viewer');
    this.viewerSlot = emptySlot();
    this.destroyCharts();
    this.clearProgress();
  }

  resetAnalysis() {
    this.genes = [];
    this.isMultiReference = false;
    this.destroyCharts();
    this.clearProgress();
    this.isLoading = false;
    this.error = null;
  }

  // ── Benchmark ──────────────────────────────────────────────────────────────
  addBenchRow() { this.benchRows.push({ file: null, geneName: '', targetName: '', referenceSequence: '', grnaSequence: '' }); }
  removeBenchRow(i: number) { if (this.benchRows.length > 1) this.benchRows.splice(i, 1); }

  runBenchmark(fd: FormData, subset: 'train' | 'test') {
    this.benchIsLoading = true; this.clearBenchProgress(); this.benchDestroy$.next();
    this.setBenchProgress(5, `Starting ${subset} benchmark…`);
    this.analysisService.runBenchmark(fd).subscribe({
      next: (res) => this.ngZone.run(() => { this.setBenchProgress(10, 'Queued — polling…'); this.startBenchPolling(res.task_id, subset); }),
      error: (err) => this.ngZone.run(() => { this.benchError = err?.error?.detail || err?.message || 'Failed.'; this.benchIsLoading = false; this.clearBenchProgress(); })
    });
  }

  private startBenchPolling(taskId: string, subset: 'train' | 'test') {
    timer(0, 1200).pipe(takeUntil(this.benchDestroy$), switchMap(() => this.analysisService.getTaskStatus(taskId))).subscribe({
      next: (status) => this.ngZone.run(() => {
        this.setBenchProgress(status.progress || 0, status.stage || '');
        if (status.status === 'failed') { this.benchError = status.error || 'Benchmark failed.'; this.benchIsLoading = false; this.clearBenchProgress(); this.benchDestroy$.next(); }
        else if (status.progress === 100 && status.result) {
          if (subset === 'train') this.trainResult = status.result; else this.testResult = status.result;
          this.benchIsLoading = false; this.benchProgressDisplay$.next(100); this.benchDestroy$.next();
        }
      }),
      error: () => this.ngZone.run(() => { this.benchError = 'Lost connection.'; this.benchIsLoading = false; this.clearBenchProgress(); this.benchDestroy$.next(); })
    });
  }

  async exportToExcel() {
    if (!this.lastRunParams || this.mergedGenes.length === 0) return;
    const scopes: ScopeData[] = [];
    const totalAssigned = this.mergedGenes.filter(g => !g.is_ambiguous_derived && !g.is_rescued_derived).reduce((s, g) => s + g.assigned_read_count, 0);
    scopes.push({ sheetName: 'Merged', readFlow: { rawReads: this.totalMergedRawReads, phredPassed: this.totalMergedPhredPassed, anchorMatched: this.totalMergedAnchorMatched, assignedReads: totalAssigned, ambiguousReads: this.totalMergedAmbiguous }, genes: this.mergedGenes });
    for (let i = 0; i < this.allFileResults.length; i++) {
      const fr = this.allFileResults[i]; const mrd = fr?.multi_reference_result as MultiReferenceResponse | undefined; if (!mrd) continue;
      const fn = (fr.fastq_file as string || '').split('/').pop() || `File${i + 1}`; const fg = mrd.genes || [];
      const fa = fg.filter((g: GeneResult) => !g.is_ambiguous_derived && !g.is_rescued_derived).reduce((s: number, g: GeneResult) => s + g.assigned_read_count, 0);
      scopes.push({ sheetName: fn, readFlow: { rawReads: mrd.debug?.total_reads_parsed ?? 0, phredPassed: mrd.debug?.phred_passed_count ?? 0, anchorMatched: mrd.debug?.anchor_matched_count ?? 0, assignedReads: fa, ambiguousReads: mrd.ambiguous_read_count ?? 0 }, genes: fg });
    }
    try { await this.excelExportService.exportToExcel(this.lastRunParams, scopes); this.addLog('Excel exported.'); }
    catch (e: any) { console.error('Excel export failed:', e); this.addLog(`Excel export failed: ${e.message}`); }
  }
}
