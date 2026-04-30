import { Component, ChangeDetectorRef, NgZone, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AppStateService } from '../../services/app-state.service';
import { Chart } from 'chart.js/auto';

@Component({
  selector: 'app-result-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './result-dashboard.component.html'
})
export class ResultDashboardComponent implements OnInit, OnDestroy {
  constructor(
    public state: AppStateService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone
  ) {}

  ngOnInit() {
    this.state.resultsUpdated$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.refreshDashboard();
    });

    if (this.state.genes.length > 0) {
      this.refreshDashboard();
    }
  }

  private destroy$ = new Subject<void>();

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.state.destroyCharts();
  }

  selectGene(index: number) {
    this.state.selectedGeneIndex = index;
    this.state.selectedRowIndex = 0;
    this.state.destroyCharts();
    this.refreshDashboard();
  }

  selectScope(index: number) {
    this.state.selectedScopeIndex = index;
    this.state.updateVisibleGenes();
    this.refreshDashboard();
  }

  selectRow(index: number) {
    this.state.selectedRowIndex = index;
    this.refreshDashboard();
  }

  get flatTargets() {
    if (!this.state.currentGene) return [];
    return (this.state.currentGene.analysis_result.targets || []).map(t => ({
      file: { fastq_file: '', sample_name: this.state.currentGene!.gene, target_results: [] as any[] },
      target: t
    }));
  }

  get summaryTableData() {
    return this.flatTargets.map((item, index) => ({
      index,
      sample: this.state.currentGene?.gene ?? 'Gene',
      target: item.target.target_id,
      total: item.target.summary?.total_reads ?? 0,
      matched: item.target.summary?.aligned_reads ?? 0,
      outOfFrame: item.target.summary?.out_of_frame_pct ?? 0,
      inFrame: item.target.summary?.in_frame_pct ?? 0,
      noIndel: item.target.summary?.no_indel_pct ?? 0,
      substitution: item.target.summary?.substitution_pct ?? 0
    }));
  }

  refreshDashboard() {
    this.ngZone.run(() => {
      const gene = this.state.currentGene;
      if (!gene?.analysis_result?.targets?.length) return;
      const targets = gene.analysis_result.targets;
      const idx = Math.min(this.state.selectedRowIndex, targets.length - 1);
      this.state.selectedTarget = targets[idx];

      if (!this.state.selectedTarget) {
        this.cdr.detectChanges();
        return;
      }

      this.state.metrics = {
        totalReads: this.state.selectedTarget.summary?.total_reads ?? 0,
        alignedReads: this.state.selectedTarget.summary?.aligned_reads ?? 0,
        avgOutOfFrame: this.state.selectedTarget.summary?.out_of_frame_pct ?? 0,
        avgInFrame: this.state.selectedTarget.summary?.in_frame_pct ?? 0,
        avgNoIndel: this.state.selectedTarget.summary?.no_indel_pct ?? 0,
        avgSubstitution: this.state.selectedTarget.summary?.substitution_pct ?? 0,
      };

      this.cdr.detectChanges();

      setTimeout(() => {
        this.ngZone.run(() => {
          this.updateChartsForSelected();
          this.centerAnnotation();
          this.cdr.detectChanges();
        });
      }, 64);
    });
  }

  private centerAnnotation() {
    const container = document.querySelector('.unified-anno-container');
    if (!container || !this.state.selectedTarget) return;
    const cutIdx = this.state.selectedTarget.cut_site_index || 0;
    const stickyLeftWidth = 150;
    const baseWidth = 13;
    const padding = 15;
    const xPos = stickyLeftWidth + (cutIdx * baseWidth) + padding;
    const viewportWidth = container.clientWidth;
    const targetScroll = xPos - (viewportWidth / 2);
    container.scrollLeft = Math.max(0, targetScroll);
  }

  private updateChartsForSelected() {
    this.state.destroyCharts();
    const flat = this.flatTargets;
    if (!flat.length || !this.state.selectedTarget) return;
    const safeIdx = Math.min(this.state.selectedRowIndex, flat.length - 1);
    const selectedData = flat[safeIdx].target;

    const indelCtx = document.getElementById('indelChart') as HTMLCanvasElement;
    if (indelCtx) {
      this.state.addChart(new Chart(indelCtx, {
        type: 'bar',
        data: {
          labels: flat.map(item => this.state.isMultiReference ? item.target.target_id : `${item.file.sample_name || item.file.fastq_file.split('/').pop()} (${item.target.target_id})`),
          datasets: [
            { label: 'No Indel %', data: flat.map(item => (item.target.summary?.no_indel_pct ?? 0) - (item.target.summary?.substitution_pct ?? 0)), backgroundColor: '#2ecc71' },
            { label: 'Substitution %', data: flat.map(item => item.target.summary?.substitution_pct ?? 0), backgroundColor: '#3498db' },
            { label: 'In-frame %', data: flat.map(item => item.target.summary?.in_frame_pct ?? 0), backgroundColor: '#e67e22' },
            { label: 'Out-of-frame %', data: flat.map(item => item.target.summary?.out_of_frame_pct ?? 0), backgroundColor: '#e74c3c' }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: { x: { stacked: true }, y: { stacked: true, min: 0, max: 100, title: { display: true, text: 'Percentage (%)' } } },
          plugins: { legend: { position: 'bottom' }, title: { display: true, text: 'Mutation Distribution per Target' } }
        }
      }));
    }

    const pieCtx = document.getElementById('mutationPieChart') as HTMLCanvasElement;
    if (pieCtx && selectedData?.breakdown) {
      this.state.addChart(new Chart(pieCtx, {
        type: 'pie',
        data: {
          labels: ['Unmodified (No Indel)', 'Substitution', 'In-frame Indel', 'Out-of-frame Indel'],
          datasets: [{
            data: [selectedData.breakdown.no_indel ?? 0, selectedData.breakdown.substitution ?? 0, selectedData.breakdown.in_frame ?? 0, selectedData.breakdown.out_of_frame ?? 0],
            backgroundColor: ['#2ecc71', '#3498db', '#e67e22', '#e74c3c']
          }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' }, title: { display: true, text: `Mutation Distribution (${selectedData.target_id})` } } }
      }));
    }

    const donutCtx = document.getElementById('donutChart') as HTMLCanvasElement;
    if (donutCtx && selectedData?.summary) {
      this.state.addChart(new Chart(donutCtx, {
        type: 'doughnut',
        data: {
          labels: ['Edited', 'Unedited'],
          datasets: [{
            data: [selectedData.summary.modified ?? 0, selectedData.summary.unmodified ?? 0],
            backgroundColor: ['#ff6384', '#cccccc']
          }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: `Editing Efficiency (${selectedData.target_id})` } } }
      }));
    }
  }
}
