from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
import core.classifier as classifier
from fastapi.middleware.cors import CORSMiddleware
from typing import List
import os
import json
import shutil
import tempfile
import uuid
import time
import pcr_presets

# Initialize PCR Presets DB
pcr_presets.init_db()

# Import our analysis pipelines
from run_local import process_files, process_files_multi

app = FastAPI(title="CRISPR Analysis API")
app.include_router(pcr_presets.router, prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── In-Memory Task Storage ────────────────────────────────────────────────────
tasks = {}

@app.get("/status/{task_id}")
async def get_task_status(task_id: str):
    print(f"[DEBUG] Status checked for {task_id}")
    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    return tasks[task_id]


# ─────────────────────────────────────────────────────────────────────────────
# Existing CRISPR Analysis endpoint (unchanged)
# ─────────────────────────────────────────────────────────────────────────────

def background_analysis(
    task_id: str,
    temp_dir: str,
    file_paths: List[str],
    target_payload: List[dict],
    data_type: str,
    phred_threshold: int,
    indel_threshold: float,
    is_multi_reference: bool = False,
    margin_threshold: float = 0.05,
    analyze_ambiguous: bool = False,
    rescue_ambiguous: bool = False,
    rescue_threshold: int = 20
):
    print(f"[DEBUG] Background thread started for task {task_id}")
    try:
        def update_progress(percent: int, stage: str):
            tasks[task_id]["progress"] = percent
            tasks[task_id]["stage"] = stage

        update_progress(0, "Backend thread started")

        if is_multi_reference:
            results = process_files_multi(
                file_paths, target_payload,
                data_type=data_type,
                phred_threshold=phred_threshold,
                indel_threshold=indel_threshold,
                margin_threshold=margin_threshold,
                progress_callback=update_progress,
                analyze_ambiguous=analyze_ambiguous,
                rescue_ambiguous=rescue_ambiguous,
                rescue_threshold=rescue_threshold
            )
        else:
            results = process_files(
                file_paths, target_payload,
                data_type=data_type,
                phred_threshold=phred_threshold,
                indel_threshold=indel_threshold,
                progress_callback=update_progress
            )

        tasks[task_id]["progress"] = 100
        tasks[task_id]["stage"]    = "Completed"
        tasks[task_id]["result"]   = results
        print(f"[DEBUG] Task {task_id} completed.")

    except Exception as e:
        print(f"[ERROR] Task {task_id} failed: {str(e)}. import traceback; traceback.print_exc()")
        import traceback; traceback.print_exc()
        tasks[task_id]["status"] = "failed"
        tasks[task_id]["error"]  = str(e)
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)

@app.post("/analyze")
async def run_analysis_endpoint(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    data_type: str = Form("single-end"),
    interest_region: int = Form(90),
    phred_threshold: int = Form(10),
    indel_threshold: float = Form(1.0),
    targets: str = Form(...),
    is_multi_reference: bool = Form(False),
    assignment_margin_threshold: float = Form(0.05),
    analyze_ambiguous: bool = Form(False),
    rescue_ambiguous: bool = Form(False),
    rescue_threshold: int = Form(20)
):
    clamped_interest = max(60, min(120, interest_region))
    print(f"[DEBUG] /analyze — files: {len(files)}, multi_ref: {is_multi_reference}")
    task_id  = str(uuid.uuid4())
    temp_dir = tempfile.mkdtemp()
    file_paths = []

    tasks[task_id] = {"status": "processing", "progress": 0,
                      "stage": "Upload received", "result": None}

    try:
        for file in files:
            fp = os.path.join(temp_dir, file.filename)
            with open(fp, "wb") as buf:
                shutil.copyfileobj(file.file, buf)
            file_paths.append(fp)

        raw_targets = json.loads(targets)
        if is_multi_reference:
            parsed_payload = raw_targets
        else:
            parsed_payload = [
                {
                    "target_id":    t.get("target_id"),
                    "sgrna_seq":    t.get("gRNA"),
                    "reference_seq": t.get("reference_sequence"),
                    "window_size":  clamped_interest
                }
                for t in raw_targets
            ]

        background_tasks.add_task(
            background_analysis, task_id, temp_dir, file_paths,
            parsed_payload, data_type, phred_threshold,
            indel_threshold,
            is_multi_reference,
            assignment_margin_threshold,
            analyze_ambiguous,
            rescue_ambiguous,
            rescue_threshold
        )
        return {"task_id": task_id}

    except Exception as e:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# Benchmark endpoints (NEW — completely separate from CRISPR analysis)
# ─────────────────────────────────────────────────────────────────────────────

def _parse_benchmark_reads(file_path: str) -> List[tuple]:
    """Parse a FASTQ file and return list of (seq, qual) tuples."""
    from core.parser import parse_fastq
    return parse_fastq(file_path)


def background_benchmark(
    task_id: str,
    temp_dir: str,
    dataset: List[dict],          # [{gene, target, reference, grna, file_path}]
    phred_threshold: float,
    window: int,
    margin: float,
    subset: str,                  # 'train' | 'test'
    seed: int = 42
):
    """Background worker for benchmark run."""
    print(f"[BENCHMARK] Task {task_id} started — subset={subset}")
    try:
        from core.benchmark import run_benchmark

        def update_progress(pct: int, stage: str):
            tasks[task_id]["progress"] = pct
            tasks[task_id]["stage"]    = stage
            print(f"[BENCHMARK] {pct}% — {stage}")

        # Load reads for each dataset row
        enriched = []
        for i, row in enumerate(dataset):
            fp    = row["file_path"]
            reads = _parse_benchmark_reads(fp) if os.path.exists(fp) else []
            enriched.append({
                "gene":      row["gene"],
                "target":    row["target"],
                "reference": row["reference"],
                "grna":      row["grna"],
                "reads":     reads
            })
            update_progress(
                int((i + 1) / len(dataset) * 5),
                f"Loaded {len(reads):,} reads for {row['gene']} › {row['target']}"
            )

        result = run_benchmark(
            dataset=enriched,
            phred_threshold=phred_threshold,
            window=window,
            margin=margin,
            subset=subset,
            seed=seed,
            progress_callback=update_progress
        )

        tasks[task_id]["progress"] = 100
        tasks[task_id]["stage"]    = "Benchmark Complete"
        tasks[task_id]["result"]   = result
        print(f"[BENCHMARK] Task {task_id} complete.")

    except Exception as e:
        import traceback; traceback.print_exc()
        tasks[task_id]["status"] = "failed"
        tasks[task_id]["error"]  = str(e)
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


@app.post("/benchmark/split")
async def benchmark_split_preview(
    files: List[UploadFile] = File(...),
    dataset: str = Form(...)     # JSON: [{gene, target, reference, grna}] parallel to files[]
):
    """
    Fast preview: returns train/test read counts per row without running analysis.
    No task_id — responds synchronously.
    """
    from core.benchmark import run_split_preview

    temp_dir   = tempfile.mkdtemp()
    rows_meta  = json.loads(dataset)   # [{gene, target, reference, grna}]
    enriched   = []

    try:
        for i, (file, meta) in enumerate(zip(files, rows_meta)):
            fp = os.path.join(temp_dir, f"row_{i}_{file.filename}")
            with open(fp, "wb") as buf:
                shutil.copyfileobj(file.file, buf)
            reads = _parse_benchmark_reads(fp)
            enriched.append({
                "gene":    meta["gene"],
                "target":  meta["target"],
                "reference": meta["reference"],
                "grna":    meta["grna"],
                "reads":   reads
            })

        result = run_split_preview(enriched)
        return result

    except Exception as e:
        import traceback; traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


@app.post("/benchmark/run")
async def benchmark_run(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    dataset: str = Form(...),    # JSON: [{gene, target, reference, grna}] parallel to files[]
    phred: float = Form(10.0),
    window: int  = Form(90),
    margin: float = Form(0.05),
    subset: str  = Form("train"),
    seed: int    = Form(42)
):
    """
    Run classification benchmark on the train OR test subset.
    Returns a task_id for polling.
    """
    print(f"[BENCHMARK] /benchmark/run — subset={subset}, files={len(files)}")
    task_id  = str(uuid.uuid4())
    temp_dir = tempfile.mkdtemp()

    tasks[task_id] = {"status": "processing", "progress": 0,
                      "stage": "Uploading files…", "result": None}

    try:
        rows_meta = json.loads(dataset)
        dataset_with_paths = []

        for i, (file, meta) in enumerate(zip(files, rows_meta)):
            fp = os.path.join(temp_dir, f"row_{i}_{file.filename}")
            with open(fp, "wb") as buf:
                shutil.copyfileobj(file.file, buf)
            dataset_with_paths.append({
                "gene":      meta["gene"],
                "target":    meta["target"],
                "reference": meta["reference"],
                "grna":      meta["grna"],
                "file_path": fp
            })

        background_tasks.add_task(
            background_benchmark,
            task_id, temp_dir, dataset_with_paths,
            phred, window, margin, subset, seed
        )
        return {"task_id": task_id}

    except Exception as e:
        shutil.rmtree(temp_dir, ignore_errors=True)
        tasks[task_id]["status"] = "failed"
        tasks[task_id]["error"]  = str(e)
        raise HTTPException(status_code=500, detail=str(e))
