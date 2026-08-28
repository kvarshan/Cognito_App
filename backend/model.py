import numpy as np
import re
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.cluster import KMeans
from sklearn.decomposition import TruncatedSVD
import traceback

class MLEngine:
    def __init__(self, db_manager):
        self.db = db_manager
        self.qa_pipeline = None
        self.qa_pipeline_loaded = False

    def extract_snippets(self, text, query_terms, snippet_len=150):
        """
        Extracts snippets of text surrounding the query terms for search results highlighting.
        """
        if not query_terms or not text:
            return text[:snippet_len] + "..." if len(text) > snippet_len else text
            
        # Clean text spacing
        text_clean = re.sub(r'\s+', ' ', text).strip()
        
        # Find first occurrence of any query term
        best_idx = 0
        best_match_count = 0
        
        # Tokenize query terms
        terms = [t.lower() for t in query_terms if len(t) > 1]
        if not terms:
            return text_clean[:snippet_len] + "..." if len(text_clean) > snippet_len else text_clean
            
        words = text_clean.split()
        for idx in range(len(words)):
            chunk = " ".join(words[idx : idx + 20]).lower()
            match_count = sum(1 for term in terms if term in chunk)
            if match_count > best_match_count:
                best_match_count = match_count
                best_idx = idx
                
        # Construct snippet around best_idx
        start = max(0, best_idx - 10)
        end = min(len(words), best_idx + 25)
        
        snippet = " ".join(words[start:end])
        if start > 0:
            snippet = "... " + snippet
        if end < len(words):
            snippet = snippet + " ..."
            
        return snippet

    def train_model(self, user_id='', yield_progress=None):
        """
        Retrieves all documents for a specific user, trains a TF-IDF vectorizer, performs KMeans clustering,
        extracts key topic vocabulary terms for naming, projects vectors to 2D using SVD/PCA,
        and saves these coordinates & clusters back into SQLite.
        """
        docs = self.db.get_all_documents(user_id=user_id)
        num_docs = len(docs)
        
        if num_docs == 0:
            if yield_progress:
                yield_progress("No documents found in database. Scan a folder first!")
            return False
            
        if yield_progress:
            yield_progress(f"Starting training on {num_docs} documents...")
            
        try:
            # 1. Prepare texts
            texts = [d['content_text'] for d in docs]
            ids = [d['id'] for d in docs]
            
            # 2. Fit TF-IDF Vectorizer
            if yield_progress:
                yield_progress("Step 1/4: Initializing TF-IDF Vectorizer and building vocabulary...")
            
            # Use English stop words and sublinear TF scaling to damp extreme frequencies
            vectorizer = TfidfVectorizer(
                stop_words='english',
                max_features=2500,
                sublinear_tf=True,
                min_df=1 if num_docs < 3 else 2
            )
            
            tfidf_matrix = vectorizer.fit_transform(texts)
            vocab_size = len(vectorizer.vocabulary_)
            
            if yield_progress:
                yield_progress(f"Successfully extracted {vocab_size} vocabulary terms from corpus.")
                
            # Save vocabulary size in metadata
            self.db.set_metadata("vocab_size", vocab_size, user_id=user_id)
            
            # 3. Fit KMeans Clustering (unsupervised topic modeling)
            if yield_progress:
                yield_progress("Step 2/4: Training unsupervised KMeans clustering model...")
                
            # Dynamic cluster count selection
            num_clusters = min(max(2, num_docs // 3), 8)
            if num_docs < 2:
                num_clusters = 1
                
            if yield_progress:
                yield_progress(f"Configuring KMeans for K={num_clusters} distinct topic clusters.")
                
            if num_clusters > 1:
                kmeans = KMeans(
                    n_clusters=num_clusters,
                    random_state=42,
                    n_init=10,
                    max_iter=100
                )
                cluster_assignments = kmeans.fit_predict(tfidf_matrix)
                
                # Extract top terms per cluster to assign human-friendly names
                feature_names = vectorizer.get_feature_names_out()
                cluster_names = {}
                
                for k in range(num_clusters):
                    # Get indices of documents in this cluster
                    cluster_docs_idx = np.where(cluster_assignments == k)[0]
                    if len(cluster_docs_idx) == 0:
                        cluster_names[k] = f"Cluster {k+1}: General Topic"
                        continue
                        
                    # Calculate mean TF-IDF weights of words inside this cluster
                    cluster_vectors = tfidf_matrix[cluster_docs_idx]
                    mean_weights = np.asarray(cluster_vectors.mean(axis=0)).flatten()
                    
                    # Sort terms by weight
                    top_terms_idx = mean_weights.argsort()[::-1][:5]
                    top_terms = [feature_names[i] for i in top_terms_idx if mean_weights[i] > 0.0]
                    
                    if not top_terms:
                        cluster_names[k] = f"Topic {k+1} (General Docs)"
                    else:
                        cluster_names[k] = f"Topic {k+1}: " + ", ".join(top_terms)
                        
                    if yield_progress:
                        yield_progress(f"  [Cluster {k+1}] identified as: {cluster_names[k]}")
            else:
                cluster_assignments = [0] * num_docs
                cluster_names = {0: "Topic 1: General Archive"}
                if yield_progress:
                    yield_progress("Single cluster fallback due to small document volume.")
            
            # 4. Dimensionality Reduction (PCA via SVD)
            if yield_progress:
                yield_progress("Step 3/4: Projecting high-dimensional vectors to 2D relationships (PCA SVD)...")
                
            if num_docs >= 2:
                # Use TruncatedSVD for sparse matrix inputs, projecting to 2 dimensions
                svd = TruncatedSVD(n_components=2, random_state=42)
                coords_2d = svd.fit_transform(tfidf_matrix)
                
                # Normalize coordinates to [-100, 100] grid for beautiful canvas scaling
                x_vals = coords_2d[:, 0]
                y_vals = coords_2d[:, 1]
                
                x_min, x_max = x_vals.min(), x_vals.max()
                y_min, y_max = y_vals.min(), y_vals.max()
                
                # Avoid divide-by-zero if all documents lie on a single point
                x_denom = (x_max - x_min) if (x_max - x_min) > 1e-5 else 1.0
                y_denom = (y_max - y_min) if (y_max - y_min) > 1e-5 else 1.0
                
                # Map linearly to [-85, 85] (leaving padding for the map borders)
                norm_coords = []
                for x, y in zip(x_vals, y_vals):
                    nx = -85 + 170 * ((x - x_min) / x_denom)
                    ny = -85 + 170 * ((y - y_min) / y_denom)
                    # Add very slight jitter to avoid exact overlaps
                    nx += np.random.uniform(-2, 2)
                    ny += np.random.uniform(-2, 2)
                    norm_coords.append((nx, ny))
            else:
                norm_coords = [(0.0, 0.0)] * num_docs
                if yield_progress:
                    yield_progress("Set coordinates to origin (0, 0) for single file index.")
                    
            # 5. Save all findings back to DB
            if yield_progress:
                yield_progress("Step 4/4: Saving local model weights and properties to SQLite...")
                
            for idx, doc_id in enumerate(ids):
                cluster_id = int(cluster_assignments[idx])
                cluster_name = cluster_names[cluster_id]
                x_coord, y_coord = norm_coords[idx]
                
                self.db.update_document_coords_and_cluster(
                    doc_id=doc_id,
                    cluster_id=cluster_id,
                    cluster_name=cluster_name,
                    x=float(x_coord),
                    y=float(y_coord)
                )
                
            self.db.set_metadata("is_trained", 1, user_id=user_id)
            
            if yield_progress:
                yield_progress("Model training successfully completed completely offline!")
            return True
            
        except Exception as e:
            tb = traceback.format_exc()
            if yield_progress:
                yield_progress(f"Training failed: {e}\n{tb}")
            print(f"Error training model: {e}\n{tb}")
            return False

    def search(self, query, user_id='', cluster_filter=None, type_filter=None, filename_filter=None):
        """
        Performs vector-based cosine similarity search and keyword matching for a specific user.
        """
        docs = self.db.get_all_documents(user_id=user_id)
        if not docs:
            return []
            
        # Extract query terms
        query_terms = re.findall(r'\w+', query.lower())
        if not query_terms:
            # Empty query: return all documents or empty list
            return []
            
        # Get all indexed document texts
        texts = [d['content_text'] for d in docs]
        
        # Fit vectorizer temporarily to score cosine similarity
        vectorizer = TfidfVectorizer(stop_words='english', sublinear_tf=True)
        try:
            tfidf_matrix = vectorizer.fit_transform(texts)
            query_vec = vectorizer.transform([query])
            
            # Compute Cosine Similarity: Cos(A, B) = A . B / (||A|| ||B||)
            # tfidf_matrix is normalized so matrix multiplication gives cosine similarity directly
            similarities = (tfidf_matrix * query_vec.T).toarray().flatten()
        except Exception:
            # Fallback if vocabulary generation fails (e.g. single term mismatch)
            similarities = np.zeros(len(docs))
            
        results = []
        for idx, doc in enumerate(docs):
            # Apply Filters
            if filename_filter is not None and filename_filter.strip() != "":
                if filename_filter.lower().strip() not in doc['filename'].lower():
                    continue
            if cluster_filter is not None and doc['cluster_id'] != int(cluster_filter):
                continue
            if type_filter is not None and doc['filetype'] != type_filter:
                continue
                
            sim_score = float(similarities[idx])
            
            # Also calculate keyword match count for query boosting
            match_score = 0
            doc_text_lower = doc['content_text'].lower()
            for term in query_terms:
                if len(term) > 1:
                    matches = doc_text_lower.count(term)
                    # Boost score based on word frequency
                    match_score += matches * 0.05
                    
            total_relevance = sim_score + min(match_score, 0.5)
            
            # Skip completely irrelevant matches unless they search file name
            filename_match = any(term in doc['filename'].lower() for term in query_terms)
            if total_relevance <= 0.0 and not filename_match:
                continue
                
            if filename_match:
                total_relevance += 0.3 # Boost score for matching filename
                
            snippet = self.extract_snippets(doc['content_text'], query_terms)
            
            results.append({
                "id": doc["id"],
                "filepath": doc["filepath"],
                "filename": doc["filename"],
                "filetype": doc["filetype"],
                "filesize": doc["filesize"],
                "cluster_id": doc["cluster_id"],
                "cluster_name": doc["cluster_name"],
                "x_coord": doc["x_coord"],
                "y_coord": doc["y_coord"],
                "score": round(min(total_relevance, 1.0) * 100, 1), # Percentage score
                "snippet": snippet
            })
            
        # Sort by relevance score in descending order
        results.sort(key=lambda x: x["score"], reverse=True)
        return results

    def init_qa_pipeline(self):
        if self.qa_pipeline_loaded:
            return
        try:
            print("Initializing offline neural QA pipeline (Hugging Face Transformers)...")
            from transformers import pipeline
            self.qa_pipeline = pipeline(
                "question-answering", 
                model="distilbert-base-cased-distilled-squad",
                device=-1
            )
            print("Hugging Face QA Pipeline initialized successfully.")
        except Exception as e:
            print(f"Failed to load neural QA pipeline: {e}. Falling back to extractive text snippet QA.")
            self.qa_pipeline = None
        self.qa_pipeline_loaded = True

    def retrieve_best_context_chunk(self, docs, query):
        stop_words = {
            "the", "what", "who", "whom", "which", "where", "when", "why", "how", 
            "this", "that", "these", "those", "and", "but", "for", "are", "was", 
            "were", "been", "has", "have", "had", "does", "did", "not", "out", 
            "from", "with", "about", "into", "their", "them", "then", "there", 
            "they", "your", "its", "his", "her", "she", "him", "you", "our"
        }
        
        # Extract query terms
        raw_terms = re.findall(r'\w+', query.lower())
        query_terms = []
        for term in raw_terms:
            if len(term) > 2 and term not in stop_words:
                if term.endswith("'s"):
                    term = term[:-2]
                if term.endswith("s") and len(term) > 3 and not term.endswith("ss"):
                    term = term[:-1]
                if term:
                    query_terms.append(term)
                    
        if not query_terms:
            query_terms = [t for t in raw_terms if len(t) > 2]
            if not query_terms:
                if not docs:
                    return None
                doc = docs[0]
                return doc["content_text"][:600], doc
                
        best_score = -1.0
        best_chunk = ""
        best_doc = None
        
        for doc in docs:
            content = doc["content_text"] or ""
            chunks = []
            chunk_size = 1000
            overlap = 300
            if len(content) <= chunk_size:
                chunks.append(content)
            else:
                start = 0
                while start < len(content):
                    end = min(start + chunk_size, len(content))
                    chunks.append(content[start:end])
                    start += chunk_size - overlap
                    
            for chunk in chunks:
                score = 0.0
                chunk_lower = chunk.lower()
                for term in query_terms:
                    if term in chunk_lower:
                        count = chunk_lower.count(term)
                        score += 1.0 + (count * 0.2)
                        
                # boost filename match
                filename_lower = doc["filename"].lower()
                for term in query_terms:
                    if term in filename_lower:
                        score += 3.0
                        
                if score > best_score:
                    best_score = score
                    best_chunk = chunk
                    best_doc = doc
                    
        if best_doc and best_score > 0.0:
            return best_chunk, best_doc
        elif docs:
            doc = docs[0]
            return doc["content_text"][:600], doc
        return None

    def retrieve_top_context_chunks(self, docs, query, top_n=5):
        stop_words = {
            "the", "what", "who", "whom", "which", "where", "when", "why", "how", 
            "this", "that", "these", "those", "and", "but", "for", "are", "was", 
            "were", "been", "has", "have", "had", "does", "did", "not", "out", 
            "from", "with", "about", "into", "their", "them", "then", "there", 
            "they", "your", "its", "his", "her", "she", "him", "you", "our"
        }
        
        raw_terms = re.findall(r'\w+', query.lower())
        query_terms = []
        for term in raw_terms:
            if len(term) > 2 and term not in stop_words:
                if term.endswith("'s"):
                    term = term[:-2]
                if term.endswith("s") and len(term) > 3 and not term.endswith("ss"):
                    term = term[:-1]
                if term:
                    query_terms.append(term)
                    
        if not query_terms:
            query_terms = [t for t in raw_terms if len(t) > 2]
            
        candidates = []
        
        for doc in docs:
            content = doc["content_text"] or ""
            chunks = []
            chunk_size = 1000
            overlap = 300
            if len(content) <= chunk_size:
                chunks.append(content)
            else:
                start = 0
                while start < len(content):
                    end = min(start + chunk_size, len(content))
                    chunks.append(content[start:end])
                    start += chunk_size - overlap
                    
            for chunk in chunks:
                score = 0.0
                chunk_lower = chunk.lower()
                distinct_matches = 0
                for term in query_terms:
                    if term in chunk_lower:
                        distinct_matches += 1
                        count = chunk_lower.count(term)
                        score += 1.0 + (count * 0.2)
                        
                score += distinct_matches * 2.5
                
                filename_lower = doc["filename"].lower()
                for term in query_terms:
                    if term in filename_lower:
                        score += 3.0
                        
                if score > 0.0:
                    candidates.append((score, chunk, doc))
                    
        candidates.sort(key=lambda x: x[0], reverse=True)
        return candidates[:top_n]

    def extract_exact_heuristic_answer(self, context, question):
        q_lower = question.lower()
        c_clean = re.sub(r'\s+', ' ', context)
        
        # 1. Reg No Matcher
        if any(w in q_lower for w in ["reg", "register", "roll"]):
            match = re.search(r'(?i)(?:reg\s*no|register\s*no|register\s*number|roll\s*number|roll\s*no)\s*[:=-]?\s*(\d+)', c_clean)
            if match:
                return match.group(1).strip(), 98.0
                
        # 2. CGPA Matcher
        if "cgpa" in q_lower or "gpa" in q_lower:
            match = re.search(r'(?i)(?:cgpa|gpa)\s*[:=-]?\s*([0-9.]+)', c_clean)
            if match:
                return match.group(1).strip(), 98.0
                
        # 3. Name Matcher
        if "name" in q_lower:
            # Try specific structured headers first
            match = re.search(r'(?i)(?:mentee\s+name|student\s+name|name\s+of\s+person|name\s+of\s+mentee|name)\s*[:=-]\s*([A-Za-z\s]+?)(?=\s*(?:\r?\n|mentor|dept|department|course|reg|slot|\d|[:=-]|$))', context)
            if match:
                name_candidate = match.group(1).strip()
                if len(name_candidate) > 2:
                    return name_candidate, 95.0
            
            # General fallback name extraction
            match = re.search(r'(?i)name\s*[:=-]\s*([A-Za-z\s]{3,30})', c_clean)
            if match:
                return match.group(1).strip(), 90.0

        # 4. Subject Mark / Test Score Matcher (e.g. MLA0201 or Machine Learning)
        # Check if question contains terms related to marks/scores
        if any(w in q_lower for w in ["mark", "score", "grade", "result", "obtained"]):
            # Find subject code patterns like MLA0201
            code_match = re.search(r'([A-Za-z]{3}\d{4})', c_clean)
            if code_match:
                code = code_match.group(1)
                idx = c_clean.find(code)
                if idx != -1:
                    window = c_clean[idx:idx+250]
                    test_match = re.search(r'(?i)test\s*1\s*\d+\s*(\d+)', window)
                    if test_match:
                        return f"Test 1 Marks Obtained: {test_match.group(1)} (out of 20)", 95.0
                    
                    test2_match = re.search(r'(?i)test\s*2\s*\d+\s*(\d+)', window)
                    if test2_match:
                        return f"Test 2 Marks Obtained: {test2_match.group(1)} (out of 20)", 95.0
                    
                    # Look for standard slot marks format: MLA0201 Fundamentals of ML 94... Test 1 20 19
                    digits = re.findall(r'\b(\d{1,2})\b', window)
                    if len(digits) >= 2:
                        return f"Marks Obtained: {digits[1]}", 90.0
                        
            # Alternate subject title match (e.g. machine learning)
            if "machine learning" in q_lower or "mla0201" in q_lower:
                idx = c_clean.lower().find("machine learning")
                if idx == -1:
                    idx = c_clean.lower().find("mla0201")
                if idx != -1:
                    window = c_clean[idx:idx+250]
                    test_match = re.search(r'(?i)test\s*1\s*\d+\s*(\d+)', window)
                    if test_match:
                        return f"Test 1 Marks Obtained: {test_match.group(1)}", 95.0
                    test2_match = re.search(r'(?i)test\s*2\s*\d+\s*(\d+)', window)
                    if test2_match:
                        return f"Test 2 Marks Obtained: {test2_match.group(1)}", 95.0
                        
        return None

    def ask_question(self, question, user_id='', filename_filter=None, cluster_filter=None, type_filter=None):
        docs = self.db.get_all_documents(user_id=user_id)
        if not docs:
            return {
                "answer": "No documents found in database. Scan a folder first!",
                "sourceDocumentName": "System Info",
                "sourceDocumentPath": "",
                "score": 0.0,
                "contextSnippet": ""
            }
            
        if filename_filter is not None and filename_filter.strip() != "":
            docs = [d for d in docs if filename_filter.lower().strip() in d['filename'].lower()]
            if not docs:
                return {
                    "answer": f"No document matched the filename filter: '{filename_filter}'",
                    "sourceDocumentName": "Search Results",
                    "sourceDocumentPath": "",
                    "score": 0.0,
                    "contextSnippet": ""
                }
                
        if cluster_filter is not None and str(cluster_filter).strip() != "":
            try:
                c_id = int(cluster_filter)
                docs = [d for d in docs if d['cluster_id'] == c_id]
            except (ValueError, TypeError):
                pass
            if not docs:
                return {
                    "answer": f"No document matched the specified topic category.",
                    "sourceDocumentName": "Search Results",
                    "sourceDocumentPath": "",
                    "score": 0.0,
                    "contextSnippet": ""
                }

        if type_filter is not None and str(type_filter).strip() != "":
            docs = [d for d in docs if d['filetype'] == type_filter]
            if not docs:
                return {
                    "answer": f"No document matched the filetype filter: '{type_filter}'",
                    "sourceDocumentName": "Search Results",
                    "sourceDocumentPath": "",
                    "score": 0.0,
                    "contextSnippet": ""
                }
            
        # Get top candidate chunks for deep retrieval
        candidates = self.retrieve_top_context_chunks(docs, question, top_n=5)
        if not candidates:
            return {
                "answer": "No matching context found for your query terms.",
                "sourceDocumentName": "Search Results",
                "sourceDocumentPath": "",
                "score": 0.0,
                "contextSnippet": ""
            }
            
        # Try heuristic exact matching across candidates for ultra-precise answers
        for score, context, doc in candidates:
            exact_match = self.extract_exact_heuristic_answer(context, question)
            if exact_match:
                ans_text, confidence = exact_match
                return {
                    "answer": ans_text,
                    "sourceDocumentName": doc["filename"],
                    "sourceDocumentPath": doc["filepath"],
                    "score": confidence,
                    "contextSnippet": context
                }
            
        self.init_qa_pipeline()
        
        best_answer = None
        best_neural_score = -1.0
        
        # Deep Search: Pass candidates to neural QA model and score them
        for score, context, doc in candidates:
            if self.qa_pipeline:
                try:
                    res = self.qa_pipeline(question=question, context=context)
                    answer_text = res.get("answer", "").strip()
                    conf_score = float(res.get("score", 0.0)) * 100
                    
                    if answer_text and conf_score > best_neural_score:
                        best_neural_score = conf_score
                        best_answer = {
                            "answer": answer_text,
                            "sourceDocumentName": doc["filename"],
                            "sourceDocumentPath": doc["filepath"],
                            "score": round(conf_score, 1),
                            "contextSnippet": context
                        }
                except Exception as e:
                    print(f"Error during neural QA inference: {e}")
                    
        # Return best neural answer if found and confident
        if best_answer and best_answer["score"] > 1.0:
            return best_answer
            
        # If neural model failed or was unconfident, fallback to the top keyword matched chunk's sentence extractor
        top_score, context, doc = candidates[0]
        sentences = re.split(r'(?<=[.!?])\s+', context)
        best_sentence = ""
        best_s_score = 0.0
        
        raw_terms = re.findall(r'\w+', question.lower())
        query_terms = [t for t in raw_terms if len(t) > 2]
        
        for s in sentences:
            s_lower = s.lower()
            s_score = sum(1.0 for term in query_terms if term in s_lower)
            if s_score > best_s_score:
                best_s_score = s_score
                best_sentence = s
                
        answer_text = best_sentence.strip() if best_sentence else context[:200].strip() + "..."
        
        return {
            "answer": answer_text,
            "sourceDocumentName": doc["filename"],
            "sourceDocumentPath": doc["filepath"],
            "score": round(max(best_neural_score, best_s_score * 10.0), 1),
            "contextSnippet": context
        }
