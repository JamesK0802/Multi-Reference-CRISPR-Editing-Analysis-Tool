from fastapi import FastAPI, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from typing import List
import os
import json
import shutil
import tempfile
import uuid
import time

# Import our perfectly separated backend logic
from run_local import process_files, process_files_multi

app = FastAPI(title="CRISPR Analysis API")

# Add CORS middleware to allow frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # For development, allow all origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Simple In-Memory Task Storage
tasks = {}

@app.get("/status/{task_id}")
async def get_task_status(task_id: str):
    # Log status check for debugging
    print(f"[DEBUG] Status checked for {task_id}")
    if task_id not in tasks:
        print(f"[ERROR] Task {task_id} not found in store.")
        raise HTTPException(status_code=404, detail="Task not found")
    return tasks[task_id]

# IMPORTANT: Change to regular 'def' to run in a threadpool and NOT block the event loop
def background_analysis(
    task_id: str,
    temp_dir: str,
    file_paths: List[str],
    target_payload: List[dict],
    data_type: str,
    phred_threshold: int,
    indel_threshold: float,
    is_multi_reference: bool = False,
    margin_threshold: float = 0.05
):
    print(f"[DEBUG] Background thread started for task {task_id}")
    try:
        def update_progress(percent: int, stage: str):
            print(f"[DEBUG] Task {task_id} progress: {percent}% - {stage}")
            tasks[task_id]["progress"] = percent
            tasks[task_id]["stage"] = stage

        # Immediate update to confirm the thread is alive
        update_progress(0, "Backend thread started")

        if is_multi_reference:
            results = process_files_multi(
                file_paths,
                target_payload,
                data_type=data_type,
                phred_threshold=phred_threshold,
                indel_threshold=indel_threshold,
                margin_threshold=margin_threshold,
                progress_callback=update_progress
            )
        else:
            results = process_files(
                file_paths, 
                target_payload,
                data_type=data_type,
                phred_threshold=phred_threshold,
                indel_threshold=indel_threshold,
                progress_callback=update_progress
            )
        
        tasks[task_id]["progress"] = 100
        tasks[task_id]["stage"] = "Completed"
        tasks[task_id]["result"] = results
        print(f"[DEBUG] Task {task_id} completed successfully.")
        
    except Exception as e:
        print(f"[ERROR] Task {task_id} failed: {str(e)}")
        tasks[task_id]["status"] = "failed"
        tasks[task_id]["error"] = str(e)
    finally:
        shutil.rmtree(temp_dir)
        print(f"[DEBUG] Temp dir {temp_dir} cleaned up.")

@app.post("/analyze")
async def run_analysis_endpoint(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    data_type: str = Form("single-end"),
    interest_region: int = Form(90), # Default 90
    phred_threshold: int = Form(10), # Default 10
    indel_threshold: float = Form(1.0),
    targets: str = Form(...),
    is_multi_reference: bool = Form(False),
    assignment_margin_threshold: float = Form(0.05)
):
    """
    Starts the CRISPR analysis and returns a task_id for progress polling.
    Uses CRISPRnano terminology (gRNA, reference_sequence, interest_region).
    """
    # Clamp Interest Region (60-120)
    clamped_interest = max(60, min(120, interest_region))
    if clamped_interest != interest_region:
        print(f"[DEBUG] Interest region clamped from {interest_region} to {clamped_interest}")

    print(f"[DEBUG] Analyze request received. Files: {len(files)}")
    task_id = str(uuid.uuid4())
    temp_dir = tempfile.mkdtemp()
    file_paths = []
    
    tasks[task_id] = {
        "status": "processing",
        "progress": 0,
        "stage": "Upload received",
        "result": None
    }

    try:
        # 1. Save uploaded files
        for file in files:
            file_path = os.path.join(temp_dir, file.filename)
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            file_paths.append(file_path)
        print(f"[DEBUG] Files saved to {temp_dir}")
            
        # 2. Parse targets
        try:
            raw_targets = json.loads(targets)
            if is_multi_reference:
                # payload is expected to be genes with targets inside
                # e.g., [{"gene": "GeneA", "sequence": "...", "targets": [{"target_id": "T1", "sgrna_seq": "...", "window_size": 90}]}]
                parsed_payload = raw_targets 
                print(f"[DEBUG] Parsed multi-reference payload with {len(parsed_payload)} genes.")
            else:
                parsed_payload = []
                for t in raw_targets:
                    parsed_payload.append({
                        "target_id": t.get("target_id"),
                        "sgrna_seq": t.get("gRNA"),
                        "reference_seq": t.get("reference_sequence"),
                        "window_size": clamped_interest # Use clamped value
                    })
                print(f"[DEBUG] Parsed {len(parsed_payload)} targets.")
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid format for 'targets' array.")

        # 3. Hand off to background task
        background_tasks.add_task(
            background_analysis,
            task_id, temp_dir, file_paths, parsed_payload, 
            data_type, phred_threshold, indel_threshold,
            is_multi_reference, assignment_margin_threshold
        )
        print(f"[DEBUG] Background task added to queue.")
        
        return {"task_id": task_id}
        
    except Exception as e:
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)
        print(f"[ERROR] Analyze request failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
