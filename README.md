# CRISPR Editing Analysis Tool

# Overview

The CRISPR Editing Analysis Tool is a high-performance analysis pipeline designed to quantify genome editing efficiency. It supports both **Single-Reference** and **Multi-Reference** (demultiplexing) workflows, allowing researchers to process mixed FASTQ files containing multiple genetic loci in a single run.

## Key Features

- **🧬 Unified Classification Core (New)**: A single, shared k-mer scoring engine (`classifier.py`) powers both analysis and benchmarking, ensuring 100% statistical parity.
- **📊 Classification Benchmark Tool**: A dedicated workflow to evaluate classification accuracy on train/test subsets with real-time performance metrics (Correct/Wrong/Ambiguous).
- **🧪 Multi-Reference Demultiplexing**: Automatically assigns reads to the most likely (Gene, Target) pair using strand-aware k-mer window scoring.
- **📈 Dual-Toggle Dashboard**: Independent "Analysis" and "Benchmark" modes that can be viewed side-by-side.
- **🔍 Unified Annotation Grid**: Horizontally scrollable sequence viewport with vertical alignment for mutation patterns across all groups.
- **📍 Precise Coordinate Mapping**: gRNA highlighting and cut-site (scissors) markers derived from unified target detection.

## Tech Stack

- **Backend**: Python 3.9+, [FastAPI](https://fastapi.tiangolo.com/), [Biopython](https://biopython.org/)
- **Frontend**: [Angular 21](https://angular.dev/), [Reactive Forms](https://angular.io/guide/reactive-forms), [Chart.js](https://www.chartjs.org/)
- **Core Engine**: Custom demultiplexing logic + Needle-style alignment wrapper.

## Project Structure

```bash
├── crispr_backend/
│   ├── core/
│   │   ├── classifier.py               # Shared classification & usability engine
│   │   ├── benchmark.py                # Train/test benchmarking logic
│   │   ├── multi_reference_assigner.py  # Unified demultiplexing wrapper
│   │   ├── aligner.py                   # Strand-aware alignment utilities
│   │   ├── analyzer.py                  # Mutation classification (Indels/Subs)
│   │   └── parser.py                    # FASTQ parsing
│   ├── api.py          # FastAPI endpoints (Analysis & Benchmark)
│   └── run_local.py    # Main orchestration pipeline
└── crispr-frontend/
    ├── src/app/
    │   ├── app.ts      # State management & payload transformation
    │   ├── app.html    # Hierarchical input & Tabbed results
    │   └── models/     # Multi-reference data models
```

## Installation & setup

### 1. Backend
```bash
cd crispr_backend
python -m venv venv
source venv/bin/activate
pip install fastapi uvicorn biopython python-multipart
```

### 2. Frontend
```bash
cd crispr-frontend
npm install
```

## Running the Tool

1.  **Start Backend**: `uvicorn api:app --reload --port 8000` (in `crispr_backend`)
2.  **Start Frontend**: `npx ng serve` (in `crispr-frontend`)
3.  Open `http://localhost:4200`

## Multi-Reference Analysis Guide

1.  **Toggle Mode**: Click the **🧬 Multi-Gene OFF** button to toggle it to **ON**.
2.  **Add Genes**: For each gene locus in your mixed FASTQ:
    - Enter the **Gene Name** and **Full Reference Sequence**.
    - Add one or more **Targets (gRNAs)** nested inside that gene.
3.  **Set Margin**: Adjust **Assignment Margin** (default 0.05). Higher values make read assignment more conservative.
4.  **Upload**: Select one or more `.fastq` files.
5.  **Analyze**: Watch the live progress status display the exact file, gene, and target being processed!

## AI Usage Disclaimer

> [!NOTE]
> This project was developed with the assistance of AI coding agents. The sophisticated multi-reference demultiplexing architecture and the hierarchical UI state management were evolved through agentic pair-programming to ensure high-quality, scientifically sound results.
