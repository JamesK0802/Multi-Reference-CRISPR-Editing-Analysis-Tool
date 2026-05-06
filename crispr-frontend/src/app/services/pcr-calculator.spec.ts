import { TestBed } from '@angular/core/testing';

import { PcrCalculator } from './pcr-calculator';

describe('PcrCalculator', () => {
  let service: PcrCalculator;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PcrCalculator);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
