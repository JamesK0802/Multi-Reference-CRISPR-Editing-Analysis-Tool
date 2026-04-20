# CRISPR Editing Analysis Tool

### ✂️ 초등학생도 이해하는 유전자 가위 분석기 가이드

유전공학이나 전문 지식이 없어도 괜찮아요! 이 툴이 무엇을 하고, 각 설정이 무엇을 의미하는지 아주 쉽게 설명해 드릴게요.

---

#### 1. CRISPR(크리스퍼)가 뭐예요?
우리 몸속에는 **DNA**라고 불리는 아주 긴 '설계도'가 들어있어요. 이 설계도에 따라 우리 눈 색깔, 키 등이 결정되죠. 그런데 이 설계도에 오타가 있거나 고치고 싶은 부분이 있을 때, 전용 **'유전자 가위'**를 사용해서 그 부분을 싹둑 자를 수 있어요. 이게 바로 **CRISPR** 기술이에요!

#### 2. 이 프로그램은 어떤 일을 하나요?
가위로 DNA를 자르고 나면, 세포가 이걸 다시 붙이려고 노력해요. 하지만 붙이다 보면 실수를 할 때가 있죠! 
- 원래보다 조금 더 많이 붙이거나 (**삽입**)
- 조각을 잃어버리거나 (**결실**)
- 엉뚱한 조각으로 갈아끼우거나 (**치환**)

이 프로그램은 수억 개의 DNA 조각들을 슈퍼 컴퓨터처럼 빠르게 살펴보고, **"가위가 정확히 어디를 잘랐는지"** 그리고 **"세포가 고칠 때 어떤 실수를 얼마나 많이 했는지"**를 한눈에 보여주는 똑똑한 돋보기예요. 특히, **여러 유전자가 섞인 파일**에서도 어떤 조각이 어떤 유전자인지 척척 찾아내어 따로따로 분석할 수 있답니다!

---

#### 3. 설정값(Parameter)은 무슨 뜻인가요?
*   **Interest region (관심 영역)**: 사고가 난 지점(가위로 자른 곳) 주변을 얼마나 넓게 살펴볼지를 정하는 거예요. 보통 **90bp** 정도면 충분해요!
*   **Phred Threshold (품질 점수)**: 흐릿한 사진 대신 선명한 결과만 믿겠다는 기준이에요. 보통 **10점** 이상을 써요.
*   **Assignment Margin (할당 여유값)**: 여러 유전자 후보 중 하나를 고를 때, 얼마나 확실해야 그 유전자로 인정할지 정하는 거예요. 값이 클수록 "정말 확실한 것"만 골라내요.
*   **Indel Threshold (최소 빈도)**: 사소한 실수 말고, 전체의 **1%** 이상 일어난 굵직한 사건들만 보여주는 필터예요.

---

## Overview

The CRISPR Editing Analysis Tool is a high-performance analysis pipeline designed to quantify genome editing efficiency. It supports both **Single-Reference** and **Multi-Reference** (demultiplexing) workflows, allowing researchers to process mixed FASTQ files containing multiple genetic loci in a single run.

## Key Features

- **🧬 Multi-Reference Demultiplexing (New)**: Automatically assigns reads to the most likely gene/reference using strand-aware alignment. Ambiguous reads are safely excluded based on a configurable **Assignment Margin**.
- **📊 Hierarchical Gene-Target UI**: Define multiple genes, each with its own reference sequence and multiple sgRNA targets.
- **📈 Gene-Scoped Dashboard**: Navigate through results for different genes using a clean Tab-based interface. Each tab provides independent summary cards, charts, and annotation visuals.
- **⚡ Fine-Grained Progress System**: Real-time, smooth progress bar that tracks the exact stage of analysis:
  - FASTQ Parsing -> Read Assignment -> Per-Gene Analysis -> Per-Target Classification.
- **🔍 Unified Annotation Grid**: Horizontally scrollable sequence viewport with vertical alignment for mutation patterns across all groups.
- **📍 Precise Coordinate Mapping**: 1:1 character-to-pixel mapping for gRNA highlighting and cut-site (scissors) markers.
- **📐 Canonical Normalization**: Automatically normalizes all metrics to the forward direction of the reference, regardless of gRNA strand orientation.

## Tech Stack

- **Backend**: Python 3.9+, [FastAPI](https://fastapi.tiangolo.com/), [Biopython](https://biopython.org/)
- **Frontend**: [Angular 21](https://angular.dev/), [Reactive Forms](https://angular.io/guide/reactive-forms), [Chart.js](https://www.chartjs.org/)
- **Core Engine**: Custom demultiplexing logic + Needle-style alignment wrapper.

## Project Structure

```bash
├── crispr_backend/
│   ├── core/
│   │   ├── multi_reference_assigner.py  # Read demultiplexing logic
│   │   ├── aligner.py                   # Strand-aware alignment
│   │   ├── analyzer.py                  # Mutation classification
│   │   └── parser.py                    # FASTQ parsing
│   ├── api.py          # REST API & WebSocket-style status
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
