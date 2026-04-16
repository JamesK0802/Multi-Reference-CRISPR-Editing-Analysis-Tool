import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { AnalysisResponse } from '../models/analysis.model';
import { MOCK_ANALYSIS_RESPONSE } from '../mock-analysis';

export interface TaskStatus {
  status: string;
  progress: number;
  stage: string;
  result: AnalysisResponse | null;
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AnalysisService {
  private apiUrl = 'http://localhost:8000';
  private useMock = false;

  constructor(private http: HttpClient) {}

  runAnalysis(formData: FormData): Observable<{task_id: string} | AnalysisResponse> {
    console.log('[SERVICE DEBUG] runAnalysis() entry. useMock:', this.useMock);
    if (this.useMock) {
      console.log('[SERVICE DEBUG] Returning mock observable.');
      return of(MOCK_ANALYSIS_RESPONSE);
    }
    const url = `${this.apiUrl}/analyze`;
    console.log('[SERVICE DEBUG] Executing http.post to:', url);
    return this.http.post<{task_id: string}>(url, formData);
  }

  getTaskStatus(taskId: string): Observable<TaskStatus> {
    return this.http.get<TaskStatus>(`${this.apiUrl}/status/${taskId}`);
  }

  setMockMode(mode: boolean) {
    this.useMock = mode;
  }
}
