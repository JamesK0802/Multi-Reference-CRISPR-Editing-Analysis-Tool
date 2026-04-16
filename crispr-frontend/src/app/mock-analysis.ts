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
            indel_freq: 3.4,
            sub_freq: 0.6,
            indel_percent: 3.4,
            sub_percent: 0.6,
            insertion_percent: 1.04,
            deletion_percent: 2.36,
            mixed_percent: 0.0
          },
          breakdown: {
            wildtype: 4600,
            substitution: 30,
            insertion: 50,
            deletion: 120,
            mixed: 0
          },
          read_details: [
            { read_index: 1, target_found: true, classification: 'wildtype' },
            { read_index: 2, target_found: true, classification: 'deletion' },
            { read_index: 3, target_found: true, classification: 'insertion' }
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
            indel_freq: 67.2,
            sub_freq: 5.5,
            indel_percent: 67.2,
            sub_percent: 5.5,
            insertion_percent: 28.85,
            deletion_percent: 38.35,
            mixed_percent: 0.0
          },
          breakdown: {
            wildtype: 1200,
            substitution: 300,
            insertion: 1500,
            deletion: 2200,
            mixed: 0
          },
          read_details: [
            { read_index: 101, target_found: true, classification: 'insertion' },
            { read_index: 102, target_found: true, classification: 'substitution' }
          ]
        }
      ]
    }
  ]
};
