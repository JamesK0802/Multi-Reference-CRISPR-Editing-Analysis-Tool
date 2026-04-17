import { AnalysisResponse } from './models/analysis.model';

export const MOCK_ANALYSIS_RESPONSE: AnalysisResponse = {
  metadata: {
    data_type: 'single-end',
    phred_threshold: 30,
    indel_threshold: 1.0
  },
  results: [
    {
      fastq_file: 'sample_SRX12345_R1.fastq',
      sample_name: 'Sample A (Control)',
      target_results: [
        {
          target_id: 'HEK4_Site',
          summary: {
            total_reads: 5000,
            matched_reads: 4800,
            aligned_reads: 4800,
            unmodified: 4600,
            modified: 200,
            editing_efficiency: 4.0,
            out_of_frame_pct: 2.5,
            in_frame_pct: 0.9,
            no_indel_pct: 95.8,
            substitution_pct: 0.8
          },
          breakdown: {
            no_indel: 4600,
            substitution: 38,
            in_frame: 43,
            out_of_frame: 119
          },
          read_details: [
            { read_index: 1, target_found: true, classification: 'no_indel' },
            { read_index: 2, target_found: true, classification: 'out_of_frame' },
            { read_index: 3, target_found: true, classification: 'in_frame' }
          ]
        }
      ]
    },
    {
      fastq_file: 'sample_SRX12346_R1.fastq',
      sample_name: 'Sample B (Treated)',
      target_results: [
        {
          target_id: 'HEK4_Site',
          summary: {
            total_reads: 5500,
            matched_reads: 5200,
            aligned_reads: 5200,
            unmodified: 1200,
            modified: 4000,
            editing_efficiency: 72.7,
            out_of_frame_pct: 45.2,
            in_frame_pct: 22.0,
            no_indel_pct: 23.1,
            substitution_pct: 9.7
          },
          breakdown: {
            no_indel: 1200,
            substitution: 504,
            in_frame: 1144,
            out_of_frame: 2352
          },
          read_details: [
            { read_index: 101, target_found: true, classification: 'out_of_frame' },
            { read_index: 102, target_found: true, classification: 'substitution' }
          ]
        }
      ]
    }
  ]
};
