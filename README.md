# CRISPR Analysis Platform

# Overview

The CRISPR Analysis Platform is a high-performance, academic-grade desktop application designed to quantify genome editing efficiency from sequencing data. It supports a **Unified Multi-Reference** workflow, allowing researchers to process mixed or multiple FASTQ files across various genetic loci in a single run with granular result scoping and a dedicated result restoration viewer.

## Key Features

- **🌐 Multi-Page Academic Architecture (v1.6.0)**: Dedicated routes for Analysis, Benchmarking, and Result Viewing with a professional ANU Research School of Biology UI.
- **📂 Multi-File Result Scoping**: Switch between "All Merged" view and individual per-file analysis directly in the results dashboard.
- **🛡️ Enhanced Rescue Pipeline (v1.6.0)**: Advanced k-mer clustering with increased stringency (threshold=20) to reliably re-assign ambiguous reads.
- **📊 Result Viewer Tab**: "Restore Session" by dragging and dropping an exported Excel report—reconstruct entire dashboards without raw FASTQ files.
- **🧬 Unified Classification Core**: A shared k-mer scoring engine (`classifier.py`) powers both analysis and benchmarking, ensuring 100% statistical parity.
- **🔍 Auto-Centering Annotation Grid**: Horizontally scrollable sequence viewport that automatically focuses on the gRNA and cut-site for instant inspection.
- **🎨 Premium UI/UX**: Balanced metrics grid, smoothed progress animations, and responsive academic-focused layouts.

## Tech Stack

- **Backend**: Python 3.9+, [FastAPI](https://fastapi.tiangolo.com/), [Biopython](https://biopython.org/)
- **Frontend**: [Angular 21](https://angular.dev/), [Reactive Forms](https://angular.io/guide/reactive-forms), [Chart.js](https://www.chartjs.org/)
- **Desktop**: [Electron](https://www.electronjs.org/) (Stable v1.6.0 wrapper)
- **Core Engine**: Custom k-mer demultiplexing + SequenceMatcher-based indel classification.

## Project Structure

```bash
├── crispr_backend/
│   ├── core/
│   │   ├── classifier.py               # Shared classification engine
│   │   ├── multi_reference_assigner.py  # Unified demultiplexing
│   │   ├── aligner.py                   # Strand-aware alignment
│   │   ├── analyzer.py                  # Mutation classification (v1.5.0+)
│   │   └── benchmark.py                # Benchmarking algorithms
│   ├── api.py                          # FastAPI endpoints
│   └── run_local.py                    # Main pipeline & Rescue logic
└── crispr-frontend/
    ├── src/app/
    │   ├── pages/                      # Analysis, Benchmark, Result Viewer, Main
    │   ├── components/                 # Result Dashboard, Annotation Panel
    │   ├── services/                   # AppState (Reactive), ExcelExport, Analysis
    │   └── layouts/                    # Navigation & App Shell
```

## Running the Tool

1.  **Start Backend**: `uvicorn api:app --reload --port 8000` (in `crispr_backend`)
2.  **Start Frontend**: `npm start` (in `crispr-frontend`)
3.  Open `http://localhost:4200`

---

## Version History

### v1.6.0 - Academic Platform Refactor (2026-04-30)
- **Major Architecture**: Refactored into a proper **multi-page Angular app** with dedicated routing and a persistent top navigation bar.
- **UI/UX**: Implemented **ANU Research School of Biology** branding. Removed redundant icons and simplified the interface for a clean, academic aesthetic.
- **Algorithm**: Increased **Ambiguous Rescue Threshold** from 3 to 20. This ensures only robust clusters with at least 20 supporting reads are rescued, significantly improving classification reliability.
- **Stability**: Full migration to **Reactive State Management**. Used `BehaviorSubject` and explicit `NgZone` handling to solve UI freezing issues and ensure 100% reliable auto-updates in the Result Viewer.
- **Landing Page**: Added a professional "Main Page" to introduce the platform and its core capabilities.

### v1.5.0 - Result Persistence & Viewer (2026-04-30)
- **New Feature**: **Result Viewer Tab** added. Allows users to "Restore Session" by dragging and dropping an exported Excel report.
- **Data Fidelity**: Reports now include hidden metadata ensuring 100% fidelity when reloading results.
- **Bug Fix**: Resolved `Aligned Reads` denominator discrepancy; percentages now sum correctly across all categories.

### v1.4.0 - Ambiguous-Read Rescue Layer (2026-04-27)
- **New Feature**: **Ambiguous-Read Rescue Layer** using k-mer Jaccard similarity clustering.
- **UI (Tabs)**: Implemented "Edge-style" shrinking logic for gene tabs to handle large target counts gracefully.

### v1.3.0 - Desktop Stable (2026-04-23)
- **New Feature**: **Analyze Ambiguous Reads** toggle added.
- **Bug Fix**: Resolved `0 Unknown Error` on macOS by enforcing `127.0.0.1` IP communication.
- **Deployment**: Full Electron desktop packaging with bundled backend binary.

### v1.2.0 (2026-04-22)
- **UI Polish**: metrics grid reorganization (3x2), automatic annotation centering on cut sites.

### v1.1.0 (2026-04-20)
- **Backend**: Implemented strand-aware k-mer demultiplexing.

### v1.0.0 (2026-04-15)
- Initial release with integrated classification core and analysis dashboard.

---

## AI Usage Disclaimer

> [!NOTE]
> This project was developed with the assistance of AI coding agents (Antigravity). The sophisticated multi-reference demultiplexing architecture, hierarchical UI state management, and real-time reactive updates were evolved through agentic pair-programming to ensure high-performance, scientifically sound results.
