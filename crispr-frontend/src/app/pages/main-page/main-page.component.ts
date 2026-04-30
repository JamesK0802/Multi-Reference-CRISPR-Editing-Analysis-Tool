import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-main-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="landing">
      <div class="landing-inner">
        <div class="hero">
          <h1>CRISPR Analysis Platform</h1>
          <p class="hero-desc">
            A local desktop platform for analysing CRISPR genome editing outcomes
            from sequencing data. Currently includes a multi-reference CRISPR
            analysis workflow, benchmarking tools, and result viewing utilities.
          </p>
        </div>

        <div class="tools-grid">
          <a routerLink="/crispr/analysis" class="tool-card">
            <h3>Analysis</h3>
            <p>Multi-reference, multi-target CRISPR editing analysis from FASTQ data.</p>
          </a>
          <a routerLink="/crispr/benchmark" class="tool-card">
            <h3>Benchmark</h3>
            <p>Test classification accuracy and threshold behavior on known datasets.</p>
          </a>
          <a routerLink="/crispr/result-viewer" class="tool-card">
            <h3>Result Viewer</h3>
            <p>Load exported Excel results and restore the analysis view.</p>
          </a>
        </div>

        <!-- <div class="open-cta">
          <a routerLink="/crispr" class="cta-btn">Open CRISPR Tool →</a>
        </div> -->
      </div>
    </div>
  `,
  styles: [`
    .landing { padding: 60px 24px 80px; }
    .landing-inner { max-width: 820px; margin: 0 auto; }
    .hero { text-align: center; margin-bottom: 56px; }
    .hero-badge {
      display: inline-block; font-size: 0.72rem; font-weight: 600;
      color: #3b7d56; background: #ecfdf5; border: 1px solid #bbf7d0;
      padding: 4px 14px; border-radius: 20px; margin-bottom: 20px;
      letter-spacing: 0.03em;
    }
    .hero h1 {
      font-size: 2.4rem; font-weight: 800; color: #0f172a;
      letter-spacing: -0.025em; margin-bottom: 16px;
    }
    .hero-desc {
      font-size: 1.05rem; line-height: 1.65; color: #64748b; max-width: 600px; margin: 0 auto;
    }
    .tools-grid {
      display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; margin-bottom: 48px;
    }
    .tool-card {
      background: #fff; border: 1px solid #e5e7eb; border-radius: 12px;
      padding: 28px 22px; text-decoration: none; color: inherit;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    .tool-card:hover {
      border-color: #86efac; box-shadow: 0 4px 12px rgba(0,0,0,0.04);
    }
    .tool-icon { font-size: 1.6rem; margin-bottom: 12px; }
    .tool-card h3 { font-size: 1rem; font-weight: 700; color: #1e293b; margin-bottom: 8px; }
    .tool-card p { font-size: 0.82rem; line-height: 1.5; color: #64748b; }
    .open-cta { text-align: center; }
    .cta-btn {
      display: inline-block; padding: 11px 28px; border-radius: 8px;
      background: #166534; color: #fff; font-weight: 600; font-size: 0.88rem;
      text-decoration: none; transition: background 0.15s;
    }
    .cta-btn:hover { background: #14532d; }
    @media (max-width: 700px) { .tools-grid { grid-template-columns: 1fr; } }
  `]
})
export class MainPageComponent { }
