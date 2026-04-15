import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AnalysisService {
  // Point this to your FastAPI local server
  private apiUrl = 'http://127.0.0.1:8000/analyze';

  constructor(private http: HttpClient) { }

  // Takes the raw payload object and POSTs it
  runAnalysis(payload: any): Observable<any> {
    return this.http.post<any>(this.apiUrl, payload);
  }
}
