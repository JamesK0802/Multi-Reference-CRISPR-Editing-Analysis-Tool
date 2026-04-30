import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-crispr-layout',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <div class="crispr-shell">
      <div class="sub-nav">
        <div class="sub-nav-inner">
          <a routerLink="analysis" routerLinkActive="active" class="sub-tab">
            <span class="sub-tab-text">
              <strong>Analysis</strong>
              <small>Multi-reference CRISPR analysis</small>
            </span>
          </a>
          <a routerLink="benchmark" routerLinkActive="active" class="sub-tab">
            <span class="sub-tab-text">
              <strong>Benchmark</strong>
              <small>Classification accuracy testing</small>
            </span>
          </a>
          <a routerLink="result-viewer" routerLinkActive="active" class="sub-tab">
            <span class="sub-tab-text">
              <strong>Result Viewer</strong>
              <small>Load exported Excel results</small>
            </span>
          </a>
        </div>
      </div>
      <div class="crispr-body">
        <router-outlet></router-outlet>
      </div>
    </div>
  `,
  styles: [`
    .crispr-shell { display: flex; flex-direction: column; min-height: calc(100vh - 56px); }
    .sub-nav {
      background: #fff; border-bottom: 1px solid #e5e7eb;
      padding: 0 28px;
    }
    .sub-nav-inner { display: flex; gap: 6px; max-width: 1100px; margin: 0 auto; }
    .sub-tab {
      display: flex; align-items: center; gap: 10px;
      padding: 12px 16px; text-decoration: none; color: #64748b;
      border-bottom: 2px solid transparent; transition: all 0.15s;
    }
    .sub-tab:hover { color: #334155; background: #f8fafc; }
    .sub-tab.active { color: #166534; border-bottom-color: #22c55e; }
    .sub-tab-text { display: flex; flex-direction: column; line-height: 1.3; }
    .sub-tab-text strong { font-size: 0.82rem; font-weight: 700; }
    .sub-tab-text small { font-size: 0.68rem; font-weight: 500; opacity: 0.75; }
    .crispr-body {
      flex: 1; padding: 24px 28px; background: #f7f8fa;
      max-width: 1100px; width: 100%; margin: 0 auto;
    }
  `]
})
export class CrisprLayoutComponent {}
