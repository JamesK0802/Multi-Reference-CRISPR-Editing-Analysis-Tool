# CRISPR Editing Analysis Tool

# Overview

The CRISPR Editing Analysis Tool is a high-performance analysis pipeline designed to quantify genome editing efficiency. It supports a **Unified Multi-Reference** workflow, allowing researchers to process mixed or multiple FASTQ files containing various genetic loci in a single run with granular result scoping.

## Key Features

- **📂 Multi-File Result Scoping**: Switch between "All Merged" view and individual per-file analysis directly in the results dashboard.
- **🧪 Analyze Ambiguous Reads (v1.3.0)**: Optional secondary analysis that runs classification logic on unassigned reads, providing insights into class-specific patterns within the ambiguous pool.
- **🖥️ Standalone Desktop App (v1.3.0)**: Integrated with Electron for cross-platform desktop usage with an embedded FastAPI backend.
- **🧬 Unified Classification Core**: A shared k-mer scoring engine (`classifier.py`) powers both analysis and benchmarking, ensuring 100% statistical parity.
- **📊 Classification Benchmark Tool**: Dedicated workflow to evaluate classification accuracy on train/test subsets with real-time performance metrics.
- **🔍 Auto-Centering Annotation Grid**: Horizontally scrollable sequence viewport that automatically focuses on the gRNA and cut-site (scissors) for instant inspection.
- **📍 Precise Coordinate Mapping**: gRNA highlighting and scissors markers derived from unified target detection.
- **🎨 Premium UX/UI**: Balanced 3x2 metrics grid, smoothed progress animations, and responsive dashboard layouts.

## Tech Stack

- **Backend**: Python 3.9+, [FastAPI](https://fastapi.tiangolo.com/), [Biopython](https://biopython.org/), [PyInstaller](https://pyinstaller.org/)
- **Frontend**: [Angular 21](https://angular.dev/), [Reactive Forms](https://angular.io/guide/reactive-forms), [Chart.js](https://www.chartjs.org/)
- **Desktop**: [Electron](https://www.electronjs.org/), [electron-builder](https://www.electron.build/)
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
    │   ├── app.ts      # Reactive state management (NgZone & CDR optimized)
    │   ├── app.html    # Hierarchical input & Scoped result tabs
    │   ├── app.css     # Premium UI tokens and responsive layouts
    │   └── models/     # Multi-reference data models
```

## Running the Tool

1.  **Start Backend**: `uvicorn api:app --reload --port 8000` (in `crispr_backend`)
2.  **Start Frontend**: `npm start` (in `crispr-frontend`)
3.  Open `http://localhost:4200`

## Analysis Guide

1.  **Configure Reference**: 
    - Add **Genes** (G1, G2...) and their **Reference Sequences**.
    - Add **Targets (T1, T2...)** nested inside each gene group. 
    - *Tip: If names are left blank, G1/T1 will be assigned automatically.*
2.  **Set Parameters**: 
    - Adjust **Assignment Margin (%)** (default 3%). Higher values make read assignment more conservative.
    - Set Indel/Phred thresholds as needed.
3.  **Upload & Analyze**: Select one or more `.fastq` files and click **Start CRISPR Analysis**.
4.  **Explore Results**:
    - Use the **Top-level Tabs** to switch between **All Merged** and **Individual File** results.
    - Use the **Gene Tabs** to drill down into specific loci.
    - Click rows in the summary table to update charts and the annotation view.

---

## Version History

### v1.3.0 - Desktop Stable (2026-04-23)
- **New Feature**: **Analyze Ambiguous Reads** toggle added. Allows secondary class-specific analysis on the unassigned read pool.
- **Algorithm**: Overhauled **"All Merged"** data logic—now aggregates raw counts across all files and recalculates biological metrics (%, efficiency) for true global statistics.
- **Bug Fix (Critical)**: Resolved `0 Unknown Error` on macOS by enforcing `127.0.0.1` IP-based communication between Electron and the bundled FastAPI backend.
- **Stability**: Refactored backend entry point for `PyInstaller` compatibility using string-based uvicorn app references.
- **UI**: Integrated high-resolution **Premium App Icon**; added specialized reddish styling for ambiguous-derived results.
- **Deployment**: Full Electron desktop packaging (v1.1.0) with bundled backend binary.

### v1.2.0 (2026-04-22)
- **New Feature**: Added top-level **Result Scope Tabs** (Merged vs Per-File).
- **UX Refresh**: Repositioned parameter inputs into a single row; added automatic "G1, T1" fallback naming.
- **UI Polish**: metrics grid reorganization (3x2), automatic annotation centering on cut sites.
- **Stability**: Refactored frontend with `NgZone.run` and explicit change detection to fix UI update delays.
- **Terminology**: Standardized "Assignment Margin" as a percentage (%) across both Analysis and Benchmark modes.

### v1.1.0 (2026-04-20)
- **Backend**: Implemented strand-aware k-mer demultiplexing for multi-reference analysis.
- **Frontend**: Overhauled annotation panel to match CRISPRnano grid-style alignment and scrolling.

### v1.0.0 (2026-04-15)
- Initial release with integrated classification core and analysis dashboard.

---

## AI Usage Disclaimer

> [!NOTE]
> This project was developed with the assistance of AI coding agents (Antigravity). The sophisticated multi-reference demultiplexing architecture, hierarchical UI state management, and real-time reactive updates were evolved through agentic pair-programming to ensure high-performance, scientifically sound results.
