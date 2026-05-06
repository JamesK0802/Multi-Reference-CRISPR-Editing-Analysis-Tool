from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks, APIRouter
import core.classifier as classifier
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional
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

# ── Main API Router ──────────────────────────────────────────────────────────
api_router = APIRouter(prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── In-Memory Task Storage ────────────────────────────────────────────────────
tasks = {}

@api_router.get("/status/{task_id}")
async def get_task_status(task_id: str):
    print(f"[DEBUG] Status checked for {task_id}")
    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    return tasks[task_id]


# ─────────────────────────────────────────────────────────────────────────────
# Existing CRISPR Analysis endpoint
# ─────────────────────────────────────────────────────────────────────────────

def background_analysis(
    task_id: str,
    gene_name: str,
    target_seq: str,
    files: List[str],
    window_size: int,
    assignment_margin: int,
    indel_threshold: float,
    phred_threshold: int,
    rescue_ambiguous: bool
):
    try:
        tasks[task_id]["status"] = "running"
        tasks[task_id]["stage"] = "Processing FASTQ files..."
        
        # Determine if we should use multi-file processing or single
        # In the new UI, we always send as a list, but we might want to preserve the logic
        
        results = process_files_multi(
            gene_name=gene_name,
            target_seq=target_seq,
            fastq_paths=files,
            window_size=window_size,
            assignment_margin=assignment_margin,
            indel_threshold=indel_threshold,
            phred_threshold=phred_threshold,
            rescue_ambiguous=rescue_ambiguous,
            progress_callback=lambda p, s: (
                tasks[task_id].update({"progress": p, "stage": s})
            )
        )
        
        tasks[task_id]["status"] = "completed"
        tasks[task_id]["result"] = results
        tasks[task_id]["progress"] = 100
        tasks[task_id]["stage"] = "Done"
        
    except Exception as e:
        import traceback
        error_msg = f"{str(e)}\n{traceback.format_exc()}"
        print(f"[ERROR] Analysis failed: {error_msg}")
        tasks[task_id]["status"] = "failed"
        tasks[task_id]["error"] = str(e)
    finally:
        # Cleanup temp files
        for f in files:
            if os.path.exists(f) and "/tmp" in f:
                try: os.remove(f)
                except: pass

@api_router.post("/analyze")
async def run_analysis_endpoint(
    background_tasks: BackgroundTasks,
    gene_name: str = Form(...),
    target_seq: str = Form(...),
    files: List[UploadFile] = File(...),
    window_size: int = Form(20),
    assignment_margin: int = Form(2),
    indel_threshold: float = Form(1.0),
    phred_threshold: int = Form(20),
    rescue_ambiguous: bool = Form(True)
):
    task_id = str(uuid.uuid4())
    tasks[task_id] = {
        "status": "pending",
        "progress": 0,
        "stage": "Initializing...",
        "result": None
    }

    # Save uploaded files to temp locations
    temp_paths = []
    temp_dir = tempfile.gettempdir()
    for f in files:
        safe_name = f"{uuid.uuid4()}_{f.filename}"
        path = os.path.join(temp_dir, safe_name)
        with open(path, "wb") as buffer:
            shutil.copyfileobj(f.file, buffer)
        temp_paths.append(path)

    background_tasks.add_task(
        background_analysis,
        task_id,
        gene_name,
        target_seq,
        temp_paths,
        window_size,
        assignment_margin,
        indel_threshold,
        phred_threshold,
        rescue_ambiguous
    )

    return {"task_id": task_id}


# ─────────────────────────────────────────────────────────────────────────────
# Benchmark Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@api_router.post("/benchmark/split")
async def benchmark_split_preview(
    target_seq: str = Form(...),
    files: List[UploadFile] = File(...),
    test_ratio: float = Form(0.2)
):
    """Synchronous preview of train/test split counts."""
    # Temporarily save files to count reads
    total_reads = 0
    temp_dir = tempfile.gettempdir()
    for f in files:
        path = os.path.join(temp_dir, f"{uuid.uuid4()}_{f.filename}")
        with open(path, "wb") as buffer:
            shutil.copyfileobj(f.file, buffer)
        
        # Simple read count (every 4th line in FASTQ)
        with open(path, "r") as r:
            total_reads += sum(1 for line in r) // 4
        os.remove(path)

    test_count = int(total_reads * test_ratio)
    train_count = total_reads - test_count

    return {
        "total": total_reads,
        "train": train_count,
        "test": test_count
    }

def background_benchmark(
    task_id: str,
    target_seq: str,
    files: List[str],
    test_ratio: float,
    window_size: int,
    phred_threshold: int
):
    try:
        from core.benchmark import run_benchmarking
        
        tasks[task_id]["status"] = "running"
        
        results = run_benchmarking(
            target_seq=target_seq,
            fastq_paths=files,
            test_ratio=test_ratio,
            window_size=window_size,
            phred_threshold=phred_threshold,
            progress_callback=lambda p, s: tasks[task_id].update({"progress": p, "stage": s})
        )

        tasks[task_id]["status"] = "completed"
        tasks[task_id]["result"] = results
        tasks[task_id]["progress"] = 100
    except Exception as e:
        import traceback
        print(traceback.format_exc())
        tasks[task_id]["status"] = "failed"
        tasks[task_id]["error"] = str(e)
    finally:
        for f in files:
            if os.path.exists(f): os.remove(f)

@api_router.post("/benchmark/run")
async def run_benchmark_endpoint(
    background_tasks: BackgroundTasks,
    target_seq: str = Form(...),
    files: List[UploadFile] = File(...),
    test_ratio: float = Form(0.2),
    window_size: int = Form(20),
    phred_threshold: int = Form(20)
):
    task_id = str(uuid.uuid4())
    tasks[task_id] = {
        "status": "pending",
        "progress": 0,
        "stage": "Queueing benchmark...",
        "result": None
    }

    temp_paths = []
    temp_dir = tempfile.gettempdir()
    for f in files:
        path = os.path.join(temp_dir, f"{uuid.uuid4()}_{f.filename}")
        with open(path, "wb") as buffer:
            shutil.copyfileobj(f.file, buffer)
        temp_paths.append(path)

    background_tasks.add_task(
        background_benchmark,
        task_id,
        target_seq,
        temp_paths,
        test_ratio,
        window_size,
        phred_threshold
    )

    return {"task_id": task_id}


# ─────────────────────────────────────────────────────────────────────────────
# Include Routers
# ─────────────────────────────────────────────────────────────────────────────

# Include PCR presets router into our api_router
api_router.include_router(pcr_presets.router)

# Include the main api_router into the app
app.include_router(api_router)

# ── Legacy Redirects (Optional) ──────────────────────────────────────────────
@app.get("/status/{task_id}", include_in_schema=False)
async def legacy_status(task_id: str):
    return await get_task_status(task_id)

@app.post("/analyze", include_in_schema=False)
async def legacy_analyze(
    background_tasks: BackgroundTasks,
    gene_name: str = Form(...),
    target_seq: str = Form(...),
    files: List[UploadFile] = File(...),
    window_size: int = Form(20),
    assignment_margin: int = Form(2),
    indel_threshold: float = Form(1.0),
    phred_threshold: int = Form(20),
    rescue_ambiguous: bool = Form(True)
):
    return await run_analysis_endpoint(
        background_tasks, gene_name, target_seq, files,
        window_size, assignment_margin, indel_threshold, phred_threshold, rescue_ambiguous
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
