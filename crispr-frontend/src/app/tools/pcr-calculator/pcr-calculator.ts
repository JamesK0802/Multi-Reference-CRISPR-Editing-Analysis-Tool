import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { PcrPresetService, PcrPreset, PcrComponent } from '../../services/pcr-preset.service';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface CalculatedComponent {
  name: string;
  perReaction: number;
  total: number;
  isOptional: boolean;
  includeInMasterMix: boolean;
}

@Component({
  selector: 'app-pcr-calculator',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './pcr-calculator.html',
  styleUrl: './pcr-calculator.css',
})
export class PcrCalculator implements OnInit {
  pcrForm!: FormGroup;
  availablePresets: PcrPreset[] = [];
  selectedPreset: PcrPreset | null = null;
  
  viewMode: 'calculator' | 'manager' = 'calculator';

  calculationModes = [
    { id: 'fixed_ratio', name: 'Ratio (1/N)' },
    { id: 'fixed_volume', name: 'Fixed Volume (µL)' },
    { id: 'primer_concentration', name: 'Concentration (C1V1)' },
    { id: 'fill_to_reaction_volume', name: 'Water (Balance)' }
  ];

  concentrationUnits = ['mM', 'µM', 'nM'];

  constructor(
    private fb: FormBuilder,
    private presetService: PcrPresetService
  ) {}

  ngOnInit() {
    this.initForm();
    this.loadPresets();
  }

  initForm() {
    this.pcrForm = this.fb.group({
      presetId: [''],
      numReactions: [10, [Validators.required, Validators.min(1)]],
      reactionVolume: [20, [Validators.required, Validators.min(0.1)]],
      overage: [10, [Validators.required, Validators.min(0), Validators.max(100)]],
      components: this.fb.array([])
    });
  }

  loadPresets() {
    this.presetService.getPresets().subscribe(presets => {
      this.availablePresets = presets;
      if (presets.length > 0) {
        this.selectPreset(presets[0].id!);
      }
    });
  }

  get componentForms() {
    return this.pcrForm.get('components') as FormArray;
  }

  selectPreset(id: string) {
    if (id === 'custom') {
      this.selectedPreset = {
        id: 'custom',
        name: 'Custom Protocol',
        category: 'Custom',
        defaultReactionVolume: 20,
        allowedReactionVolumes: [],
        isDefault: false,
        components: []
      };
      this.pcrForm.patchValue({ 
        presetId: 'custom',
        reactionVolume: 20
      });
      while (this.componentForms.length) this.componentForms.removeAt(0);
      
      this.addComponent('Template DNA', 'fixed_volume', false);
      this.addComponent('Nuclease-Free Water', 'fill_to_reaction_volume', true);
      return;
    }

    const preset = this.availablePresets.find(p => p.id === id);
    if (!preset) return;
    
    this.selectedPreset = preset;
    this.pcrForm.patchValue({
      presetId: id,
      reactionVolume: preset.defaultReactionVolume || 20
    });

    while (this.componentForms.length) this.componentForms.removeAt(0);
    
    const sortedComps = [...preset.components].sort((a, b) => {
      const isTemplateA = a.name.toLowerCase().includes('template');
      const isTemplateB = b.name.toLowerCase().includes('template');
      const isWaterA = a.calculationMode === 'fill_to_reaction_volume';
      const isWaterB = b.calculationMode === 'fill_to_reaction_volume';

      if (isTemplateA) return -1;
      if (isTemplateB) return 1;
      if (isWaterA) return 1;
      if (isWaterB) return -1;
      return (a.displayOrder || 0) - (b.displayOrder || 0);
    });

    sortedComps.forEach(comp => {
      let mode = comp.calculationMode;
      // Merge redundant modes
      if (mode === 'user_input') mode = 'fixed_volume';
      if (mode === 'volume_per_25ul') mode = 'fixed_ratio';
      if (mode === 'fixed_final_concentration') mode = 'primer_concentration';

      let ratioDenom = comp.ratioDenominator;
      if (comp.calculationMode === 'volume_per_25ul' && comp.volumePer25ul) {
        ratioDenom = 25 / comp.volumePer25ul;
      }

      this.componentForms.push(this.fb.group({
        id: [comp.id],
        name: [comp.name],
        calculationMode: [mode],
        isOptional: [comp.isOptional],
        enabled: [true],
        userInputVolume: [comp.fixedVolume || 0],
        stockConcentration: [comp.stockConcentration || 10],
        stockUnit: [comp.stockUnit || 'µM'],
        finalConcentration: [comp.finalConcentration || 0.5],
        finalUnit: [comp.finalUnit || 'µM'],
        ratioDenominator: [ratioDenom || 2],
        fixedVolume: [comp.fixedVolume || 0],
        includeInMasterMix: [comp.includeInMasterMix]
      }));
    });
  }

  addComponent(name = 'New Component', mode = 'fixed_volume', atEnd = false) {
    const group = this.fb.group({
      id: [null],
      name: [name],
      calculationMode: [mode],
      isOptional: [false],
      enabled: [true],
      userInputVolume: [0],
      stockConcentration: [10],
      stockUnit: ['µM'],
      finalConcentration: [0.5],
      finalUnit: ['µM'],
      ratioDenominator: [2],
      fixedVolume: [0],
      includeInMasterMix: [!name.toLowerCase().includes('template')]
    });

    if (atEnd || this.componentForms.length === 0) {
      this.componentForms.push(group);
    } else {
      const lastIdx = this.componentForms.length - 1;
      const lastMode = this.componentForms.at(lastIdx).value.calculationMode;
      if (lastMode === 'fill_to_reaction_volume') {
        this.componentForms.insert(lastIdx, group);
      } else {
        this.componentForms.push(group);
      }
    }
  }

  removeComponent(index: number) {
    this.componentForms.removeAt(index);
  }

  private toMicromolar(value: number, unit: string): number {
    switch (unit) {
      case 'mM': return value * 1000;
      case 'µM': return value;
      case 'nM': return value / 1000;
      default: return value;
    }
  }

  calculateResults() {
    if (!this.selectedPreset) return null;
    
    const formVal = this.pcrForm.value;
    const rxnVol = formVal.reactionVolume;
    const nRxn = formVal.numReactions;
    const effectiveRxns = nRxn * (1 + formVal.overage / 100);
    
    let results: CalculatedComponent[] = [];
    let waterComponent: any = null;
    let sumOtherVols = 0;

    formVal.components.forEach((c: any) => {
      if (c.isOptional && !c.enabled) return;
      
      let perRxn = 0;

      switch (c.calculationMode) {
        case 'fixed_ratio':
          perRxn = rxnVol / (c.ratioDenominator || 1);
          break;
        case 'fixed_volume':
          perRxn = c.fixedVolume || 0;
          break;
        case 'primer_concentration':
          const stockUM = this.toMicromolar(c.stockConcentration, c.stockUnit);
          const finalUM = this.toMicromolar(c.finalConcentration, c.finalUnit);
          if (stockUM > 0) {
            perRxn = (finalUM * rxnVol) / stockUM;
          }
          break;
        case 'fill_to_reaction_volume':
          waterComponent = c;
          return; 
      }

      results.push({
        name: c.name,
        perReaction: perRxn,
        total: perRxn * (c.includeInMasterMix ? effectiveRxns : nRxn),
        isOptional: c.isOptional,
        includeInMasterMix: c.includeInMasterMix
      });
      sumOtherVols += perRxn;
    });

    const waterVol = Math.max(0, rxnVol - sumOtherVols);
    if (waterComponent) {
      results.push({
        name: waterComponent.name,
        perReaction: waterVol,
        total: waterVol * effectiveRxns,
        isOptional: false,
        includeInMasterMix: true
      });
    }

    return {
      components: results,
      effectiveRxns,
      totalRxnVol: rxnVol,
      waterVol: rxnVol - sumOtherVols,
      clampedWater: waterVol
    };
  }

  get results() { return this.calculateResults(); }

  get errors() {
    const res = this.results;
    const errs: string[] = [];
    if (res && res.waterVol < -0.0001) {
      errs.push('Total components exceed reaction volume! Water cannot be added.');
    }
    return errs;
  }

  get warnings() {
    const res = this.results;
    const warns: string[] = [];
    if (res) {
      res.components.forEach(c => {
        // Warning should be based on TOTAL BULK for pipetting safety
        if (c.total > 0 && c.total < 0.5) warns.push(`Total bulk volume for ${c.name} is very low (< 0.5 µL).`);
      });
      if (res.clampedWater * res.effectiveRxns < 1 && res.waterVol >= 0) warns.push('Total water volume is extremely low. Pipetting may be difficult.');
    }
    return warns;
  }

  saveAsPreset() {
    const name = prompt('Enter a name for this preset:');
    if (!name) return;

    const formVal = this.pcrForm.value;
    const newPreset: PcrPreset = {
      name: name,
      category: 'User Created',
      defaultReactionVolume: formVal.reactionVolume,
      allowedReactionVolumes: [formVal.reactionVolume],
      isDefault: false,
      components: formVal.components.map((c: any, i: number) => ({
        name: c.name,
        componentType: 'other',
        calculationMode: c.calculationMode,
        stockConcentration: c.stockConcentration,
        stockUnit: c.stockUnit,
        finalConcentration: c.finalConcentration,
        finalUnit: c.finalUnit,
        ratioDenominator: c.ratioDenominator,
        fixedVolume: c.fixedVolume,
        includeInMasterMix: c.includeInMasterMix,
        isOptional: c.isOptional,
        displayOrder: i
      }))
    };

    this.presetService.createPreset(newPreset).subscribe(() => {
      alert('Preset saved successfully!');
      this.loadPresets();
    });
  }

  deletePreset(id: string) {
    if (confirm('Are you sure you want to delete this preset?')) {
      this.presetService.deletePreset(id).subscribe(() => {
        this.loadPresets();
      });
    }
  }

  exportPDF() {
    const doc = new jsPDF();
    const res = this.results;
    const form = this.pcrForm.value;
    if (!res || !this.selectedPreset) return;

    doc.setFontSize(22);
    doc.setTextColor(30, 41, 59);
    doc.text('PCR Setup Protocol', 14, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`Preset: ${this.selectedPreset.name}`, 14, 30);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 160, 30);

    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.rect(14, 35, 182, 20, 'FD');
    
    doc.setFontSize(11);
    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.text('Experiment Settings', 20, 42);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Reactions: ${form.numReactions}`, 20, 49);
    doc.text(`Overage: ${form.overage}%`, 70, 49);
    doc.text(`Total Vol/Rxn: ${form.reactionVolume} µL`, 120, 49);

    autoTable(doc, {
      startY: 60,
      head: [['Component', 'Per Rxn (µL)', 'Total Bulk (µL)']],
      body: res.components.map(c => [
        c.name, 
        c.perReaction.toFixed(2), 
        c.total.toFixed(2)
      ]),
      headStyles: { fillColor: [30, 41, 59] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        1: { halign: 'right' },
        2: { halign: 'right' }
      }
    });

    doc.save(`${this.selectedPreset.name.replace(/\s+/g, '_')}_Protocol.pdf`);
  }
}
