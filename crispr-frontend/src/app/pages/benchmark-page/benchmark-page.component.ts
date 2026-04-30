import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppStateService } from '../../services/app-state.service';
import { AnalysisService } from '../../services/analysis.service';

@Component({
  selector: 'app-benchmark-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './benchmark-page.component.html'
})
export class BenchmarkPageComponent {
  constructor(
    public state: AppStateService,
    private analysisService: AnalysisService
  ) {}

  onBenchFileSelected(event: any, i: number) {
    const f = event.target.files?.[0];
    if (f && f.name.match(/\.(fastq|fq)$/i)) this.state.benchRows[i].file = f;
  }

  buildSplitPreview() {
    if (!this.validateBenchRows()) return;
    this.state.splitPreview = null;
    this.state.benchError = null;
    this.state.setBenchProgress(10, 'Computing split preview…');

    const fd = this.buildBenchFormData();
    this.analysisService.benchmarkSplitPreview(fd).subscribe({
      next: (res) => {
        this.state.splitPreview = res;
        this.state.setBenchProgress(100, 'Split preview ready');
      },
      error: (err) => {
        this.state.benchError = err?.error?.detail || err?.message || 'Split preview failed.';
        this.state.setBenchProgress(0, '');
      }
    });
  }

  runTrainBenchmark() { this.runBench('train'); }
  runTestBenchmark()  { this.runBench('test');  }

  private runBench(subset: 'train' | 'test') {
    if (!this.validateBenchRows()) return;
    this.state.benchError = null;
    const fd = this.buildBenchFormData(subset);
    this.state.runBenchmark(fd, subset);
  }

  private validateBenchRows(): boolean {
    for (const r of this.state.benchRows) {
      if (!r.file || !r.referenceSequence.trim() || !r.grnaSequence.trim()) {
        this.state.benchError = 'All rows must have a FASTQ file, reference sequence, and gRNA.';
        return false;
      }
    }
    return true;
  }

  private buildBenchFormData(subset?: string): FormData {
    const fd = new FormData();
    const meta: any[] = [];
    this.state.benchRows.forEach((r, idx) => {
      fd.append('files', r.file!, r.file!.name);
      meta.push({ 
        gene: r.geneName?.trim() || `G${idx + 1}`, 
        target: r.targetName?.trim() || `T${idx + 1}`,
        reference: r.referenceSequence, 
        grna: r.grnaSequence 
      });
    });
    fd.append('dataset', JSON.stringify(meta));
    fd.append('phred',   this.state.benchPhred.toString());
    fd.append('window',  this.state.benchWindow.toString());
    fd.append('margin',  (this.state.benchMargin / 100).toString());
    if (subset) fd.append('subset', subset);
    return fd;
  }
}
