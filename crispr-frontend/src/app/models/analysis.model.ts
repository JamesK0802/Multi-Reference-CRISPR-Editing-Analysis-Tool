export interface AnalysisBreakdown {
  wildtype: number;
  substitution: number;
  insertion: number;
  deletion: number;
  mixed: number;
}

export interface AnalysisSummary {
  total_reads: number;
  matched_reads: number;
  aligned_reads: number;
  unmodified: number;
  modified: number;
  editing_efficiency: number;
  
  // Percentages (denominated by matched_reads)
  indel_freq: number;
  sub_freq: number;
  indel_percent: number;
  sub_percent: number;
  insertion_percent: number;
  deletion_percent: number;
  mixed_percent: number;
}

export interface ReadDetail {
  read_index: number;
  target_found: boolean;
  classification: 'wildtype' | 'substitution' | 'insertion' | 'deletion' | 'mixed' | null;
}

export interface TargetResult {
  target_id: string;
  summary: AnalysisSummary;
  breakdown: AnalysisBreakdown;
  read_details: ReadDetail[];
}

export interface FileResult {
  fastq_file: string;
  sample_name?: string;
  target_results: TargetResult[];
}

export interface AnalysisResponse {
  metadata: {
    data_type: string;
    phred_threshold: number;
    indel_threshold: number;
  };
  results: FileResult[];
}
