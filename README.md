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

이 프로그램은 수억 개의 DNA 조각들을 슈퍼 컴퓨터처럼 빠르게 살펴보고, **"가위가 정확히 어디를 잘랐는지"** 그리고 **"세포가 고칠 때 어떤 실수를 얼마나 많이 했는지"**를 한눈에 보여주는 똑똑한 돋보기예요.

---

#### 3. 설정값(Parameter)은 무슨 뜻인가요?
*   **Interest region (관심 영역)**: 사고가 난 지점(가위로 자른 곳) 주변을 얼마나 넓게 살펴볼지를 정하는 거예요. 사고 현장 바로 앞만 볼지, 동네 한 바퀴를 다 볼지를 결정해요. 보통 **90bp** 정도면 사고 현장을 충분히 파악할 수 있어요!
*   **Phred Threshold (품질 점수)**: 사진기가 흔들려서 찍힌 흐릿한 사진은 믿을 수 없겠죠? "이 정도 이상의 선명한 사진(데이터)만 분석해!"라고 기준을 정하는 거예요. 보통 **10점** 이상이면 믿을만해요.
*   **Indel Threshold (최소 빈도)**: 수많은 실수 중에서 딱 한 번 일어난 아주 작은 실수는 단순한 기계 오류일 수도 있어요. "적어도 전체의 **1%** 이상 발생한 굵직한 사건들만 보여줘!"라고 정하는 필터예요.

---

#### 4. 결과창의 단어들은 무엇을 의미하나요?
*   **Out-of-frame (해독 불가)**: DNA 설계도는 '3글자'씩 끊어서 읽어야 해요. 그런데 1글자나 2글자를 잃어버리면 뒤에 있는 모든 글자가 엉망진창이 되어서 읽을 수 없게 돼요. 유전자의 기능을 완전히 끄고 싶을 때 중요하게 봐요!
*   **In-frame (부분 변경)**: 다행히 딱 3글자(또는 6, 9글자) 단위로 글자를 잃어버리거나 얻은 거예요. 문장의 전체 뜻은 통하지만 단어 한두 개만 살짝 바뀐 상태죠.
*   **No Indel (변화 없음)**: 가위가 작동하지 않았거나, 아주 완벽하게 다시 붙어서 원래 설계도와 똑같은 상태예요.

---

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
