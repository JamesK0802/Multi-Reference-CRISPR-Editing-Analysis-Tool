import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PcrCalculator } from './pcr-calculator';

describe('PcrCalculator', () => {
  let component: PcrCalculator;
  let fixture: ComponentFixture<PcrCalculator>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PcrCalculator],
    }).compileComponents();

    fixture = TestBed.createComponent(PcrCalculator);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
