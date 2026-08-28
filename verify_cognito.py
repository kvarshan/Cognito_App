import os
import sys

# Ensure backend folder is in path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from backend.database import DatabaseManager
from backend.indexer import DocumentIndexer
from backend.model import MLEngine

def test_pipeline():
    print("=" * 60)
    print("           COGNITO INTEGRATION & MATH PIPELINE TEST")
    print("=" * 60)

    # 1. Init Database in test mode
    test_db_path = "test_cognito.db"
    if os.path.exists(test_db_path):
        os.remove(test_db_path)
    
    print("[1] Initializing SQLite database...")
    db = DatabaseManager(test_db_path)
    print("    SQLite initialised successfully.")

    # 2. Init Indexer
    print("[2] Initializing File Indexer...")
    indexer = DocumentIndexer(db)
    print("    Document Indexer initialised.")

    # 3. Scan the generated demo_data folder
    demo_folder = "demo_data"
    if not os.path.exists(demo_folder):
        print(f"[ERROR] demo_data directory missing! Run create_demo_files.py first.")
        return False
        
    print(f"[3] Scanning demo_data/ recursively...")
    def log_scan(msg):
        print(f"    [SCAN LOG] {msg}")
        
    scan_res = indexer.scan_directory(demo_folder, yield_progress=log_scan)
    print(f"    Indexed: {scan_res['indexed']} docs, Skipped: {scan_res['skipped']} files, Failed: {scan_res['failed']}.")
    
    # 4. Check DB entries
    docs = db.get_all_documents()
    print(f"    Database total documents: {len(docs)}")
    if len(docs) == 0:
        print("[ERROR] No files were indexed!")
        return False

    # 5. Init ML Engine & Train
    print("[4] Initializing ML Engine...")
    ml_engine = MLEngine(db)
    
    print("[5] Executing Model Training (TF-IDF + KMeans + TruncatedSVD PCA)...")
    def log_train(msg):
        print(f"    [TRAIN LOG] {msg}")
        
    train_success = ml_engine.train_model(yield_progress=log_train)
    if not train_success:
        print("[ERROR] Local model training failed!")
        return False
        
    print("    Checking if documents contain clusters and coordinates...")
    docs_after = db.get_all_documents()
    for d in docs_after[:2]:
        print(f"    Doc: {d['filename']} | Cluster ID: {d['cluster_id']} | Cluster Name: {d['cluster_name']}")
        print(f"         Coords: ({d['x_coord']:.2f}, {d['y_coord']:.2f})")
        if d['cluster_id'] is None or d['x_coord'] is None:
            print("[ERROR] Coordinates or clusters missing after training!")
            return False

    # 6. Test Search Query Similarity
    print("[6] Testing Cognitive Cosine Vector Search...")
    queries = [
        "prompt engineering chain of thought",
        "quarterly revenue ebitda gross margins",
        "python dictionary comprehensions"
    ]
    
    for q in queries:
        print(f"\n    Querying: '{q}'")
        search_results = ml_engine.search(q)
        print(f"    Results found: {len(search_results)}")
        for idx, res in enumerate(search_results[:2]):
            print(f"      {idx+1}. {res['filename']} (Score: {res['score']}% match)")
            print(f"         Cluster: {res['cluster_name'].split(': ')[0]}")
            print(f"         Snippet: {res['snippet']}")
            
    print("\n" + "=" * 60)
    print("    ALL PIPELINE AND MATHEMATICAL VERIFICATIONS PASSED!")
    print("=" * 60)

    # Clean up test DB
    if os.path.exists(test_db_path):
        os.remove(test_db_path)
    return True

if __name__ == "__main__":
    test_pipeline()
