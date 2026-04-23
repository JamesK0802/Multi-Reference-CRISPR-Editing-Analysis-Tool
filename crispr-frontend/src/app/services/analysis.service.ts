import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { AnalysisResponse, BenchmarkResult, SplitPreview } from '../models/analysis.model';

export interface TaskStatus {
  status: string;
  progress: number;
  stage: string;
  result: any | null;
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class AnalysisService {
  private apiUrl = 'http://127.0.0.1:8000';

  constructor(private http: HttpClient) {}

  // ── CRISPR Analysis ─────────────────────────────────────────────────────────
  runAnalysis(formData: FormData): Observable<{ task_id: string } | AnalysisResponse> {
    return this.http.post<{ task_id: string }>(`${this.apiUrl}/analyze`, formData);
  }

  getTaskStatus(taskId: string): Observable<TaskStatus> {
    return this.http.get<TaskStatus>(`${this.apiUrl}/status/${taskId}`);
  }

  // ── Benchmark ───────────────────────────────────────────────────────────────

  /** Preview train/test split counts — synchronous response, no task_id. */
  benchmarkSplitPreview(formData: FormData): Observable<SplitPreview> {
    return this.http.post<SplitPreview>(`${this.apiUrl}/benchmark/split`, formData);
  }

  /** Start classification benchmark — returns task_id for polling. */
  runBenchmark(formData: FormData): Observable<{ task_id: string }> {
    return this.http.post<{ task_id: string }>(`${this.apiUrl}/benchmark/run`, formData);
  }
}
