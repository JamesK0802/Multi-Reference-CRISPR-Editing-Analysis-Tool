# CRISPR Editing Analysis Tool

A professional full-stack platform for analyzing CRISPR FASTQ sequencing data. This tool processes raw sequencing files to identify genome editing events, classifies mutations with high precision, and provides interactive visualizations for multi-target analysis.

## Overview

The CRISPR Editing Analysis Tool is a robust, local pipeline designed to quantify genome editing efficiency. By performing orientation-aware alignment and detailed mutation categorization, it provides researchers with highly accurate metrics for Indel frequency and mutation distribution.

## Key Features

- **Orientation-Aware Alignment**: Automatically detects if a gRNA is forward or reverse-complement in the reference. Features bi-directional read search to maximize alignment rates for real-world sequencing data.
- **Detailed Mutation Classification**: Precisely categorizes every read into `Wildtype`, `Substitution`, `Insertion`, `Deletion`, or `Mixed` mutations.
- **Standardized Stats**: Calculates Indel and Substitution rates using **Aligned Reads** as the denominator, ensuring biological accuracy.
- **Interactive Dashboard**:
  - **Mutation Distribution Pie Chart**: Visualize the breakdown of editing outcomes.
  - **Edit Rate Bar Charts**: Track efficiency across multiple samples and targets.
  - **Real-time Status Log**: Decoupled communication history with manual state tracking.
- **Resilient UI Mapping**: Optimized frontend data pipelines that handle variations in backend naming conventions (snake_case vs camelCase).

## Tech Stack

- **Backend**: Python 3.9+, [FastAPI](https://fastapi.tiangolo.com/), [Biopython](https://biopython.org/), [Pydantic](https://docs.pydantic.dev/)
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
3. Install dependencies (Requires Biopython):
   ```bash
   pip install fastapi uvicorn biopython python-multipart
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
   source venv/bin/activate
   uvicorn api:app --reload --port 8000
   ```
   - **Main URL**: `http://localhost:8000`
   - **Swagger UI**: `http://localhost:8000/docs`

2. **Start Frontend**:
   ```bash
   cd crispr-frontend
   npx ng serve
   ```

3. Open your browser to `http://localhost:4200`.

## Example Usage

1. **Upload Files**: Drag and drop `.fastq` or `.fq` files.
2. **Define Targets**: Provide target IDs and reference sequences. The system will auto-detect the gRNA orientation.
3. **Analyze**: Click **Run Analysis**. The results section will automatically appear at the top once the first target is processed.
4. **Inspect**: Use the Pie Chart to see the mutation types and the detailed table for per-sample metrics.

## AI Usage Disclaimer

> [!NOTE]
> This project was developed with the assistance of AI coding agents. While AI contributed to logic implementations and dashboard styling, the architectural pivots (such as the orientation-aware alignment engine) were guided and verified by the developer to ensure scientific correctness.
