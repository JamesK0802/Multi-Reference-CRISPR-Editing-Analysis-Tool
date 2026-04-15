# CRISPR Editing Analysis Tool

A professional full-stack platform for analyzing CRISPR FASTQ sequencing data. This tool processes raw sequencing files to identify genome editing events, classifies mutations, and provides interactive visualizations for multi-target analysis.

## Overview

The CRISPR Editing Analysis Tool is designed for researchers looking for a straightforward, local pipeline to quantify genome editing efficiency. It handles the extraction of cut-site windows, performs alignment comparisons against reference sequences, and generates high-level summaries of unmodified vs. modified reads.

## Features

- **FASTQ Processing**: Support for `.fastq` and `.fq` single-end sequencing files.
- **Multi-Target Analysis**: Analyze multiple sgRNA targets within a single sequencing run.
- **Mutation Classification**: Detects and localizes Insertions, Deletions, and Substitutions.
- **Interactive Visualization**: Real-time dashboard with bar charts for Edit Rate and Mutation Profiles.
- **Structured Data**: Exports comprehensive analysis in JSON format for downstream processing.
- **Parameter Control**: Adjustable window size, quality thresholds, and data type selection.

## Tech Stack

- **Backend**: Python 3.9+, [FastAPI](https://fastapi.tiangolo.com/), [Pydantic](https://docs.pydantic.dev/)
- **Frontend**: [Angular 21](https://angular.dev/), [Chart.js](https://www.chartjs.org/)
- **Future Integration**: Ollama + Gemma (for LLM-based sequence interpretation)

## Project Structure

```bash
├── crispr_backend/     # FastAPI Backend
│   ├── core/           # Analysis logic (Parser, Aligner, Analyzer)
│   ├── api.py          # API Endpoint definitions
│   ├── run_local.py    # CLI entry point and orchestration
│   └── requirements.txt
└── crispr-frontend/    # Angular Frontend
    ├── src/app/        # Dashboard and Analysis Service
    ├── package.json
    └── ...
```

## Installation & Setup

### Backend
1. Navigate to the backend directory:
   ```bash
   cd crispr_backend
   ```
2. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # Mac/Linux
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

### Frontend
1. Navigate to the frontend directory:
   ```bash
   cd crispr-frontend
   ```
2. Install Node dependencies:
   ```bash
   npm install
   ```

## How to Run Locally

1. **Start Backend**:
   ```bash
   cd crispr_backend
   uvicorn api:app --reload --port 8000
   ```

2. **Start Frontend**:
   ```bash
   cd crispr-frontend
   npx ng serve
   ```

3. Open your browser to `http://localhost:4200`.

## Example Usage

1. Enter the absolute path to your FASTQ directory in the UI.
2. Provide target definitions in JSON format:
   ```json
   [
     {
       "target_id": "Target_1",
       "reference_seq": "GATTTGGGGTTCAAAGCAGTATCGATCAAATAGTG...",
       "sgrna_seq": "ATCGATCAAATAGTAAATCC"
     }
   ]
   ```
3. Set your desired **Window Size** and **Indel Threshold**.
4. Click **Run Analysis** to view the interactive charts.

## Future Improvements

- **LLM Interpretation**: Integration with [Ollama](https://ollama.com/) to provide natural language explanations of complex mutation patterns.
- **Paired-End Support**: Native merging of R1 and R2 reads.
- **Batch Export**: PDF reporting and batch CSV export for large-scale screenings.
- **Quality Control**: Advanced Phred-score filtering and read trimming.

## AI Usage Disclaimer

> [!NOTE]
> This project was developed with the assistance of AI coding agents (including ChatGPT and Claude-based tools). While AI contributed to boilerplate generation and specific logic implementations, the overall architecture, scientific design decisions, and system integration were guided and verified by the developer.
