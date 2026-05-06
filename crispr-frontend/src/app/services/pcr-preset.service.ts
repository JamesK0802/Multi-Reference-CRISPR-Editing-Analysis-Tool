import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, of } from 'rxjs';

export interface PcrComponent {
  id?: string;
  name: string;
  componentType: string;
  calculationMode: 'fixed_ratio' | 'fixed_volume' | 'volume_per_25ul' | 'primer_concentration' | 'fixed_final_concentration' | 'user_input' | 'fill_to_reaction_volume';
  stockConcentration?: number;
  stockUnit?: string;
  finalConcentration?: number;
  finalUnit?: string;
  fixedVolume?: number;
  volumePer25ul?: number;
  ratioDenominator?: number;
  includeInMasterMix: boolean;
  isOptional: boolean;
  displayOrder: number;
}

export interface PcrPreset {
  id?: string;
  name: string;
  category: string;
  source?: string;
  description?: string;
  defaultReactionVolume: number;
  allowedReactionVolumes: number[];
  isDefault: boolean;
  components: PcrComponent[];
}

@Injectable({
  providedIn: 'root'
})
export class PcrPresetService {
  private apiUrl = '/api/pcr-presets';

  constructor(private http: HttpClient) {}

  getPresets(): Observable<PcrPreset[]> {
    return this.http.get<PcrPreset[]>(this.apiUrl).pipe(
      catchError(err => {
        console.error('Failed to fetch presets', err);
        return of([]);
      })
    );
  }

  createPreset(preset: PcrPreset): Observable<any> {
    return this.http.post(this.apiUrl, preset);
  }

  deletePreset(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }
}
