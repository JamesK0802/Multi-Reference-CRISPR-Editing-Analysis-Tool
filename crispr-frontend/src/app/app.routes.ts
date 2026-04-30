import { Routes } from '@angular/router';
import { MainPageComponent } from './pages/main-page/main-page.component';
import { CrisprLayoutComponent } from './layouts/crispr-layout/crispr-layout.component';

export const routes: Routes = [
  { path: '', component: MainPageComponent },
  {
    path: 'crispr',
    component: CrisprLayoutComponent,
    children: [
      { path: '', redirectTo: 'analysis', pathMatch: 'full' },
      { 
        path: 'analysis', 
        loadComponent: () => import('./pages/analysis-page/analysis-page.component').then(m => m.AnalysisPageComponent) 
      },
      { 
        path: 'benchmark', 
        loadComponent: () => import('./pages/benchmark-page/benchmark-page.component').then(m => m.BenchmarkPageComponent) 
      },
      { 
        path: 'result-viewer', 
        loadComponent: () => import('./pages/result-viewer-page/result-viewer-page.component').then(m => m.ResultViewerPageComponent) 
      }
    ]
  },
  { path: '**', redirectTo: '' }
];
