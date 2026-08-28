import os
import subprocess
import socket
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional, List
import json
import asyncio

def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('10.254.254.254', 1))
        ip = s.getsockname()[0]
    except Exception:
        ip = '127.0.0.1'
    finally:
        s.close()
    return ip

from backend.database import DatabaseManager
from backend.indexer import DocumentIndexer
from backend.model import MLEngine

# Initialize DB, Indexer, and ML engine
db_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "cognito.db")
db = DatabaseManager(db_path)
indexer = DocumentIndexer(db)
ml_engine = MLEngine(db)

# Pre-load QA Pipeline in the background so the first query runs instantly
import threading
def preload_pipeline():
    try:
        ml_engine.init_qa_pipeline()
    except Exception as e:
        print(f"Preload failed: {e}")

threading.Thread(target=preload_pipeline, daemon=True).start()

app = FastAPI(title="Cognito API", description="Offline Document Intelligence Search API")

from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API models
class ScanRequest(BaseModel):
    directory_path: str
    user_id: str = ''

class OpenFolderRequest(BaseModel):
    filepath: str

@app.post("/api/scan")
def scan_directory(request: ScanRequest):
    dir_path = os.path.abspath(request.directory_path)
    user_id = request.user_id or ''
    if not os.path.exists(dir_path):
        raise HTTPException(status_code=400, detail=f"Directory path '{request.directory_path}' does not exist on your computer.")
        
    try:
        # Scan and load documents for this user
        stats_result = indexer.scan_directory(dir_path, user_id=user_id)
        # Automatically train the KMeans mapping model on new documents
        try:
            ml_engine.train_model(user_id=user_id)
        except Exception as train_err:
            print(f"Auto-training failed after scan: {train_err}")
        # Fetch updated statistics from SQLite for this user
        db_stats = db.get_stats(user_id=user_id)
        # Save directory path in DB metadata for this user
        db.set_metadata("indexed_directory", dir_path, user_id=user_id)
        
        return {
            "success": True,
            "directory": dir_path,
            "scan_results": stats_result,
            "db_stats": db_stats
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to scan directory: {str(e)}")

@app.get("/api/train")
def train_model(user_id: str = Query('')):
    """
    Triggers model training and streams logs to the frontend via Server-Sent Events (SSE).
    """
    def log_generator():
        log_queue = []
        
        def queue_logger(msg):
            log_queue.append(msg)
            
        # Run training in a background thread/task and collect logs
        try:
            # Inject queue logger
            success = ml_engine.train_model(user_id=user_id, yield_progress=queue_logger)
            
            # Flush queue to response
            for log in log_queue:
                yield f"data: {json.dumps({'message': log, 'status': 'training'})}\n\n"
                
            if success:
                yield f"data: {json.dumps({'message': 'Training completed successfully!', 'status': 'completed'})}\n\n"
            else:
                yield f"data: {json.dumps({'message': 'Training halted with issues.', 'status': 'failed'})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'message': f'Server error during training: {e}', 'status': 'failed'})}\n\n"

    return StreamingResponse(log_generator(), media_type="text/event-stream")

@app.get("/api/documents")
def get_documents(user_id: str = Query('')):
    try:
        docs = db.get_all_documents(user_id=user_id)
        stats = db.get_stats(user_id=user_id)
        
        # Clean up text content in lists to save bandwidth
        cleaned_docs = []
        for d in docs:
            cleaned = d.copy()
            # Truncate content text for general list
            if cleaned["content_text"] and len(cleaned["content_text"]) > 100:
                cleaned["content_text_preview"] = cleaned["content_text"][:100] + "..."
            else:
                cleaned["content_text_preview"] = cleaned["content_text"]
            del cleaned["content_text"]
            cleaned_docs.append(cleaned)
            
        return {
            "documents": cleaned_docs,
            "stats": stats,
            "is_trained": int(db.get_metadata("is_trained", 0, user_id=user_id)) == 1,
            "indexed_directory": db.get_metadata("indexed_directory", "", user_id=user_id)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/search")
def search_documents(
    q: str = Query(..., min_length=1),
    user_id: str = Query(''),
    cluster_id: Optional[int] = Query(None),
    filetype: Optional[str] = Query(None),
    filename: Optional[str] = Query(None)
):
    try:
        results = ml_engine.search(q, user_id=user_id, cluster_filter=cluster_id, type_filter=filetype, filename_filter=filename)
        return {"results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/preview")
def get_preview(id: int, user_id: str = Query('')):
    doc = db.get_document_by_id(id, user_id=user_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")
    return {
        "id": doc["id"],
        "filename": doc["filename"],
        "filepath": doc["filepath"],
        "filetype": doc["filetype"],
        "filesize": doc["filesize"],
        "cluster_name": doc["cluster_name"],
        "content": doc["content_text"],
        "indexed_at": doc["indexed_at"]
    }

@app.post("/api/open-folder")
def open_folder(request: OpenFolderRequest):
    filepath = request.filepath
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail=f"File path '{filepath}' does not exist on your machine.")
        
    try:
        # Windows command to open file explorer with the specific file selected
        filepath = os.path.normpath(filepath)
        subprocess.Popen(f'explorer /select,"{filepath}"')
        return {"success": True, "message": "Folder opened and file highlighted in Windows Explorer!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to open folder: {str(e)}")

# API sync & QA models
class PushDocument(BaseModel):
    name: str
    path: str
    sizeBytes: int
    extension: str
    content: str

class SyncPushRequest(BaseModel):
    documents: List[PushDocument]
    user_id: str = ''

@app.get("/api/sync/status")
def sync_status(user_id: str = Query('')):
    try:
        stats = db.get_stats(user_id=user_id)
        ip = get_local_ip()
        return {
            "success": True,
            "ip": ip,
            "port": 8000,
            "stats": stats,
            "is_trained": int(db.get_metadata("is_trained", 0, user_id=user_id)) == 1
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/sync/pull")
def sync_pull(user_id: str = Query('')):
    try:
        docs = db.get_all_documents(user_id=user_id)
        return {
            "success": True,
            "documents": docs
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/sync/push")
def sync_push(request: SyncPushRequest):
    user_id = request.user_id or ''
    try:
        count = 0
        for doc in request.documents:
            ext = doc.extension.upper()
            filetype = "Text (TXT)"
            if ext == "PDF":
                filetype = "PDF"
            elif ext == "DOCX":
                filetype = "Word (DOCX)"
            elif ext == "PPTX":
                filetype = "PowerPoint (PPTX)"
            elif ext == "MD":
                filetype = "Markdown (MD)"
                
            db.upsert_document(
                user_id=user_id,
                filepath=doc.path,
                filename=doc.name,
                filetype=filetype,
                filesize=doc.sizeBytes,
                content_text=doc.content
            )
            count += 1
            
        db.set_metadata("is_trained", 0, user_id=user_id)
        # Automatically train the KMeans mapping model on new sync items
        try:
            ml_engine.train_model(user_id=user_id)
        except Exception as train_err:
            print(f"Auto-training failed after sync push: {train_err}")
        
        return {
            "success": True,
            "message": f"Successfully pushed, indexed and projected {count} documents from mobile device!"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/qa")
def run_qa(
    q: str = Query(..., min_length=1),
    user_id: str = Query(''),
    filename: Optional[str] = Query(None),
    cluster_id: Optional[int] = Query(None),
    filetype: Optional[str] = Query(None)
):
    try:
        result = ml_engine.ask_question(
            q,
            user_id=user_id,
            filename_filter=filename,
            cluster_filter=cluster_id,
            type_filter=filetype
        )
        return {"result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Mount static files and direct index routing
frontend_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend")

@app.get("/")
def read_root():
    index_file = os.path.join(frontend_dir, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    else:
        raise HTTPException(status_code=404, detail=f"Frontend files missing at {index_file}")

# Mount static assets
if os.path.exists(os.path.join(frontend_dir, "css")):
    app.mount("/css", StaticFiles(directory=os.path.join(frontend_dir, "css")), name="css")
if os.path.exists(os.path.join(frontend_dir, "js")):
    app.mount("/js", StaticFiles(directory=os.path.join(frontend_dir, "js")), name="js")
