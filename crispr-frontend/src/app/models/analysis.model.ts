export interface AnalysisBreakdown {
  no_indel: number;
  substitution: number;
  in_frame: number;
  out_of_frame: number;
}

export interface AnalysisSummary {
  total_reads: number;
  matched_reads: number;
  aligned_reads: number;
  unmodified: number;
  modified: number;
  editing_efficiency: number;
  
  // Percentages (denominated by matched_reads)
  out_of_frame_pct: number;
  in_frame_pct: number;
  no_indel_pct: number;
  substitution_pct: number;
}

export interface ReadDetail {
  read_index: number;
  target_found: boolean;
  classification: 'out_of_frame' | 'in_frame' | 'substitution' | 'no_indel' | null;
}

export interface AlignmentToken {
  type: 'equal' | 'substitute' | 'delete' | 'insert';
  val: string;
}

export interface MutationGroup {
  group_rank: number;
  read_inner: string;
  read_count: number;
  read_pct: number;
  classification: string;
  net_indel: number;
  tokens: AlignmentToken[];
}

export interface TargetResult {
  target_id: string;
  summary: AnalysisSummary;
  breakdown: AnalysisBreakdown;
  read_details: ReadDetail[];
  ref_sequence?: string;
  cut_site_index?: number;
  top_groups?: MutationGroup[];
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
