from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List
import os

# Import our perfectly separated backend logic
from run_local import process_directory

app = FastAPI(title="CRISPR Analysis API")

# Define the expected structure for a single target
class TargetModel(BaseModel):
    target_id: str
    reference_seq: str
    sgrna_seq: str
    window_size: int = 20

class AnalysisRequest(BaseModel):
    fastq_dir: str
    data_type: str = "single-end"
    window_size: int = 20
    phred_threshold: int = 30
    indel_threshold: float = 1.0
    targets: List[TargetModel]

@app.post("/analyze")
def run_analysis_endpoint(request: AnalysisRequest):
    """
    Kicks off the CRISPR FASTQ analysis pipeline.
    """
    try:
        # Validate directory existence early
        if not os.path.isdir(request.fastq_dir):
            raise HTTPException(status_code=400, detail=f"Directory '{request.fastq_dir}' not found.")
            
        # Convert Pydantic models back to simple dicts for our analyzer loop
        target_dicts = [t.dict() for t in request.targets]
        
        # Immediately apply global window_size
        for t in target_dicts:
            t["window_size"] = request.window_size
        
        # Call the exact same core pipeline we built in previous phases
        results = process_directory(
            request.fastq_dir, 
            target_dicts,
            data_type=request.data_type,
            phred_threshold=request.phred_threshold,
            indel_threshold=request.indel_threshold
        )
        
        return results
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
