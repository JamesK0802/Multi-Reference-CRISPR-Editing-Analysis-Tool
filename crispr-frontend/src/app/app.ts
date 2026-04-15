import { Component, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AnalysisService } from './analysis.service';
import { Chart } from 'chart.js/auto';

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  fastqDir = '';
  dataType = 'single-end';
  windowSize = 20;
  phredThreshold = 30;
  indelThreshold = 1.0;
  targetsJson = '[\n  {\n    "target_id": "target1",\n    "reference_seq": "GATTTGGGGTTCAAAGCAGTATCGATCAAATAGTAAATCCATTTGTTCAACTCACAGTTT",\n    "sgrna_seq": "ATCGATCAAATAGTAAATCC"\n  }\n]';
  result: any = null;
  error: string | null = null;
  isLoading = false;
  private charts: Chart[] = [];

  constructor(private analysisService: AnalysisService) {}

  runAnalysis() {
    this.error = null;
    this.result = null;
    this.destroyCharts();

    let parsedTargets;
    try {
      parsedTargets = JSON.parse(this.targetsJson);
    } catch (e) {
        this.error = 'Invalid JSON in targets.';
        return;
    }

    this.isLoading = true;
    
    const payload = {
      fastq_dir: this.fastqDir,
      data_type: this.dataType,
      window_size: this.windowSize,
      phred_threshold: this.phredThreshold,
      indel_threshold: this.indelThreshold,
      targets: parsedTargets
    };

    this.analysisService.runAnalysis(payload).subscribe({
      next: (res: any) => {
        this.result = res;
        this.isLoading = false;
        // Wait for DOM to render canvases
        setTimeout(() => this.createCharts(), 100);
      },
      error: (err: any) => {
        this.error = err.error?.detail || err.message || 'An error occurred';
        this.isLoading = false;
      }
    });
  }

  private destroyCharts() {
    this.charts.forEach(chart => chart.destroy());
    this.charts = [];
  }

  private createCharts() {
    if (!this.result || !this.result.results) return;

    this.result.results.forEach((fileRes: any, fileIdx: number) => {
      fileRes.target_results.forEach((targetRes: any, targetIdx: number) => {
        const summary = targetRes.summary;
        const chartId = `chart-${fileIdx}-${targetIdx}`;
        const profileId = `profile-${fileIdx}-${targetIdx}`;

        const ctx = document.getElementById(chartId) as HTMLCanvasElement;
        const ctxProfile = document.getElementById(profileId) as HTMLCanvasElement;

        if (ctx) {
          this.charts.push(new Chart(ctx, {
            type: 'bar',
            data: {
              labels: ['Unmodified', 'Modified'],
              datasets: [{
                label: 'Reads',
                data: [summary.unmodified, summary.modified],
                backgroundColor: ['#4bc0c0', '#ff6384']
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false }, title: { display: true, text: 'Edit Rate' } }
            }
          }));
        }

        if (ctxProfile) {
          this.charts.push(new Chart(ctxProfile, {
            type: 'bar',
            data: {
              labels: ['Ins', 'Del', 'Sub'],
              datasets: [{
                label: 'Count',
                data: [summary.insertion, summary.deletion, summary.substitution],
                backgroundColor: ['#36a2eb', '#ff9f40', '#9966ff']
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false }, title: { display: true, text: 'Mutation Profile' } }
            }
          }));
        }
      });
    });
  }
}
