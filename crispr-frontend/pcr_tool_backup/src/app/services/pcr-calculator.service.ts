import { Injectable } from '@angular/core';

export interface ExperimentSetInput {
  setName: string;
  numReactions: number;
  reactionVolume: number;
  templateVolume: number;
  masterMixVolume: number;
  overage: number;
  primerMode: 'volume' | 'concentration';
  // Volume mode
  fwdPrimerVolume: number;
  revPrimerVolume: number;
  // Concentration mode
  stockFwdPrimer: number;
  stockRevPrimer: number;
  finalPrimerConc: number;
}

export interface PcrResultRow {
  component: string;
  perReaction: number;
  total: number;
}

export interface SetResult {
  setName: string;
  composition: PcrResultRow[];
  totalReactions: number;
  numReactions: number;
  overage: number;
  masterMixBulkVolume: number;
  errors: string[];
  warnings: string[];
}

@Injectable({
  providedIn: 'root'
})
export class PcrCalculatorService {
  calculateSet(input: ExperimentSetInput): SetResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    const {
      setName, numReactions, reactionVolume, templateVolume, 
      masterMixVolume, overage, primerMode
    } = input;

    // Validation: Negative values
    if (numReactions < 0 || reactionVolume < 0 || templateVolume < 0 || masterMixVolume < 0 || overage < 0) {
      errors.push('Negative values are not allowed.');
    }
    
    if (overage === 0) {
      warnings.push('Overage is 0%. Standard practice is 5-10% to account for pipetting loss.');
    }

    let fwdVol = 0;
    let revVol = 0;

    if (primerMode === 'volume') {
      fwdVol = input.fwdPrimerVolume || 0;
      revVol = input.revPrimerVolume || 0;
      if (fwdVol < 0 || revVol < 0) errors.push('Primer volumes cannot be negative.');
    } else {
      const stockFwd = input.stockFwdPrimer || 0;
      const stockRev = input.stockRevPrimer || 0;
      const finalConc = input.finalPrimerConc || 0;
      
      if (stockFwd <= 0 || stockRev <= 0) {
        if (stockFwd < 0 || stockRev < 0) errors.push('Stock concentration cannot be negative.');
        else errors.push('Stock concentration must be greater than 0.');
      } else {
        fwdVol = (finalConc * reactionVolume) / stockFwd;
        revVol = (finalConc * reactionVolume) / stockRev;
        if (finalConc < 0) errors.push('Final concentration cannot be negative.');
      }
    }

    const waterVol = reactionVolume - (masterMixVolume + fwdVol + revVol + templateVolume);
    if (waterVol < 0) {
      errors.push('Water volume is negative. The sum of components exceeds the reaction volume.');
    }

    const effectiveReactions = numReactions * (1 + overage / 100);

    const composition: PcrResultRow[] = [
      { component: 'Master Mix', perReaction: masterMixVolume, total: masterMixVolume * effectiveReactions },
      { component: 'Forward Primer', perReaction: fwdVol, total: fwdVol * effectiveReactions },
      { component: 'Reverse Primer', perReaction: revVol, total: revVol * effectiveReactions },
      { component: 'Template DNA', perReaction: templateVolume, total: templateVolume * numReactions },
      { component: 'Water', perReaction: waterVol, total: waterVol * effectiveReactions },
      { component: 'Total', perReaction: reactionVolume, total: reactionVolume * effectiveReactions }
    ];

    // Pipetting warnings
    composition.forEach(row => {
      if (row.perReaction > 0 && row.perReaction < 0.5 && row.component !== 'Total') {
        warnings.push(`${row.component} volume per reaction (${row.perReaction.toFixed(2)} µL) is less than 0.5 µL.`);
      }
    });

    const masterMixBulkVolume = (masterMixVolume + fwdVol + revVol + waterVol) * effectiveReactions;

    return {
      setName: setName || 'Unnamed Set',
      composition,
      totalReactions: effectiveReactions,
      numReactions,
      overage,
      masterMixBulkVolume,
      errors,
      warnings: Array.from(new Set(warnings))
    };
  }
}
